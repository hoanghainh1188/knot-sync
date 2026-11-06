import pg from "pg";
import type { ColumnMeta, SqlDriver, TableMeta } from "./driver.js";

export async function createPostgresDriver(url: string): Promise<SqlDriver> {
  const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 15_000 });
  await client.connect();
  return {
    dialect: "postgres",
    async enableReadOnly() {
      await client.query("SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY");
    },
    async introspectTable(table: string): Promise<TableMeta | null> {
      const cols = await client.query<{
        column_name: string;
        data_type: string;
        is_nullable: string;
      }>(
        `SELECT column_name, data_type, is_nullable
         FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1
         ORDER BY ordinal_position`,
        [table],
      );
      if (cols.rowCount === 0) return null;

      const pk = await client.query<{ column_name: string }>(
        `SELECT kcu.column_name
         FROM information_schema.table_constraints tc
         JOIN information_schema.key_column_usage kcu
           ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
         WHERE tc.constraint_type = 'PRIMARY KEY'
           AND tc.table_schema = 'public'
           AND tc.table_name = $1`,
        [table],
      );
      const pkSet = new Set(pk.rows.map((r) => r.column_name));

      const est = await client.query<{ estimate: string | null }>(
        `SELECT reltuples::bigint::text AS estimate
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public' AND c.relname = $1 AND c.relkind = 'r'`,
        [table],
      );
      let rowEstimate: number | null = null;
      const raw = est.rows[0]?.estimate;
      if (raw !== undefined && raw !== null) {
        const n = Number(raw);
        rowEstimate = Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
      }

      const columns: ColumnMeta[] = cols.rows.map((r) => ({
        name: r.column_name,
        dataType: r.data_type,
        isNullable: r.is_nullable === "YES",
        isPrimaryKey: pkSet.has(r.column_name),
      }));
      return { name: table, columns, rowEstimate };
    },
    async query(text, values) {
      const res = await client.query(text, values);
      return res.rows as Record<string, unknown>[];
    },
    async close() {
      await client.end();
    },
  };
}
