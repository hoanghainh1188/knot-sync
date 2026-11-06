import mysql from "mysql2/promise";
import type { ColumnMeta, SqlDriver, TableMeta } from "./driver.js";

export async function createMysqlDriver(url: string): Promise<SqlDriver> {
  const conn = await mysql.createConnection({
    uri: url,
    connectTimeout: 15_000,
  });
  return {
    dialect: "mysql",
    async enableReadOnly() {
      await conn.query("START TRANSACTION READ ONLY");
    },
    async introspectTable(table: string): Promise<TableMeta | null> {
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
    },
    async query(text, values) {
      const [rows] = await conn.query(text, values);
      return rows as Record<string, unknown>[];
    },
    async close() {
      try {
        await conn.query("ROLLBACK");
      } catch {
        // ignore
      }
      await conn.end();
    },
  };
}
