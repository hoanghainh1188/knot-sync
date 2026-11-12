import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  documentId,
  type Document,
  type DocumentType,
  type FileEntry,
  type ScanIssue,
} from "@hoanghainh/knot-sync-core";

const SCHEMA_VERSION = 1;

/** Default documents per transaction for {@link Store.upsertDocuments}. */
export const DEFAULT_UPSERT_CHUNK = 500;

export interface UpsertDocumentsOptions {
  /** Max documents per BEGIN/COMMIT (default {@link DEFAULT_UPSERT_CHUNK}). */
  chunkSize?: number;
}

export interface OptimizeResult {
  ftsOptimized: true;
  /** Raw `wal_checkpoint` result row when available. */
  checkpoint: unknown;
}

export interface PruneResult {
  pruned: number;
  prunedIds: string[];
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);

-- Inventory from "scan": one row per file, replaced on every scan.
CREATE TABLE IF NOT EXISTS files (
  source_id  TEXT NOT NULL,
  rel_path   TEXT NOT NULL,
  abs_path   TEXT NOT NULL,
  ext        TEXT NOT NULL,
  type       TEXT NOT NULL,
  size       INTEGER NOT NULL,
  mtime_ms   INTEGER NOT NULL,
  hash       TEXT,
  scanned_at TEXT NOT NULL,
  PRIMARY KEY (source_id, rel_path)
);
CREATE INDEX IF NOT EXISTS idx_files_hash ON files(hash);

CREATE TABLE IF NOT EXISTS scan_issues (
  source_id TEXT NOT NULL,
  path      TEXT NOT NULL,
  code      TEXT NOT NULL,
  message   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS run_issues (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id   TEXT NOT NULL DEFAULT '',
  path        TEXT NOT NULL,
  code        TEXT NOT NULL,
  message     TEXT NOT NULL,
  recorded_at TEXT NOT NULL
);

-- Normalized documents from "run".
CREATE TABLE IF NOT EXISTS documents (
  id            TEXT PRIMARY KEY,
  source_id     TEXT NOT NULL,
  type          TEXT NOT NULL,
  title         TEXT NOT NULL,
  content       TEXT NOT NULL,
  tables_json   TEXT NOT NULL,
  metadata_json TEXT NOT NULL,
  pii_json      TEXT NOT NULL,
  guard_json    TEXT NOT NULL DEFAULT '[]',
  hash          TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

-- Full-text index. "trigram" works for Japanese / Vietnamese without a word splitter.
CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(
  title, content,
  content='documents', content_rowid='rowid',
  tokenize='trigram'
);
CREATE TRIGGER IF NOT EXISTS documents_ai AFTER INSERT ON documents BEGIN
  INSERT INTO documents_fts(rowid, title, content) VALUES (new.rowid, new.title, new.content);
END;
CREATE TRIGGER IF NOT EXISTS documents_ad AFTER DELETE ON documents BEGIN
  INSERT INTO documents_fts(documents_fts, rowid, title, content)
  VALUES ('delete', old.rowid, old.title, old.content);
END;
CREATE TRIGGER IF NOT EXISTS documents_au AFTER UPDATE ON documents BEGIN
  INSERT INTO documents_fts(documents_fts, rowid, title, content)
  VALUES ('delete', old.rowid, old.title, old.content);
  INSERT INTO documents_fts(rowid, title, content) VALUES (new.rowid, new.title, new.content);
END;
`;

export interface TypeStat {
  type: DocumentType;
  count: number;
  bytes: number;
}

export interface SourceStats {
  sourceId: string;
  fileCount: number;
  totalBytes: number;
  byType: TypeStat[];
  /** Groups of files with identical bytes. */
  duplicateGroups: number;
  /** Files that are copies (group size - 1, summed). */
  duplicateFiles: number;
  /** Bytes that could be saved by removing copies. */
  duplicateBytes: number;
  oldFiles: number;
  emptyFiles: number;
  issues: number;
  scannedAt: string | null;
}

export interface DuplicateGroup {
  hash: string;
  size: number;
  paths: string[];
}

export interface SearchHit {
  id: string;
  sourceId: string;
  type: DocumentType;
  title: string;
  snippet: string;
}

/** Optional filters for {@link Store.search}. */
export interface SearchOptions {
  limit?: number;
  sourceId?: string;
  type?: DocumentType | string;
}

export type GuardRiskLevel = "none" | "low" | "medium" | "high";

export interface RunIssueInput {
  sourceId?: string;
  path: string;
  code: string;
  message: string;
}

export interface RunIssueRecord {
  sourceId: string;
  path: string;
  code: string;
  message: string;
  recordedAt: string;
}

export interface ScanIssueRecord extends ScanIssue {
  sourceId: string;
}

export interface SanitizedDocumentSummary {
  id: string;
  sourceId: string;
  type: DocumentType;
  title: string;
  updatedAt: string;
  snippet: string;
  piiCount: number;
  piiByType: Record<string, number>;
  guardRisk: GuardRiskLevel;
  guardCount: number;
  guardTypes: string[];
}

export interface SanitizedDocumentListOptions {
  q?: string;
  sourceId?: string;
  type?: DocumentType | string;
  guardRisk?: GuardRiskLevel | string;
  limit?: number;
  offset?: number;
}

export interface SanitizedDocumentListResult {
  total: number;
  limit: number;
  offset: number;
  documents: SanitizedDocumentSummary[];
}

const VALID_GUARD_RISKS = new Set<string>(["none", "low", "medium", "high"]);

function deriveGuardRisk(
  guard: Array<{ rule: string }>,
  metadata: Record<string, unknown>,
): GuardRiskLevel {
  const stored = metadata.guardRisk;
  if (typeof stored === "string" && VALID_GUARD_RISKS.has(stored)) {
    return stored as GuardRiskLevel;
  }
  if (metadata.guardInHidden === true) return "high";
  const families = new Set(guard.map((g) => g.rule).filter((r) => r.startsWith("instruction-")));
  if (families.size >= 2) return "high";
  if (families.size === 1) return "medium";
  if (
    guard.some(
      (g) =>
        g.rule === "controls-flood" ||
        g.rule === "base64-payload" ||
        g.rule === "md-exfil",
    )
  ) {
    return "medium";
  }
  if (guard.some((g) => g.rule === "controls") || guard.length > 0) return "low";
  return "none";
}

function summarizeDocumentRow(
  row: Record<string, string>,
  terms: string[],
): SanitizedDocumentSummary {
  const pii = JSON.parse(row.pii_json || "[]") as Array<{ rule: string }>;
  const guard = row.guard_json ? (JSON.parse(row.guard_json) as Array<{ rule: string }>) : [];
  const metadata = JSON.parse(row.metadata_json || "{}") as Record<string, unknown>;
  const piiByType: Record<string, number> = {};
  for (const finding of pii) {
    const key = typeof finding.rule === "string" && finding.rule ? finding.rule : "unknown";
    piiByType[key] = (piiByType[key] ?? 0) + 1;
  }
  const guardTypes = [...new Set(guard.map((g) => g.rule).filter(Boolean))];
  const content = (row.content ?? "").trim();
  const snippet =
    terms.length > 0
      ? snippetOf(content, terms, 180)
      : content.length > 400
        ? `${content.slice(0, 400)}…`
        : content;

  return {
    id: row.id!,
    sourceId: row.source_id!,
    type: row.type as DocumentType,
    title: row.title!,
    updatedAt: row.updated_at!,
    snippet,
    piiCount: pii.length,
    piiByType,
    guardRisk: deriveGuardRisk(guard, metadata),
    guardCount: guard.length,
    guardTypes,
  };
}

function rowToDocument(row: Record<string, string>): Document {
  return {
    id: row.id!,
    sourceId: row.source_id!,
    type: row.type as DocumentType,
    title: row.title!,
    content: row.content!,
    tables: JSON.parse(row.tables_json!),
    metadata: JSON.parse(row.metadata_json!),
    pii: JSON.parse(row.pii_json!),
    guard: row.guard_json ? JSON.parse(row.guard_json) : [],
    hash: row.hash!,
  };
}

function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (c) => `\\${c}`);
}

function snippetOf(content: string, terms: string[], width = 80): string {
  const lower = content.toLowerCase();
  let at = -1;
  for (const t of terms) {
    at = lower.indexOf(t.toLowerCase());
    if (at >= 0) break;
  }
  if (at < 0) return content.slice(0, width * 2);
  const start = Math.max(0, at - width);
  const end = Math.min(content.length, at + width);
  return `${start > 0 ? "…" : ""}${content.slice(start, end)}${end < content.length ? "…" : ""}`;
}

export class Store {
  readonly db: DatabaseSync;

  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
    this.db.exec(SCHEMA);
    this.ensureGuardColumn();
    this.db
      .prepare("INSERT OR REPLACE INTO meta(key, value) VALUES ('schema_version', ?)")
      .run(String(SCHEMA_VERSION));
  }

  /** Older stores created before guard_json need an ALTER. */
  private ensureGuardColumn(): void {
    const cols = this.db.prepare("PRAGMA table_info(documents)").all() as Array<{
      name: string;
    }>;
    if (cols.some((c) => c.name === "guard_json")) return;
    this.db.exec(
      "ALTER TABLE documents ADD COLUMN guard_json TEXT NOT NULL DEFAULT '[]'",
    );
  }

  close(): void {
    this.db.close();
  }

  private tx<T>(fn: () => T): T {
    this.db.exec("BEGIN");
    try {
      const result = fn();
      this.db.exec("COMMIT");
      return result;
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }
  }

  /** Replace the whole inventory of one source with a fresh scan. */
  replaceScan(sourceId: string, files: FileEntry[], issues: ScanIssue[]): void {
    const scannedAt = new Date().toISOString();
    this.tx(() => {
      this.db.prepare("DELETE FROM files WHERE source_id = ?").run(sourceId);
      this.db.prepare("DELETE FROM scan_issues WHERE source_id = ?").run(sourceId);
      const ins = this.db.prepare(
        `INSERT INTO files (source_id, rel_path, abs_path, ext, type, size, mtime_ms, hash, scanned_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      for (const f of files) {
        ins.run(f.sourceId, f.relPath, f.absPath, f.ext, f.type, f.size, f.mtimeMs, f.hash, scannedAt);
      }
      const insIssue = this.db.prepare(
        "INSERT INTO scan_issues (source_id, path, code, message) VALUES (?, ?, ?, ?)",
      );
      for (const i of issues) insIssue.run(i.sourceId, i.path, i.code, i.message);
      this.db
        .prepare("INSERT OR REPLACE INTO meta(key, value) VALUES (?, ?)")
        .run(`scanned_at:${sourceId}`, scannedAt);
    });
  }

  stats(sourceId: string, oldFileYears: number, now = Date.now()): SourceStats {
    const oldBefore = now - oldFileYears * 365.25 * 24 * 3600 * 1000;
    const totals = this.db
      .prepare(
        `SELECT COUNT(*) AS n, COALESCE(SUM(size), 0) AS bytes,
                SUM(CASE WHEN mtime_ms < ? THEN 1 ELSE 0 END) AS old,
                SUM(CASE WHEN size = 0 THEN 1 ELSE 0 END) AS empty
         FROM files WHERE source_id = ?`,
      )
      .get(oldBefore, sourceId) as { n: number; bytes: number; old: number | null; empty: number | null };

    const byType = this.db
      .prepare(
        `SELECT type, COUNT(*) AS count, SUM(size) AS bytes
         FROM files WHERE source_id = ? GROUP BY type ORDER BY count DESC, type`,
      )
      .all(sourceId) as unknown as TypeStat[];

    // Empty files all share one hash; they are reported separately, not as duplicates.
    const dup = this.db
      .prepare(
        `SELECT COUNT(*) AS groups, COALESCE(SUM(n - 1), 0) AS files, COALESCE(SUM((n - 1) * size), 0) AS bytes
         FROM (SELECT hash, COUNT(*) AS n, MAX(size) AS size FROM files
               WHERE source_id = ? AND hash IS NOT NULL AND size > 0
               GROUP BY hash HAVING n > 1)`,
      )
      .get(sourceId) as { groups: number; files: number; bytes: number };

    const issues = this.db
      .prepare("SELECT COUNT(*) AS n FROM scan_issues WHERE source_id = ?")
      .get(sourceId) as { n: number };

    const scannedAt = this.db
      .prepare("SELECT value FROM meta WHERE key = ?")
      .get(`scanned_at:${sourceId}`) as { value: string } | undefined;

    return {
      sourceId,
      fileCount: totals.n,
      totalBytes: totals.bytes,
      byType,
      duplicateGroups: dup.groups,
      duplicateFiles: dup.files,
      duplicateBytes: dup.bytes,
      oldFiles: totals.old ?? 0,
      emptyFiles: totals.empty ?? 0,
      issues: issues.n,
      scannedAt: scannedAt?.value ?? null,
    };
  }

  duplicateGroups(sourceId: string, limit = 20): DuplicateGroup[] {
    const groups = this.db
      .prepare(
        `SELECT hash, MAX(size) AS size, COUNT(*) AS n FROM files
         WHERE source_id = ? AND hash IS NOT NULL AND size > 0
         GROUP BY hash HAVING n > 1 ORDER BY size * (n - 1) DESC LIMIT ?`,
      )
      .all(sourceId, limit) as { hash: string; size: number }[];
    const pathsOf = this.db.prepare(
      "SELECT rel_path FROM files WHERE source_id = ? AND hash = ? ORDER BY rel_path",
    );
    return groups.map((g) => ({
      hash: g.hash,
      size: g.size,
      paths: (pathsOf.all(sourceId, g.hash) as { rel_path: string }[]).map((r) => r.rel_path),
    }));
  }

  /** Inventory files from the last scan, optionally filtered by source. */
  listFiles(sourceId?: string): FileEntry[] {
    const rows = (
      sourceId === undefined
        ? this.db
            .prepare(
              `SELECT source_id, rel_path, abs_path, ext, type, size, mtime_ms, hash
               FROM files ORDER BY source_id, rel_path`,
            )
            .all()
        : this.db
            .prepare(
              `SELECT source_id, rel_path, abs_path, ext, type, size, mtime_ms, hash
               FROM files WHERE source_id = ? ORDER BY rel_path`,
            )
            .all(sourceId)
    ) as Record<string, string | number | null>[];

    return rows.map((r) => ({
      sourceId: String(r.source_id),
      relPath: String(r.rel_path),
      absPath: String(r.abs_path),
      ext: String(r.ext),
      type: r.type as DocumentType,
      size: Number(r.size),
      mtimeMs: Number(r.mtime_ms),
      hash: r.hash === null || r.hash === undefined ? null : String(r.hash),
    }));
  }

  /** Document for a source + relative path, or null. */
  getDocumentByLocation(sourceId: string, relPath: string): Document | null {
    return this.getDocument(documentId(sourceId, relPath));
  }

  /**
   * True when an existing document was extracted from the same inventory file hash.
   * Missing hash on either side means "not unchanged" (must re-extract).
   */
  isUnchangedExtraction(file: FileEntry): boolean {
    if (!file.hash) return false;
    const doc = this.getDocumentByLocation(file.sourceId, file.relPath);
    if (!doc) return false;
    return doc.metadata.sourceFileHash === file.hash;
  }

  private insertDocumentStmt() {
    return this.db.prepare(
      `INSERT INTO documents (id, source_id, type, title, content, tables_json, metadata_json, pii_json, guard_json, hash, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         source_id = excluded.source_id, type = excluded.type, title = excluded.title,
         content = excluded.content, tables_json = excluded.tables_json,
         metadata_json = excluded.metadata_json, pii_json = excluded.pii_json,
         guard_json = excluded.guard_json,
         hash = excluded.hash, updated_at = excluded.updated_at`,
    );
  }

  private runInsertDocument(
    stmt: ReturnType<Store["insertDocumentStmt"]>,
    doc: Document,
  ): void {
    stmt.run(
      doc.id,
      doc.sourceId,
      doc.type,
      doc.title,
      doc.content,
      JSON.stringify(doc.tables),
      JSON.stringify(doc.metadata),
      JSON.stringify(doc.pii),
      JSON.stringify(doc.guard ?? []),
      doc.hash,
      new Date().toISOString(),
    );
  }

  upsertDocument(doc: Document): void {
    this.runInsertDocument(this.insertDocumentStmt(), doc);
  }

  /**
   * Upsert many documents in chunked transactions (default 500 per commit).
   * Semantics are partial-commit: an error mid-chunk rolls back **that chunk
   * only**; earlier successfully committed chunks remain in the store.
   */
  upsertDocuments(docs: Document[], options?: UpsertDocumentsOptions): void {
    if (docs.length === 0) return;
    const chunkSize = Math.max(1, options?.chunkSize ?? DEFAULT_UPSERT_CHUNK);
    const stmt = this.insertDocumentStmt();
    for (let i = 0; i < docs.length; i += chunkSize) {
      const chunk = docs.slice(i, i + chunkSize);
      this.tx(() => {
        for (const doc of chunk) this.runInsertDocument(stmt, doc);
      });
    }
  }

  /**
   * Compact the FTS5 index and truncate the WAL. Safe for local single-writer use;
   * stop concurrent `run`/`serve` writers first.
   */
  optimize(): OptimizeResult {
    this.db.exec("INSERT INTO documents_fts(documents_fts) VALUES('optimize');");
    const checkpoint = this.db.prepare("PRAGMA wal_checkpoint(TRUNCATE)").get();
    return { ftsOptimized: true, checkpoint };
  }

  /** True when at least one source has a scan inventory marker in `meta`. */
  hasAnyScan(): boolean {
    const row = this.db
      .prepare("SELECT 1 FROM meta WHERE substr(key, 1, 11) = 'scanned_at:' LIMIT 1")
      .get();
    return row !== undefined;
  }

  /**
   * Remove documents whose source file no longer appears in the latest `scan`
   * inventory for that source. Only sources with a `scanned_at:<sourceId>`
   * marker are pruned so unscanned sources remain untouched. When the optional
   * `document_embeddings` table is present, orphaned vectors are also deleted.
   */
  pruneStaleDocuments(sourceIds?: string[]): PruneResult {
    const prefix = "scanned_at:";
    return this.tx(() => {
      const metaRows = this.db
        .prepare("SELECT key FROM meta WHERE substr(key, 1, 11) = 'scanned_at:'")
        .all() as Array<{ key: string }>;
      const scannedSet = new Set(metaRows.map((r) => r.key.slice(prefix.length)));

      const targetSources =
        sourceIds === undefined
          ? [...scannedSet].sort()
          : [...new Set(sourceIds)].filter((id) => scannedSet.has(id));

      if (targetSources.length === 0) return { pruned: 0, prunedIds: [] };

      const listRelPaths = this.db.prepare("SELECT rel_path FROM files WHERE source_id = ?");
      const listDocIds = this.db.prepare("SELECT id FROM documents WHERE source_id = ?");

      const staleIds: string[] = [];
      for (const sourceId of targetSources) {
        const fileRows = listRelPaths.all(sourceId) as Array<{ rel_path: string }>;
        const liveIds = new Set(fileRows.map((row) => documentId(sourceId, row.rel_path)));
        const docRows = listDocIds.all(sourceId) as Array<{ id: string }>;
        for (const row of docRows) {
          if (!liveIds.has(row.id)) staleIds.push(row.id);
        }
      }

      if (staleIds.length === 0) return { pruned: 0, prunedIds: [] };

      const hasEmbeddingsTable =
        this.db
          .prepare(
            "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'document_embeddings'",
          )
          .get() !== undefined;

      const deleteDoc = this.db.prepare("DELETE FROM documents WHERE id = ?");
      const deleteEmb = hasEmbeddingsTable
        ? this.db.prepare("DELETE FROM document_embeddings WHERE doc_id = ?")
        : null;
      for (const id of staleIds) {
        deleteDoc.run(id);
        deleteEmb?.run(id);
      }

      return { pruned: staleIds.length, prunedIds: staleIds };
    });
  }

  getDocument(id: string): Document | null {
    const row = this.db.prepare("SELECT * FROM documents WHERE id = ?").get(id) as
      | Record<string, string>
      | undefined;
    if (!row) return null;
    return rowToDocument(row);
  }

  /** Number of documents in the store (for empty-store checks). */
  documentCount(): number {
    const row = this.db.prepare("SELECT COUNT(*) AS n FROM documents").get() as { n: number };
    return Number(row.n);
  }

  /** All documents (order by updated_at). Used by `bench` for token aggregation. */
  listDocuments(): Document[] {
    const rows = this.db
      .prepare("SELECT * FROM documents ORDER BY updated_at ASC, id ASC")
      .all() as Record<string, string>[];
    return rows.map(rowToDocument);
  }

  /**
   * Inventory relative path for a document id, when the file is still in the
   * last scan. Returns null when the inventory row is missing.
   */
  findRelPathForDocument(id: string): string | null {
    const doc = this.getDocument(id);
    if (!doc) return null;
    for (const f of this.listFiles(doc.sourceId)) {
      if (documentId(f.sourceId, f.relPath) === id) return f.relPath;
    }
    return null;
  }

  /**
   * Keyword search. Terms are AND-ed.
   * Trigram FTS needs 3+ characters per term; shorter terms (common in Japanese,
   * e.g. "請求") fall back to LIKE, which is slower but still correct.
   * Pass a number as the second argument for limit only, or {@link SearchOptions}
   * for limit plus optional sourceId / type filters.
   */
  search(query: string, limitOrOptions: number | SearchOptions = 20): SearchHit[] {
    const terms = query.trim().split(/\s+/).filter(Boolean);
    if (terms.length === 0) return [];
    const options: SearchOptions =
      typeof limitOrOptions === "number" ? { limit: limitOrOptions } : (limitOrOptions ?? {});
    const limit = options.limit ?? 20;
    const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)));
    const filters: string[] = [];
    const filterParams: string[] = [];
    if (options.sourceId !== undefined && options.sourceId !== "") {
      filters.push("d.source_id = ?");
      filterParams.push(options.sourceId);
    }
    if (options.type !== undefined && options.type !== "") {
      filters.push("d.type = ?");
      filterParams.push(String(options.type));
    }
    const filterSql = filters.length > 0 ? ` AND ${filters.join(" AND ")}` : "";

    let rows: Record<string, string>[];
    if (terms.every((t) => [...t].length >= 3)) {
      const match = terms.map((t) => `"${t.replace(/"/g, '""')}"`).join(" ");
      rows = this.db
        .prepare(
          `SELECT d.id, d.source_id, d.type, d.title, d.content
           FROM documents_fts f JOIN documents d ON d.rowid = f.rowid
           WHERE documents_fts MATCH ?${filterSql} ORDER BY rank LIMIT ?`,
        )
        .all(match, ...filterParams, safeLimit) as Record<string, string>[];
    } else {
      const likeWhere = terms
        .map(() => "(d.title || ' ' || d.content) LIKE ? ESCAPE '\\'")
        .join(" AND ");
      const likeParams = terms.map((t) => `%${escapeLike(t)}%`);
      rows = this.db
        .prepare(
          `SELECT d.id, d.source_id, d.type, d.title, d.content FROM documents d
           WHERE ${likeWhere}${filterSql}
           ORDER BY d.updated_at DESC LIMIT ?`,
        )
        .all(...likeParams, ...filterParams, safeLimit) as Record<string, string>[];
    }

    return rows.map((r) => ({
      id: r.id!,
      sourceId: r.source_id!,
      type: r.type as DocumentType,
      title: r.title!,
      snippet: snippetOf(r.content!, terms),
    }));
  }

  /** Replace the latest extraction/run issues recorded for UI & health inspection. */
  replaceRunIssues(issues: RunIssueInput[]): void {
    const recordedAt = new Date().toISOString();
    this.tx(() => {
      this.db.prepare("DELETE FROM run_issues").run();
      const ins = this.db.prepare(
        "INSERT INTO run_issues (source_id, path, code, message, recorded_at) VALUES (?, ?, ?, ?, ?)",
      );
      for (const issue of issues) {
        ins.run(issue.sourceId ?? "", issue.path, issue.code, issue.message, recordedAt);
      }
    });
  }

  /** List recorded issues from the most recent extraction/run pass. */
  listRunIssues(): RunIssueRecord[] {
    const rows = this.db
      .prepare(
        "SELECT source_id, path, code, message, recorded_at FROM run_issues ORDER BY id ASC",
      )
      .all() as Array<{
      source_id: string;
      path: string;
      code: string;
      message: string;
      recorded_at: string;
    }>;
    return rows.map((r) => ({
      sourceId: r.source_id,
      path: r.path,
      code: r.code,
      message: r.message,
      recordedAt: r.recorded_at,
    }));
  }

  /** List recorded scan issues, optionally filtered by sourceId. */
  listScanIssues(sourceId?: string): ScanIssueRecord[] {
    const rows = (
      sourceId === undefined || sourceId === ""
        ? this.db
            .prepare("SELECT source_id, path, code, message FROM scan_issues ORDER BY source_id, path")
            .all()
        : this.db
            .prepare(
              "SELECT source_id, path, code, message FROM scan_issues WHERE source_id = ? ORDER BY path",
            )
            .all(sourceId)
    ) as Array<{ source_id: string; path: string; code: string; message: string }>;
    return rows.map((r) => ({
      sourceId: r.source_id,
      path: r.path,
      code: r.code as ScanIssue["code"],
      message: r.message,
    }));
  }

  /** Return per-source inventory health statistics for every known source in the store. */
  listAllSourceStats(oldFileYears = 3, now = Date.now()): SourceStats[] {
    const rows = this.db
      .prepare(
        `SELECT DISTINCT source_id FROM files
         UNION SELECT DISTINCT source_id FROM scan_issues
         UNION SELECT DISTINCT source_id FROM documents
         ORDER BY source_id ASC`,
      )
      .all() as Array<{ source_id: string }>;
    return rows.map((r) => this.stats(r.source_id, oldFileYears, now));
  }

  /** Count indexed documents grouped by sourceId. */
  countDocumentsBySource(): Record<string, number> {
    const rows = this.db
      .prepare("SELECT source_id, COUNT(*) AS n FROM documents GROUP BY source_id")
      .all() as Array<{ source_id: string; n: number }>;
    const counts: Record<string, number> = {};
    for (const r of rows) counts[r.source_id] = Number(r.n);
    return counts;
  }

  /**
   * List sanitized document summaries for read-only exploration.
   * Never returns metadata.originalContent, metadata.originalTables, or raw PII strings.
   */
  listSanitizedDocuments(options: SanitizedDocumentListOptions = {}): SanitizedDocumentListResult {
    const safeLimit = Math.max(1, Math.min(100, Math.floor(options.limit ?? 25)));
    const safeOffset = Math.max(0, Math.floor(options.offset ?? 0));
    const terms = (options.q ?? "").trim().split(/\s+/).filter(Boolean);

    const filters: string[] = [];
    const filterParams: string[] = [];
    if (options.sourceId !== undefined && options.sourceId !== "") {
      filters.push("d.source_id = ?");
      filterParams.push(options.sourceId);
    }
    if (options.type !== undefined && options.type !== "") {
      filters.push("d.type = ?");
      filterParams.push(String(options.type));
    }
    const filterSql = filters.length > 0 ? ` AND ${filters.join(" AND ")}` : "";

    let rows: Record<string, string>[];
    if (terms.length > 0) {
      if (terms.every((t) => [...t].length >= 3)) {
        const match = terms.map((t) => `"${t.replace(/"/g, '""')}"`).join(" ");
        rows = this.db
          .prepare(
            `SELECT d.id, d.source_id, d.type, d.title, d.content, d.metadata_json, d.pii_json, d.guard_json, d.updated_at
             FROM documents_fts f JOIN documents d ON d.rowid = f.rowid
             WHERE documents_fts MATCH ?${filterSql}
             ORDER BY rank`,
          )
          .all(match, ...filterParams) as Record<string, string>[];
      } else {
        const likeWhere = terms
          .map(() => "(d.title || ' ' || d.content) LIKE ? ESCAPE '\\'")
          .join(" AND ");
        const likeParams = terms.map((t) => `%${escapeLike(t)}%`);
        rows = this.db
          .prepare(
            `SELECT d.id, d.source_id, d.type, d.title, d.content, d.metadata_json, d.pii_json, d.guard_json, d.updated_at
             FROM documents d
             WHERE ${likeWhere}${filterSql}
             ORDER BY d.updated_at DESC, d.id ASC`,
          )
          .all(...likeParams, ...filterParams) as Record<string, string>[];
      }
    } else {
      const whereSql = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";
      rows = this.db
        .prepare(
          `SELECT d.id, d.source_id, d.type, d.title, d.content, d.metadata_json, d.pii_json, d.guard_json, d.updated_at
           FROM documents d
           ${whereSql}
           ORDER BY d.updated_at DESC, d.id ASC`,
        )
        .all(...filterParams) as Record<string, string>[];
    }

    let summaries = rows.map((row) => summarizeDocumentRow(row, terms));
    if (options.guardRisk !== undefined && options.guardRisk !== "") {
      summaries = summaries.filter((s) => s.guardRisk === options.guardRisk);
    }

    return {
      total: summaries.length,
      limit: safeLimit,
      offset: safeOffset,
      documents: summaries.slice(safeOffset, safeOffset + safeLimit),
    };
  }
}
