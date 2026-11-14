import type { SqlDialect } from "./quote.js";

export interface ColumnMeta {
  name: string;
  dataType: string;
  isNullable: boolean;
  isPrimaryKey: boolean;
  /** Optional foreign-key target in `"<table>.<column>"` format. */
  references?: string;
}

export interface TableMeta {
  name: string;
  columns: ColumnMeta[];
  /** Estimated row count when available; null if unknown. */
  rowEstimate: number | null;
}

/** Default max clients in the SQL connection pool. */
export const DEFAULT_POOL_MAX = 4;

/** Default statement / max-execution timeout in milliseconds. */
export const DEFAULT_STATEMENT_TIMEOUT_MS = 5000;

/** Default PostgreSQL schema when `schema` is omitted from config. */
export const DEFAULT_POSTGRES_SCHEMA = "public";

export interface DriverCreateOptions {
  /** Postgres schema (ignored for MySQL). */
  schema?: string;
  /** Statement timeout in ms. */
  statementTimeoutMs?: number;
}

/** Minimal read-only SQL driver used by scan and MCP query helpers. */
export interface SqlDriver {
  dialect: SqlDialect;
  /** Enable read-only session / transaction (may be a no-op when setup is per-checkout). */
  enableReadOnly(): Promise<void>;
  /** Introspect one table; return null if missing. */
  introspectTable(table: string): Promise<TableMeta | null>;
  /**
   * Run a parameterized SELECT. `text` must already use only allow-listed
   * quoted identifiers; `values` are bound parameters.
   */
  query(text: string, values: unknown[]): Promise<Record<string, unknown>[]>;
  close(): Promise<void>;
}

export type DriverFactory = (
  url: string,
  options?: DriverCreateOptions,
) => Promise<SqlDriver>;
