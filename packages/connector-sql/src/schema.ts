import type { SqlSourceConfig } from "@hoanghainh/knot-sync-core";
import type { DriverFactory, TableMeta } from "./driver.js";
import { defaultDriverFactory } from "./scan.js";

export interface PublicColumnSchema {
  name: string;
  dataType: string;
  isNullable: boolean;
  isPrimaryKey: boolean;
  allowed: boolean;
}

export interface PublicTableSchema {
  sourceId: string;
  table: string;
  columns: PublicColumnSchema[];
}

/** Introspect and filter columns to the allow-list. */
export async function describeAllowedTable(
  source: SqlSourceConfig,
  table: string,
  createDriver: DriverFactory = defaultDriverFactory(source.type),
): Promise<PublicTableSchema> {
  const allow = source.allow[table];
  if (!allow) {
    throw new Error(
      `Table "${table}" is not allow-listed for source "${source.id}".`,
    );
  }
  const allowedSet = new Set(allow.columns);
  const driver = await createDriver(source.url);
  try {
    await driver.enableReadOnly();
    const meta: TableMeta | null = await driver.introspectTable(table);
    if (!meta) {
      throw new Error(`Table "${table}" was not found in source "${source.id}".`);
    }
    const columns: PublicColumnSchema[] = meta.columns
      .filter((c) => allowedSet.has(c.name))
      .map((c) => ({
        name: c.name,
        dataType: c.dataType,
        isNullable: c.isNullable,
        isPrimaryKey: c.isPrimaryKey,
        allowed: true,
      }));
    // Include allow-listed columns missing from DB as stubs so config mistakes are visible.
    for (const name of allow.columns) {
      if (!columns.some((c) => c.name === name)) {
        columns.push({
          name,
          dataType: "unknown",
          isNullable: true,
          isPrimaryKey: false,
          allowed: true,
        });
      }
    }
    return { sourceId: source.id, table, columns };
  } finally {
    await driver.close().catch(() => undefined);
  }
}
