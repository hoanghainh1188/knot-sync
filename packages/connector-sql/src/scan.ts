import type {
  ConnectorScanOptions,
  FileEntry,
  ScanIssue,
  SqlSourceConfig,
} from "@hoanghainh/knot-sync-core";
import type { DriverFactory, SqlDriver } from "./driver.js";
import { createMysqlDriver } from "./mysql.js";
import { createPostgresDriver } from "./postgres.js";

export function defaultDriverFactory(type: "postgres" | "mysql"): DriverFactory {
  return type === "postgres" ? createPostgresDriver : createMysqlDriver;
}

/** Map an allow-listed table into a FileEntry for the existing scan inventory. */
export function tableToFileEntry(
  source: SqlSourceConfig,
  table: string,
  rowEstimate: number | null,
): FileEntry {
  const size = rowEstimate !== null && rowEstimate >= 0 ? Math.min(rowEstimate, Number.MAX_SAFE_INTEGER) : 0;
  return {
    sourceId: source.id,
    absPath: `sql://${source.id}/${encodeURIComponent(table)}`,
    relPath: table,
    ext: "",
    type: "db_row",
    size,
    mtimeMs: Date.now(),
    hash: null,
  };
}

export async function* scanSql(
  source: SqlSourceConfig,
  options: ConnectorScanOptions = {},
  createDriver: DriverFactory = defaultDriverFactory(source.type),
): AsyncGenerator<FileEntry> {
  let driver: SqlDriver | undefined;
  try {
    driver = await createDriver(source.url);
    await driver.enableReadOnly();
    for (const table of Object.keys(source.allow)) {
      try {
        const meta = await driver.introspectTable(table);
        if (!meta) {
          options.onIssue?.({
            sourceId: source.id,
            path: table,
            code: "ENOENT",
            message: `Allow-listed table "${table}" was not found in the database.`,
          });
          continue;
        }
        yield tableToFileEntry(source, table, meta.rowEstimate);
      } catch (err) {
        const issue: ScanIssue = {
          sourceId: source.id,
          path: table,
          code: "OTHER",
          message: `Failed to introspect table "${table}": ${(err as Error).message}`,
        };
        options.onIssue?.(issue);
      }
    }
  } catch (err) {
    options.onIssue?.({
      sourceId: source.id,
      path: source.id,
      code: "OTHER",
      message:
        `Failed to connect to ${source.type} source "${source.id}" ` +
        `(env ${source.urlEnv}): ${(err as Error).message}`,
    });
  } finally {
    await driver?.close().catch(() => undefined);
  }
}
