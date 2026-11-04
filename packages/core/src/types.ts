/**
 * Common data model. Every source (file, scanned paper, DB row)
 * is turned into a `Document` before it reaches the store and MCP.
 */

export type DocumentType =
  | "xlsx"
  | "xls"
  | "docx"
  | "doc"
  | "pdf"
  | "csv"
  | "txt"
  | "md"
  | "pptx"
  | "image"
  | "db_row"
  | "other";

export type MetadataValue = string | number | boolean | null;

export interface PiiFinding {
  /** Rule that matched, e.g. "email", "my_number", "cccd". */
  rule: string;
  /** Character offsets in the ORIGINAL content. */
  start: number;
  end: number;
}

export interface TableData {
  name?: string;
  headers: string[];
  rows: string[][];
}

export interface Document {
  /** Stable id: hash of sourceId + location. */
  id: string;
  sourceId: string;
  type: DocumentType;
  title: string;
  /** Normalized content as Markdown. */
  content: string;
  tables: TableData[];
  metadata: Record<string, MetadataValue>;
  pii: PiiFinding[];
  /** Hash of the normalized content, for change / duplicate detection. */
  hash: string;
}

/** One file found by a connector during `scan`. Read-only snapshot. */
export interface FileEntry {
  sourceId: string;
  absPath: string;
  /** Path relative to the source root, always with "/" separators. */
  relPath: string;
  /** Lower-case extension including the dot, e.g. ".xlsx". Empty if none. */
  ext: string;
  type: DocumentType;
  size: number;
  mtimeMs: number;
  /** sha256 of file bytes. Null when hashing is disabled or failed. */
  hash: string | null;
}

export interface ScanIssue {
  sourceId: string;
  path: string;
  code: "EACCES" | "EPERM" | "ENOENT" | "EBUSY" | "OTHER";
  message: string;
}

// ---------- Config ----------

export interface FsSourceConfig {
  id: string;
  type: "fs";
  /** Absolute path after config loading. */
  path: string;
  /** Only these extensions (lower-case, with dot). Empty = all files. */
  extensions: string[];
  /** Directory or file names to skip anywhere in the tree. */
  exclude: string[];
}

// SQL sources come in week 9.
export type SourceConfig = FsSourceConfig;

export interface StoreConfig {
  /** Absolute path to the SQLite file after config loading. */
  path: string;
}

export interface ScanConfig {
  /** Files older than this many years are reported as "old". */
  oldFileYears: number;
  /** Compute sha256 for duplicate detection. */
  hash: boolean;
}

export interface AppConfig {
  /** Directory of the config file. Relative paths resolve from here. */
  baseDir: string;
  sources: SourceConfig[];
  store: StoreConfig;
  scan: ScanConfig;
}
