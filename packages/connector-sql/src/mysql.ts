import mysql from "mysql2/promise";
import {
  DEFAULT_POOL_MAX,
  DEFAULT_STATEMENT_TIMEOUT_MS,
  type ColumnMeta,
  type DriverCreateOptions,
  type SqlDriver,
  type TableMeta,
} from "./driver.js";

/** SQL used to set MAX_EXECUTION_TIME (integer ms — caller-validated). */
export function mysqlMaxExecutionTimeSql(timeoutMs: number): string {
  return `SET SESSION MAX_EXECUTION_TIME = ${Math.floor(timeoutMs)}`;
}

export async function createMysqlDriver(
  url: string,
  options: DriverCreateOptions = {},
): Promise<SqlDriver> {
  const timeoutMs = options.statementTimeoutMs ?? DEFAULT_STATEMENT_TIMEOUT_MS;
  const pool = mysql.createPool({
    uri: url,
    connectionLimit: DEFAULT_POOL_MAX,
    connectTimeout: 15_000,
  });

  async function withConnection<T>(
    fn: (conn: mysql.PoolConnection) => Promise<T>,
  ): Promise<T> {
    const conn = await pool.getConnection();
    try {
      try {
        await conn.query(mysqlMaxExecutionTimeSql(timeoutMs));
      } catch {
        // Older MySQL may not support MAX_EXECUTION_TIME; continue best-effort.
      }
      await conn.query("START TRANSACTION READ ONLY");
      try {
        return await fn(conn);
      } finally {
        try {
          await conn.query("ROLLBACK");
        } catch {
          // ignore
        }
      }
    } finally {
      conn.release();
    }
  }

  return {
    dialect: "mysql",
    async enableReadOnly() {
      // Read-only + timeout are applied on every pool checkout.
    },
    async introspectTable(table: string): Promise<TableMeta | null> {
      return withConnection(async (conn) => {
        const [colsRaw] = await conn.query(
          `SELECT COLUMN_NAME AS column_name, DATA_TYPE AS data_type, IS_NULLABLE AS is_nullable,
                  COLUMN_KEY AS column_key
           FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
           ORDER BY ORDINAL_POSITION`,
          [table],
        );
        const cols = colsRaw as Array<Record<string, unknown>>;
        if (!Array.isArray(cols) || cols.length === 0) return null;

        const [estRaw] = await conn.query(
          `SELECT TABLE_ROWS AS estimate
           FROM information_schema.TABLES
           WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
          [table],
        );
        const estRows = estRaw as Array<Record<string, unknown>>;
        let rowEstimate: number | null = null;
        const raw = estRows[0]?.estimate;
        if (raw !== undefined && raw !== null) {
          const n = Number(raw);
          rowEstimate = Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
        }

        const columns: ColumnMeta[] = cols.map((r) => ({
          name: String(r.column_name),
          dataType: String(r.data_type),
          isNullable: String(r.is_nullable) === "YES",
          isPrimaryKey: String(r.column_key) === "PRI",
        }));
        return { name: table, columns, rowEstimate };
      });
    },
    async query(text, values) {
      return withConnection(async (conn) => {
        const [rows] = await conn.query(text, values);
        return rows as Record<string, unknown>[];
      });
    },
    async close() {
      await pool.end();
    },
  };
}
