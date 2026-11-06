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

export interface GuardFinding {
  /** Rule that matched, e.g. "instruction-en", "controls". */
  rule: string;
  /** Character offsets in the pre-transform text (content or hidden channel). */
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
  /** Prompt-injection / guard findings (offsets into pre-transform text). */
  guard: GuardFinding[];
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

/** Per-step toggles for the built-in JA/VN cleaner. All default to true. */
export interface CleaningConfig {
  nfkc: boolean;
  wareki: boolean;
  datesIso: boolean;
  legacyVietnamese: boolean;
  tokenReduce: boolean;
}

export type PiiMode = "mask" | "hash" | "drop";

/** PII masking settings for the built-in pii-basic plugin. */
export interface PiiConfig {
  mode: PiiMode;
  /** Absolute path to the hash salt file after config loading. */
  saltPath: string;
}

export type GuardMode = "flag" | "strip" | "block";
export type GuardRisk = "none" | "low" | "medium" | "high";

/** Prompt-injection guard settings for the built-in guard plugin. */
export interface GuardConfig {
  mode: GuardMode;
}

export interface AppConfig {
  /** Directory of the config file. Relative paths resolve from here. */
  baseDir: string;
  sources: SourceConfig[];
  store: StoreConfig;
  scan: ScanConfig;
  cleaning: CleaningConfig;
  pii: PiiConfig;
  guard: GuardConfig;
  /** Extra plugins listed in config (built-ins are separate). */
  plugins: string[];
  /** Opaque top-level settings keyed by plugin name. */
  pluginSettings: Record<string, unknown>;
}
