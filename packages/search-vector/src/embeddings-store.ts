import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { Document } from "@hoanghainh/knot-sync-core";

const TABLE = "document_embeddings";

export interface EmbeddingRow {
  docId: string;
  model: string;
  dim: number;
  vector: number[];
  contentHash: string;
  updatedAt: string;
}

export function contentHashForDocument(doc: Document): string {
  return createHash("sha256")
    .update(`${doc.title}\n${doc.content}`)
    .digest("hex");
}

export function ensureEmbeddingsSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ${TABLE} (
      doc_id TEXT NOT NULL,
      model TEXT NOT NULL,
      dim INTEGER NOT NULL,
      vector_json TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (doc_id, model)
    );
    CREATE INDEX IF NOT EXISTS idx_document_embeddings_model ON ${TABLE}(model);
  `);
}

export function upsertEmbedding(
  db: DatabaseSync,
  row: Omit<EmbeddingRow, "updatedAt"> & { updatedAt?: string },
): void {
  ensureEmbeddingsSchema(db);
  const updatedAt = row.updatedAt ?? new Date().toISOString();
  db.prepare(
    `INSERT INTO ${TABLE} (doc_id, model, dim, vector_json, content_hash, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(doc_id, model) DO UPDATE SET
       dim = excluded.dim,
       vector_json = excluded.vector_json,
       content_hash = excluded.content_hash,
       updated_at = excluded.updated_at`,
  ).run(
    row.docId,
    row.model,
    row.dim,
    JSON.stringify(row.vector),
    row.contentHash,
    updatedAt,
  );
}

export function getEmbedding(
  db: DatabaseSync,
  docId: string,
  model: string,
): EmbeddingRow | null {
  ensureEmbeddingsSchema(db);
  const row = db
    .prepare(
      `SELECT doc_id, model, dim, vector_json, content_hash, updated_at
       FROM ${TABLE} WHERE doc_id = ? AND model = ?`,
    )
    .get(docId, model) as
    | {
        doc_id: string;
        model: string;
        dim: number;
        vector_json: string;
        content_hash: string;
        updated_at: string;
      }
    | undefined;
  if (!row) return null;
  let vector: number[];
  try {
    vector = JSON.parse(row.vector_json) as number[];
  } catch {
    return null;
  }
  if (!Array.isArray(vector)) return null;
  return {
    docId: row.doc_id,
    model: row.model,
    dim: Number(row.dim),
    vector,
    contentHash: row.content_hash,
    updatedAt: row.updated_at,
  };
}

export function listEmbeddings(
  db: DatabaseSync,
  model: string,
): EmbeddingRow[] {
  ensureEmbeddingsSchema(db);
  const rows = db
    .prepare(
      `SELECT doc_id, model, dim, vector_json, content_hash, updated_at
       FROM ${TABLE} WHERE model = ?`,
    )
    .all(model) as Array<{
    doc_id: string;
    model: string;
    dim: number;
    vector_json: string;
    content_hash: string;
    updated_at: string;
  }>;
  const out: EmbeddingRow[] = [];
  for (const row of rows) {
    try {
      const vector = JSON.parse(row.vector_json) as number[];
      if (!Array.isArray(vector)) continue;
      out.push({
        docId: row.doc_id,
        model: row.model,
        dim: Number(row.dim),
        vector,
        contentHash: row.content_hash,
        updatedAt: row.updated_at,
      });
    } catch {
      // skip corrupt rows
    }
  }
  return out;
}
