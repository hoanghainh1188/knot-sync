import type { SqlDialect } from "./quote.js";

export interface ColumnMeta {
  name: string;
  dataType: string;
  isNullable: boolean;
  isPrimaryKey: boolean;
}

export interface TableMeta {
  name: string;
  columns: ColumnMeta[];
  /** Estimated row count when available; null if unknown. */
  rowEstimate: number | null;
}

/** Minimal read-only SQL driver used by scan and MCP query helpers. */
export interface SqlDriver {
  dialect: SqlDialect;
  /** Enable read-only session / transaction. */
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

export type DriverFactory = (url: string) => Promise<SqlDriver>;
