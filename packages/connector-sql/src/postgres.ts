import pg from "pg";
import {
  DEFAULT_POOL_MAX,
  DEFAULT_POSTGRES_SCHEMA,
  DEFAULT_STATEMENT_TIMEOUT_MS,
  type ColumnMeta,
  type DriverCreateOptions,
  type SqlDriver,
  type TableMeta,
} from "./driver.js";

/** SQL used to set statement_timeout (integer ms — caller-validated). */
export function postgresStatementTimeoutSql(timeoutMs: number): string {
  return `SET statement_timeout = ${Math.floor(timeoutMs)}`;
}

export async function createPostgresDriver(
  url: string,
  options: DriverCreateOptions = {},
): Promise<SqlDriver> {
  const schema = options.schema?.trim() || DEFAULT_POSTGRES_SCHEMA;
  const timeoutMs = options.statementTimeoutMs ?? DEFAULT_STATEMENT_TIMEOUT_MS;
  const pool = new pg.Pool({
    connectionString: url,
    max: DEFAULT_POOL_MAX,
    connectionTimeoutMillis: 15_000,
  });

  async function withClient<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query("SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY");
      await client.query(postgresStatementTimeoutSql(timeoutMs));
      return await fn(client);
    } finally {
      client.release();
    }
  }

  return {
    dialect: "postgres",
    async enableReadOnly() {
      // Read-only + timeout are applied on every pool checkout.
    },
    async introspectTable(table: string): Promise<TableMeta | null> {
      return withClient(async (client) => {
        const cols = await client.query<{
          column_name: string;
          data_type: string;
          is_nullable: string;
        }>(
          `SELECT column_name, data_type, is_nullable
           FROM information_schema.columns
           WHERE table_schema = $1 AND table_name = $2
           ORDER BY ordinal_position`,
          [schema, table],
        );
        if (cols.rows.length === 0) return null;

        const pk = await client.query<{ column_name: string }>(
          `SELECT kcu.column_name
           FROM information_schema.table_constraints tc
           JOIN information_schema.key_column_usage kcu
             ON tc.constraint_name = kcu.constraint_name
            AND tc.table_schema = kcu.table_schema
           WHERE tc.constraint_type = 'PRIMARY KEY'
             AND tc.table_schema = $1
             AND tc.table_name = $2`,
          [schema, table],
        );
        const pkSet = new Set(pk.rows.map((r) => r.column_name));

        const est = await client.query<{ estimate: string | null }>(
          `SELECT reltuples::bigint::text AS estimate
           FROM pg_class c
           JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = $1 AND c.relname = $2 AND c.relkind = 'r'`,
          [schema, table],
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
      });
    },
    async query(text, values) {
      return withClient(async (client) => {
        const res = await client.query(text, values);
        return res.rows as Record<string, unknown>[];
      });
    },
    async close() {
      await pool.end();
    },
  };
}
