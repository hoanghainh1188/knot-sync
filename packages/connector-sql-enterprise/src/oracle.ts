import type {
  ColumnMeta,
  DriverCreateOptions,
  DriverFactory,
  SqlDriver,
  TableMeta,
} from "@hoanghainh/knot-sync-connector-sql";
import {
  DEFAULT_STATEMENT_TIMEOUT_MS,
} from "@hoanghainh/knot-sync-connector-sql";
import { missingDriverMessage, softImportWithError } from "./soft-import.js";

type OracleBinds = Record<string, unknown> | unknown[];

interface OracleConnection {
  callTimeout?: number;
  execute(
    sql: string,
    binds?: OracleBinds,
    options?: Record<string, unknown>,
  ): Promise<{ rows?: unknown[] }>;
  close(): Promise<void>;
}

interface OraclePool {
  getConnection(): Promise<OracleConnection>;
  close(drainTime?: number): Promise<void>;
}

type OracleModule = {
  createPool(config: Record<string, unknown>): Promise<OraclePool>;
  BIND_OUT?: unknown;
  OUT_FORMAT_OBJECT?: number;
};

/**
 * Accept oracle URL forms:
 * - oracle://user:pass@host:1521/service
 * - easy connect / connect string after oracle://
 */
function parseOracleUrl(url: string): {
  user: string;
  password: string;
  connectString: string;
} {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(
      `Invalid oracle URL (env). Use oracle://user:pass@host:1521/service_name. ` +
        `Got a value that is not a valid URL.`,
    );
  }
  const user = decodeURIComponent(parsed.username || "");
  const password = decodeURIComponent(parsed.password || "");
  const port = parsed.port || "1521";
  const service = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  const connectString =
    parsed.searchParams.get("connectString") ||
    `${parsed.hostname}:${port}/${service}`;
  if (!user) {
    throw new Error(
      `oracle URL must include a username (oracle://user:pass@host:1521/service).`,
    );
  }
  return { user, password, connectString };
}

function toNamedBinds(text: string, values: unknown[]): {
  sql: string;
  binds: Record<string, unknown>;
} {
  const binds: Record<string, unknown> = {};
  const re = /:(\d+)/g;
  let m: RegExpExecArray | null;
  const seen = new Set<string>();
  while ((m = re.exec(text)) !== null) {
    const key = m[1]!;
    if (seen.has(key)) continue;
    seen.add(key);
    const idx = Number(key) - 1;
    binds[key] = values[idx];
  }
  if (text.includes("?")) {
    let i = 0;
    const sql = text.replace(/\?/g, () => {
      i += 1;
      binds[String(i)] = values[i - 1];
      return `:${i}`;
    });
    return { sql, binds };
  }
  return { sql: text, binds };
}

function normalizeRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    out[k] = typeof v === "bigint" ? v.toString() : v;
  }
  return out;
}

export async function createOracleDriver(
  url: string,
  options: DriverCreateOptions = {},
  oracleModule?: OracleModule | null,
): Promise<SqlDriver> {
  let loadError: string | undefined;
  const oracledb =
    oracleModule === undefined
      ? await (async () => {
          const r = await softImportWithError<OracleModule>("oracledb");
          loadError = r.errorMessage;
          return r.mod;
        })()
      : oracleModule;
  if (!oracledb || typeof oracledb.createPool !== "function") {
    throw new Error(
      missingDriverMessage(
        "Oracle",
        "oracledb",
        "Install optionalDependency oracledb (Apache-2.0/UPL) and ensure Instant Client / Thin mode is available. " +
          "Alternatively configure ODBC later if you use a different client stack.",
        loadError,
      ),
    );
  }

  const cfg = parseOracleUrl(url);
  const timeoutMs = options.statementTimeoutMs ?? DEFAULT_STATEMENT_TIMEOUT_MS;
  const pool = await oracledb.createPool({
    user: cfg.user,
    password: cfg.password,
    connectString: cfg.connectString,
    poolMin: 0,
    poolMax: 4,
    poolIncrement: 1,
  });

  async function withConn<T>(fn: (conn: OracleConnection) => Promise<T>): Promise<T> {
    const conn = await pool.getConnection();
    try {
      conn.callTimeout = timeoutMs;
      try {
        await conn.execute(
          `BEGIN EXECUTE IMMEDIATE 'ALTER SESSION SET TIME_ZONE = ''UTC'''; END;`,
        );
      } catch {
        // ignore
      }
      // Read-only must be set on the same connection as the SELECT.
      try {
        await conn.execute("SET TRANSACTION READ ONLY");
      } catch {
        // Server may reject; builders still never emit mutating SQL.
      }
      return await fn(conn);
    } finally {
      await conn.close().catch(() => undefined);
    }
  }

  return {
    dialect: "oracle",
    async enableReadOnly() {
      // Applied on every pooled checkout inside withConn.
    },
    async introspectTable(table: string): Promise<TableMeta | null> {
      return withConn(async (conn) => {
        const outFormat = oracledb.OUT_FORMAT_OBJECT ?? 4002;
        const { rows } = await conn.execute(
          `SELECT column_name, data_type, nullable
           FROM user_tab_columns
           WHERE table_name = :1
           ORDER BY column_id`,
          { "1": table.toUpperCase() },
          { outFormat },
        );
        const list = (rows ?? []) as Array<Record<string, unknown>>;
        if (list.length === 0) {
          const again = await conn.execute(
            `SELECT column_name, data_type, nullable
             FROM user_tab_columns
             WHERE table_name = :1
             ORDER BY column_id`,
            { "1": table },
            { outFormat },
          );
          const againList = (again.rows ?? []) as Array<Record<string, unknown>>;
          if (againList.length === 0) return null;
          return mapOracleColumns(table, againList);
        }
        return mapOracleColumns(table, list);
      });
    },
    async query(text: string, values: unknown[]): Promise<Record<string, unknown>[]> {
      return withConn(async (conn) => {
        const { sql, binds } = toNamedBinds(text, values);
        const result = await conn.execute(sql, binds, {
          outFormat: oracledb.OUT_FORMAT_OBJECT ?? 4002,
        });
        return ((result.rows ?? []) as Record<string, unknown>[]).map(normalizeRow);
      });
    },
    async close() {
      await pool.close(0);
    },
  };
}

function mapOracleColumns(
  table: string,
  list: Array<Record<string, unknown>>,
): TableMeta {
  const columns: ColumnMeta[] = list.map((r) => ({
    name: String(r.COLUMN_NAME ?? r.column_name),
    dataType: String(r.DATA_TYPE ?? r.data_type ?? "unknown"),
    isNullable: String(r.NULLABLE ?? r.nullable ?? "Y").toUpperCase() === "Y",
    isPrimaryKey: false,
  }));
  return { name: table, columns, rowEstimate: null };
}

export const createOracleDriverFactory: DriverFactory = (url, options) =>
  createOracleDriver(url, options);
