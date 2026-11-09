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

/** Allow-listed columns for one SQL table. */
export interface SqlAllowTable {
  columns: string[];
}

/** Postgres or MySQL source (connection URL resolved from env at load time). */
export interface SqlSourceConfig {
  id: string;
  type: "postgres" | "mysql";
  /** Resolved connection string — never written back to YAML. */
  url: string;
  /** Environment variable name that provided the URL (for errors). */
  urlEnv: string;
  /** Table name → allowed columns. */
  allow: Record<string, SqlAllowTable>;
  /**
   * PostgreSQL schema for introspection and qualified table references.
   * Defaults to `public` when omitted. Must not be set on mysql sources.
   */
  schema?: string;
  /**
   * Per-statement timeout in milliseconds (default 5000 when omitted).
   * Applied on each pooled connection before introspection/query.
   */
  statementTimeoutMs?: number;
}

export type SourceConfig = FsSourceConfig | SqlSourceConfig;

export function isFsSource(source: SourceConfig): source is FsSourceConfig {
  return source.type === "fs";
}

export function isSqlSource(source: SourceConfig): source is SqlSourceConfig {
  return source.type === "postgres" || source.type === "mysql";
}

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

/** Extraction resource limits (`extraction:` in config). */
export interface ExtractionConfig {
  /** Skip files larger than this many mebibytes. */
  maxFileSizeMb: number;
  /** Per-file wall-clock timeout in seconds. */
  timeoutSeconds: number;
  /** Max characters accepted from one delimited/plain-text extraction. */
  maxTextChars: number;
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

/** MCP server settings (`server:` in config). */
export interface ServerConfig {
  /** Absolute path to the JSONL audit log after config loading. */
  auditLog: string;
}

/** Supported CLI message locales (`cli.locale` in config). */
export type CliLocale = "en" | "ja" | "vi";

/** CLI preferences (`cli:` in config). */
export interface CliConfig {
  /** Preferred locale when set; omitted means unset (flag/env/default apply). */
  locale?: CliLocale;
}

/** Excel column mapping for optional テーブル定義書 / 項目定義書. */
export interface CatalogDefinitionMapping {
  sheet?: string;
  physical: string;
  label_ja?: string;
  label_vi?: string;
  label_en?: string;
  description?: string;
}

/** Semantic Catalog settings (`catalog:` in config). */
export interface CatalogConfig {
  /** Absolute path to knot-sync.catalog.yaml after config loading. */
  path: string;
  /** Absolute path to optional customer dictionary file. */
  dictionary?: string;
  /** Absolute path to optional definition Excel workbook. */
  definitionExcel?: string;
  definitionMapping: CatalogDefinitionMapping;
}

/** One argument descriptor for a config-defined MCP prompt. */
export interface PromptArgumentConfig {
  name: string;
  description: string;
  required: boolean;
}

/** One entry under config `prompts:`. */
export interface PromptConfig {
  name: string;
  description: string;
  arguments: PromptArgumentConfig[];
  template: string;
}

export interface AppConfig {
  /** Directory of the config file. Relative paths resolve from here. */
  baseDir: string;
  sources: SourceConfig[];
  store: StoreConfig;
  scan: ScanConfig;
  cleaning: CleaningConfig;
  extraction: ExtractionConfig;
  pii: PiiConfig;
  guard: GuardConfig;
  server: ServerConfig;
  catalog: CatalogConfig;
  prompts: PromptConfig[];
  cli: CliConfig;
  /** Extra plugins listed in config (built-ins are separate). */
  plugins: string[];
  /** Opaque top-level settings keyed by plugin name. */
  pluginSettings: Record<string, unknown>;
}
