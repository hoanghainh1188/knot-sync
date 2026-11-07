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

  upsertDocument(doc: Document): void {
    this.db
      .prepare(
        `INSERT INTO documents (id, source_id, type, title, content, tables_json, metadata_json, pii_json, guard_json, hash, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           source_id = excluded.source_id, type = excluded.type, title = excluded.title,
           content = excluded.content, tables_json = excluded.tables_json,
           metadata_json = excluded.metadata_json, pii_json = excluded.pii_json,
           guard_json = excluded.guard_json,
           hash = excluded.hash, updated_at = excluded.updated_at`,
      )
      .run(
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
}
