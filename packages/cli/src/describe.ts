import {
  buildDescribeDraft,
  CatalogError,
  createCatalogPlugin,
  loadCatalogFile,
  loadCustomerDictionary,
  loadDefinitionExcel,
  mergeCatalog,
  writeCatalogFile,
  type DefinitionMapping,
} from "@hoanghainh/knot-sync-catalog";
import {
  defaultDriverFactory,
  quoteIdent,
  type DriverFactory,
} from "@hoanghainh/knot-sync-connector-sql";
import {
  isSqlSource,
  loadPlugins,
  type AppConfig,
  type SqlSourceConfig,
  type StructuralConfig,
} from "@hoanghainh/knot-sync-core";
import type { Io } from "./main.js";
import { loadAppPlugins } from "./plugins.js";

export function createDescribeSqlHooks(
  factories?: Record<string, DriverFactory>,
  onSampleSkip?: (message: string) => void,
) {
  const factoryFor = (source: SqlSourceConfig): DriverFactory =>
    factories?.[source.id] ?? defaultDriverFactory(source.type);

  return {
    async introspectTable(source: SqlSourceConfig, table: string) {
      const driver = await factoryFor(source)(source.url);
      try {
        await driver.enableReadOnly();
        const meta = await driver.introspectTable(table);
        if (!meta) return null;
        return {
          name: meta.name,
          columns: meta.columns.map((c) => ({ name: c.name, dataType: c.dataType })),
        };
      } finally {
        await driver.close().catch(() => undefined);
      }
    },
    async sampleDistinct(
      source: SqlSourceConfig,
      table: string,
      column: string,
      limit: number,
    ) {
      const allow = source.allow[table];
      if (!allow || !allow.columns.includes(column)) return [];
      const driver = await factoryFor(source)(source.url);
      try {
        await driver.enableReadOnly();
        const dialect = source.type;
        const tableSql = quoteIdent(table, dialect);
        const colSql = quoteIdent(column, dialect);
        const lim = Math.max(1, Math.min(200, Math.floor(limit)));
        const text = `SELECT DISTINCT ${colSql} AS v FROM ${tableSql} WHERE ${colSql} IS NOT NULL LIMIT ${lim}`;
        const rows = await driver.query(text, []);
        return rows
          .map((r) => r.v)
          .filter((v) => v !== null && v !== undefined)
          .map((v) => String(v))
          .slice(0, lim);
      } catch (err) {
        onSampleSkip?.(
          `Skipped distinct sample for ${source.id}.${table}.${column}: ${(err as Error).message}`,
        );
        return [];
      } finally {
        await driver.close().catch(() => undefined);
      }
    },
  };
}

/**
 * Run `knot-sync describe`: generate/update the Semantic Catalog for SQL sources.
 */
export async function cmdDescribe(
  structural: StructuralConfig,
  config: AppConfig,
  io: Io,
  options?: { sqlDriverFactories?: Record<string, DriverFactory> },
): Promise<number> {
  const sqlSources = config.sources.filter(isSqlSource);
  if (sqlSources.length === 0) {
    io.err(
      'No postgres/mysql sources found. Add a SQL source with an "allow" list, then re-run describe.',
    );
    return 1;
  }

  const catalogOpts: Parameters<typeof createCatalogPlugin>[0] = {};
  if (config.catalog.dictionary) {
    catalogOpts.customerDict = await loadCustomerDictionary(config.catalog.dictionary);
  }
  if (config.catalog.definitionExcel) {
    catalogOpts.definitionIndex = await loadDefinitionExcel(
      config.catalog.definitionExcel,
      config.catalog.definitionMapping as DefinitionMapping,
    );
  }

  const catalogHost = await loadPlugins({
    builtins: [createCatalogPlugin(catalogOpts)],
    entries: [],
    baseDir: config.baseDir,
    pluginSettings: {},
  });
  const appHost = await loadAppPlugins(structural);
  for (const [id, src] of appHost.catalogSources) {
    if (!catalogHost.catalogSources.has(id)) {
      catalogHost.catalogSources.set(id, src);
    }
  }

  const sampleWarnings: string[] = [];
  const existing = await loadCatalogFile(config.catalog.path);
  const draft = await buildDescribeDraft({
    sqlSources,
    catalogSources: [...catalogHost.catalogSources.values()],
    hooks: createDescribeSqlHooks(options?.sqlDriverFactories, (msg) =>
      sampleWarnings.push(msg),
    ),
    existing,
  });
  const merged = mergeCatalog(existing, draft);
  await writeCatalogFile(config.catalog.path, merged);

  let tableCount = 0;
  let columnCount = 0;
  for (const src of Object.values(merged.sources)) {
    for (const table of Object.values(src.tables)) {
      tableCount += 1;
      columnCount += Object.keys(table.columns).length;
    }
  }
  for (const w of sampleWarnings.slice(0, 20)) io.err(w);
  if (sampleWarnings.length > 20) {
    io.err(`…and ${sampleWarnings.length - 20} more sample skip warnings`);
  }
  io.out(`Wrote catalog ${config.catalog.path}`);
  io.out(`Sources: ${sqlSources.length}, tables: ${tableCount}, columns: ${columnCount}`);
  io.out(`Next: review labels, set reviewed: true on confirmed entries, then knot-sync serve`);
  return 0;
}

export { CatalogError };
