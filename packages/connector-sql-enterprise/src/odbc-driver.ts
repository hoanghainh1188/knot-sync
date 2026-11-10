import type {
  ColumnMeta,
  DriverCreateOptions,
  DriverFactory,
  SqlDialect,
  SqlDriver,
  TableMeta,
} from "@hoanghainh/knot-sync-connector-sql";
import {
  DEFAULT_STATEMENT_TIMEOUT_MS,
} from "@hoanghainh/knot-sync-connector-sql";
import { missingDriverMessage, softImportWithError } from "./soft-import.js";

interface OdbcConnection {
  query(
    sql: string,
    params?: unknown[],
    options?: { timeout?: number },
  ): Promise<Array<Record<string, unknown>>>;
  close(): Promise<void>;
}

type OdbcModule = {
  connect(
    connectionString: string,
    options?: { connectionTimeout?: number; loginTimeout?: number },
  ): Promise<OdbcConnection>;
};

export type OdbcEngine = "access" | "as400";

function engineLabel(engine: OdbcEngine): string {
  return engine === "access" ? "Microsoft Access" : "IBM i / AS400";
}

function setupHint(engine: OdbcEngine): string {
  if (engine === "access") {
    return (
      "Install optionalDependency odbc (MIT) and the Microsoft Access Database Engine " +
      "(ACE/Jet) ODBC driver on this host."
    );
  }
  return (
    "Install optionalDependency odbc (MIT) and the IBM i Access Client Solutions ODBC driver " +
    "on this host."
  );
}

function normalizeRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    out[k] = typeof v === "bigint" ? v.toString() : v;
  }
  return out;
}

export async function createOdbcSqlDriver(
  engine: OdbcEngine,
  url: string,
  options: DriverCreateOptions = {},
  odbcModule?: OdbcModule | null,
): Promise<SqlDriver> {
  let loadError: string | undefined;
  const odbc =
    odbcModule === undefined
      ? await (async () => {
          const r = await softImportWithError<OdbcModule>("odbc");
          loadError = r.errorMessage;
          return r.mod;
        })()
      : odbcModule;
  if (!odbc || typeof odbc.connect !== "function") {
    throw new Error(
      missingDriverMessage(engineLabel(engine), "odbc", setupHint(engine), loadError),
    );
  }

  const connectionString = url.replace(/^odbc:/i, "");
  if (!connectionString.trim()) {
    throw new Error(
      `${engineLabel(engine)} connection string (env) is empty. ` +
        `Set a DSN= or Driver= ODBC connection string, then retry.`,
    );
  }

  const timeoutMs = options.statementTimeoutMs ?? DEFAULT_STATEMENT_TIMEOUT_MS;
  const timeoutSec = Math.max(1, Math.ceil(timeoutMs / 1000));
  let conn: OdbcConnection;
  try {
    conn = await odbc.connect(connectionString, {
      connectionTimeout: timeoutSec,
      loginTimeout: timeoutSec,
    });
  } catch (err) {
    throw new Error(
      `Failed to open ${engineLabel(engine)} ODBC connection: ${(err as Error).message}. ` +
        setupHint(engine),
    );
  }

  const dialect: SqlDialect = engine;

  async function queryRows(
    sql: string,
    params: unknown[] = [],
  ): Promise<Record<string, unknown>[]> {
    const rows = await conn.query(sql, params, { timeout: timeoutSec });
    return (Array.isArray(rows) ? rows : []).map(normalizeRow);
  }

  return {
    dialect,
    async enableReadOnly() {
      // ODBC Access/AS400 rarely support SET TRANSACTION READ ONLY; builders never mutate.
    },
    async introspectTable(table: string): Promise<TableMeta | null> {
      try {
        if (engine === "as400") {
          const cols = await queryRows(
            `SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
             FROM QSYS2.SYSCOLUMNS
             WHERE TABLE_NAME = ?`,
            [table.toUpperCase()],
          );
          if (cols.length > 0) {
            return {
              name: table,
              columns: cols.map(
                (r): ColumnMeta => ({
                  name: String(r.COLUMN_NAME ?? r.column_name),
                  dataType: String(r.DATA_TYPE ?? r.data_type ?? "unknown"),
                  isNullable:
                    String(r.IS_NULLABLE ?? r.is_nullable ?? "YES").toUpperCase() !==
                    "NO",
                  isPrimaryKey: false,
                }),
              ),
              rowEstimate: null,
            };
          }
        }
      } catch {
        // fall through
      }

      try {
        await queryRows(
          engine === "access"
            ? `SELECT TOP 0 * FROM [${table.replace(/]/g, "]]")}]`
            : `SELECT * FROM "${table.replace(/"/g, '""')}" FETCH FIRST 0 ROWS ONLY`,
        );
        return {
          name: table,
          columns: [],
          rowEstimate: null,
        };
      } catch (err) {
        const msg = (err as Error).message || "";
        if (/not found|does not exist|cannot find|SQL0204/i.test(msg)) {
          return null;
        }
        throw err;
      }
    },
    async query(text: string, values: unknown[]): Promise<Record<string, unknown>[]> {
      return queryRows(text, values);
    },
    async close() {
      await conn.close().catch(() => undefined);
    },
  };
}

export function createAccessDriverFactory(
  odbcModule?: OdbcModule | null,
): DriverFactory {
  return (url, options) => createOdbcSqlDriver("access", url, options, odbcModule);
}

export function createAs400DriverFactory(
  odbcModule?: OdbcModule | null,
): DriverFactory {
  return (url, options) => createOdbcSqlDriver("as400", url, options, odbcModule);
}

export const createAccessDriver: DriverFactory = createAccessDriverFactory();
export const createAs400Driver: DriverFactory = createAs400DriverFactory();
