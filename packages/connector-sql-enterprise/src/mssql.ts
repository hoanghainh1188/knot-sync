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
import { rewriteQuestionMarks } from "./placeholders.js";
import { missingDriverMessage, softImportWithError } from "./soft-import.js";

type TediousTypes = {
  NVarChar: unknown;
  Int: unknown;
  BigInt: unknown;
  Float: unknown;
  Bit: unknown;
  DateTime: unknown;
  VarBinary: unknown;
};

type TediousModule = {
  Connection: new (
    config: Record<string, unknown>,
  ) => TediousConnection;
  Request: new (
    sql: string,
    callback: (err: Error | null, rowCount?: number) => void,
  ) => TediousRequest;
  TYPES: TediousTypes;
};

interface TediousConnection {
  connect(cb: (err?: Error) => void): void;
  execSql(request: TediousRequest): void;
  close(): void;
  once(event: string, cb: (...args: unknown[]) => void): void;
}

interface TediousRequest {
  addParameter(name: string, type: unknown, value: unknown): void;
  on(
    event: "row",
    cb: (columns: Array<{ metadata: { colName: string }; value: unknown }>) => void,
  ): void;
  on(event: "error", cb: (err: Error) => void): void;
}

function parseMssqlUrl(url: string): {
  server: string;
  port?: number;
  database?: string;
  userName?: string;
  password?: string;
  encrypt: boolean;
  trustServerCertificate: boolean;
  applicationIntent?: string;
} {
  // Accept tedious-style URL: mssql://user:pass@host:port/database?encrypt=true
  // or raw host connection string pieces via URL.
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(
      `Invalid mssql URL (env). Use mssql://user:pass@host:1433/database?encrypt=true&trustServerCertificate=true. ` +
        `Got a value that is not a valid URL.`,
    );
  }
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, "")) || undefined;
  const encrypt = parsed.searchParams.get("encrypt") !== "false";
  const trustServerCertificate =
    parsed.searchParams.get("trustServerCertificate") === "true" ||
    parsed.searchParams.get("TrustServerCertificate") === "true";
  const applicationIntent =
    parsed.searchParams.get("ApplicationIntent") ??
    parsed.searchParams.get("applicationIntent") ??
    "ReadOnly";
  const port = parsed.port ? Number(parsed.port) : undefined;
  return {
    server: parsed.hostname,
    port: Number.isFinite(port) ? port : undefined,
    database,
    userName: decodeURIComponent(parsed.username || "") || undefined,
    password: decodeURIComponent(parsed.password || "") || undefined,
    encrypt,
    trustServerCertificate,
    applicationIntent,
  };
}

function bindType(TYPES: TediousTypes, value: unknown): unknown {
  if (typeof value === "number") {
    if (!Number.isInteger(value)) return TYPES.Float;
    if (Math.abs(value) > 2_147_483_647) return TYPES.BigInt;
    return TYPES.Int;
  }
  if (typeof value === "boolean") return TYPES.Bit;
  if (value instanceof Date) return TYPES.DateTime;
  if (Buffer.isBuffer(value)) return TYPES.VarBinary;
  return TYPES.NVarChar;
}

export async function createMssqlDriver(
  url: string,
  options: DriverCreateOptions = {},
  tediousModule?: TediousModule | null,
): Promise<SqlDriver> {
  let loadError: string | undefined;
  const loaded =
    tediousModule === undefined
      ? await (async () => {
          const r = await softImportWithError<TediousModule>("tedious");
          loadError = r.errorMessage;
          return r.mod;
        })()
      : tediousModule;
  if (!loaded || typeof loaded.Connection !== "function") {
    throw new Error(
      missingDriverMessage(
        "SQL Server (mssql)",
        "tedious",
        "Install dependency tedious (MIT) in connector-sql-enterprise.",
        loadError,
      ),
    );
  }
  const Connection = loaded.Connection;
  const Request = loaded.Request;
  const TYPES = loaded.TYPES;

  const cfg = parseMssqlUrl(url);
  const timeoutMs = options.statementTimeoutMs ?? DEFAULT_STATEMENT_TIMEOUT_MS;
  const readOnlyIntent =
    !cfg.applicationIntent ||
    cfg.applicationIntent.toLowerCase() === "readonly";

  const connection = new Connection({
    server: cfg.server,
    authentication: {
      type: "default",
      options: {
        userName: cfg.userName,
        password: cfg.password,
      },
    },
    options: {
      port: cfg.port,
      database: cfg.database,
      encrypt: cfg.encrypt,
      trustServerCertificate: cfg.trustServerCertificate,
      connectTimeout: 15_000,
      requestTimeout: timeoutMs,
      rowCollectionOnRequestCompletion: true,
      appName: "knot-sync-readonly",
      useUTC: true,
      // Always On / Availability Group read-only routing hint (server may ignore).
      readOnlyIntent,
    },
  });

  // Prevent uncaught 'error' from tearing down the Node process mid-scan/serve.
  connection.once("error", () => undefined);

  await new Promise<void>((resolve, reject) => {
    connection.connect((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
  async function exec(sql: string, values: unknown[] = []): Promise<Record<string, unknown>[]> {
    const { text, names } = rewriteQuestionMarks(sql, "at");
    return new Promise((resolve, reject) => {
      const rows: Record<string, unknown>[] = [];
      const request = new Request(text, (err) => {
        if (err) reject(err);
        else resolve(rows);
      });
      request.on("row", (columns) => {
        const row: Record<string, unknown> = {};
        for (const col of columns) {
          row[col.metadata.colName] = col.value;
        }
        rows.push(row);
      });
      for (let i = 0; i < values.length; i++) {
        const name = names[i] ?? `p${i + 1}`;
        request.addParameter(name, bindType(TYPES, values[i]), values[i]);
      }
      connection.execSql(request);
    });
  }

  return {
    dialect: "mssql",
    async enableReadOnly() {
      // readOnlyIntent is set on the connection; builders never emit mutating SQL.
    },
    async introspectTable(table: string): Promise<TableMeta | null> {
      const cols = await exec(
        `SELECT c.COLUMN_NAME AS column_name, c.DATA_TYPE AS data_type,
                c.IS_NULLABLE AS is_nullable,
                CASE WHEN pk.COLUMN_NAME IS NOT NULL THEN 1 ELSE 0 END AS is_pk
         FROM INFORMATION_SCHEMA.COLUMNS c
         LEFT JOIN (
           SELECT ku.TABLE_NAME, ku.COLUMN_NAME
           FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
           JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE ku
             ON tc.CONSTRAINT_NAME = ku.CONSTRAINT_NAME
            AND tc.TABLE_NAME = ku.TABLE_NAME
           WHERE tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
         ) pk ON pk.TABLE_NAME = c.TABLE_NAME AND pk.COLUMN_NAME = c.COLUMN_NAME
         WHERE c.TABLE_NAME = ?
         ORDER BY c.ORDINAL_POSITION`,
        [table],
      );
      if (cols.length === 0) return null;
      const columns: ColumnMeta[] = cols.map((r) => ({
        name: String(r.column_name),
        dataType: String(r.data_type ?? "unknown"),
        isNullable: String(r.is_nullable).toUpperCase() === "YES",
        isPrimaryKey: Number(r.is_pk) === 1,
      }));
      let rowEstimate: number | null = null;
      try {
        const est = await exec(
          `SELECT SUM(p.rows) AS estimate
           FROM sys.partitions p
           INNER JOIN sys.tables t ON p.object_id = t.object_id
           WHERE t.name = ? AND p.index_id IN (0, 1)`,
          [table],
        );
        const raw = est[0]?.estimate;
        if (raw !== undefined && raw !== null) {
          const n = Number(raw);
          if (Number.isFinite(n) && n >= 0) rowEstimate = n;
        }
      } catch {
        rowEstimate = null;
      }
      return { name: table, columns, rowEstimate };
    },
    async query(text: string, values: unknown[]): Promise<Record<string, unknown>[]> {
      return exec(text, values);
    },
    async close() {
      connection.close();
    },
  };
}

export const createMssqlDriverFactory: DriverFactory = (url, options) =>
  createMssqlDriver(url, options);
