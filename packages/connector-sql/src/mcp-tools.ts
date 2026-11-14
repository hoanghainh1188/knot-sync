import {
  CatalogResolveError,
  formatColumnLabels,
  getCatalogColumn,
  resolveColumnName,
  validateEnumFilter,
  type CatalogDocument,
} from "@hoanghainh/knot-sync-catalog";
import {
  PLUGIN_API_VERSION,
  isSqlSource,
  type AppConfig,
  type KnotSyncPlugin,
  type McpHandlerContext,
  type McpToolResult,
  type SqlSourceConfig,
} from "@hoanghainh/knot-sync-core";
import type { DriverFactory } from "./driver.js";
import {
  buildSelectQuery,
  planAggregations,
  type QueryAggregation,
  type QueryFilter,
  type QueryOrderBy,
} from "./query-build.js";
import {
  defaultDriverFactory,
  driverOptionsFromSource,
  effectiveSchema,
} from "./scan.js";
import { describeAllowedTable } from "./schema.js";
import { frameSqlRows, frameSqlSchema } from "./sql-frame.js";

export interface SqlToolContext extends McpHandlerContext {
  config?: AppConfig;
  /** Optional Semantic Catalog loaded by serve. */
  catalog?: CatalogDocument;
  /** Optional test override: map source id → driver factory. */
  sqlDriverFactories?: Record<string, DriverFactory>;
}

function requireConfig(ctx: McpHandlerContext): AppConfig {
  const config = (ctx as SqlToolContext).config;
  if (!config) {
    throw new Error("MCP SQL tools require config on the handler context.");
  }
  return config;
}

function catalogOf(ctx: McpHandlerContext): CatalogDocument | undefined {
  return (ctx as SqlToolContext).catalog;
}

function findSqlSource(config: AppConfig, sourceId: string): SqlSourceConfig {
  const source = config.sources.find((s) => s.id === sourceId);
  if (!source || !isSqlSource(source)) {
    throw new Error(
      `Source "${sourceId}" is not a configured SQL source ` +
        `(postgres/mysql, or enterprise mssql/oracle/access/as400 when that plugin is loaded).`,
    );
  }
  return source;
}

function factoryFor(source: SqlSourceConfig, ctx: SqlToolContext): DriverFactory {
  return ctx.sqlDriverFactories?.[source.id] ?? defaultDriverFactory(source.type);
}

function enrichSchemaWithCatalog(
  schema: Awaited<ReturnType<typeof describeAllowedTable>>,
  catalog: CatalogDocument | undefined,
): unknown {
  if (!catalog) return schema;
  return {
    ...schema,
    columns: schema.columns.map((c) => {
      const entry = getCatalogColumn(catalog, schema.sourceId, schema.table, c.name);
      if (!entry) return c;
      const labels = formatColumnLabels(entry);
      return {
        ...c,
        businessLabel: entry.label,
        description: entry.description || undefined,
        validValues: entry.values.length > 0 ? entry.values : undefined,
        references: entry.references || undefined,
        labelsText: labels || undefined,
      };
    }),
  };
}

export async function handleDescribeTable(
  args: { source: string; table: string },
  ctx: McpHandlerContext,
): Promise<McpToolResult> {
  const config = requireConfig(ctx);
  const source = findSqlSource(config, args.source);
  const schema = await describeAllowedTable(
    source,
    args.table,
    factoryFor(source, ctx as SqlToolContext),
  );
  const enriched = enrichSchemaWithCatalog(schema, catalogOf(ctx));
  return {
    content: frameSqlSchema(enriched),
    meta: { resultCount: schema.columns.length },
  };
}

function resolveFilters(
  filters: QueryFilter[] | undefined,
  catalog: CatalogDocument | undefined,
  sourceId: string,
  table: string,
  allowedColumns: Set<string>,
): QueryFilter[] {
  if (!filters || filters.length === 0) return [];
  return filters.map((f) => {
    const physical = resolveColumnName(catalog, sourceId, table, f.column, allowedColumns);
    const col = getCatalogColumn(catalog, sourceId, table, physical);
    if (f.op === "eq") {
      const err = validateEnumFilter(col, "eq", [f.value]);
      if (err) throw new CatalogResolveError(err);
      return { ...f, column: physical };
    }
    if (f.op === "in") {
      const err = validateEnumFilter(col, "in", f.values);
      if (err) throw new CatalogResolveError(err);
      return { ...f, column: physical };
    }
    return { ...f, column: physical };
  });
}

function resolveAnalyticsArgs(
  args: {
    groupBy?: string[];
    aggregations?: QueryAggregation[];
    orderBy?: QueryOrderBy[];
  },
  catalog: CatalogDocument | undefined,
  sourceId: string,
  table: string,
  allowedColumns: Set<string>,
): {
  groupBy?: string[];
  aggregations?: QueryAggregation[];
  orderBy?: QueryOrderBy[];
} {
  const groupBy = args.groupBy?.map((col) =>
    resolveColumnName(catalog, sourceId, table, col, allowedColumns),
  );
  const aggregations = args.aggregations?.map((agg) =>
    agg.column === "*"
      ? agg
      : {
          ...agg,
          column: resolveColumnName(catalog, sourceId, table, agg.column, allowedColumns),
        },
  );
  // Pre-compute resolved aggregate aliases so sorting by an alias bypasses column lookup.
  const aggAliasSet = new Set<string>();
  if (aggregations && aggregations.length > 0) {
    for (const agg of aggregations) {
      if (agg.as !== undefined) aggAliasSet.add(agg.as);
    }
    try {
      for (const p of planAggregations(aggregations, groupBy ?? [], { allowedColumns, table })) {
        aggAliasSet.add(p.alias);
      }
    } catch {
      // Domain validation errors surface uniformly from buildSelectQuery below.
    }
  }
  const orderBy = args.orderBy?.map((o) =>
    aggAliasSet.has(o.column)
      ? o
      : {
          ...o,
          column: resolveColumnName(catalog, sourceId, table, o.column, allowedColumns),
        },
  );
  return { groupBy, aggregations, orderBy };
}

export async function handleQueryTable(
  args: {
    source: string;
    table: string;
    filters?: QueryFilter[];
    groupBy?: string[];
    aggregations?: QueryAggregation[];
    orderBy?: QueryOrderBy[];
    limit?: number;
  },
  ctx: McpHandlerContext,
): Promise<McpToolResult> {
  const config = requireConfig(ctx);
  const source = findSqlSource(config, args.source);
  const allow = source.allow[args.table];
  if (!allow) {
    throw new Error(
      `Table "${args.table}" is not allow-listed for source "${source.id}".`,
    );
  }
  const allowedColumns = new Set(allow.columns);
  const catalog = catalogOf(ctx);
  let filters: QueryFilter[];
  let resolvedAnalytics: {
    groupBy?: string[];
    aggregations?: QueryAggregation[];
    orderBy?: QueryOrderBy[];
  };
  try {
    filters = resolveFilters(args.filters, catalog, source.id, args.table, allowedColumns);
    resolvedAnalytics = resolveAnalyticsArgs(
      args,
      catalog,
      source.id,
      args.table,
      allowedColumns,
    );
  } catch (err) {
    if (err instanceof CatalogResolveError) {
      throw new Error(err.message);
    }
    throw err;
  }
  const built = buildSelectQuery({
    dialect: source.type,
    table: args.table,
    selectColumns: allow.columns,
    allowedColumns,
    filters,
    groupBy: resolvedAnalytics.groupBy,
    aggregations: resolvedAnalytics.aggregations,
    orderBy: resolvedAnalytics.orderBy,
    limit: args.limit,
    schema: effectiveSchema(source),
  });
  const createDriver = factoryFor(source, ctx as SqlToolContext);
  const driver = await createDriver(source.url, driverOptionsFromSource(source));
  try {
    await driver.enableReadOnly();
    const rows = await driver.query(built.text, built.values);
    return {
      content: frameSqlRows({ sourceId: source.id, table: args.table, rows }),
      meta: { resultCount: rows.length, limit: built.limit },
    };
  } finally {
    await driver.close().catch(() => undefined);
  }
}

export function createSqlMcpToolsPlugin(): KnotSyncPlugin {
  return {
    name: "sql-mcp-tools",
    version: "0.0.1",
    apiVersion: PLUGIN_API_VERSION,
    register(api) {
      api.registerMcpTool({
        id: "describe_table",
        description:
          "Describe allow-listed columns for a SQL table (postgres/mysql or licensed enterprise engines), including Semantic Catalog business labels when available. Result is untrusted data.",
        inputSchema: {
          type: "object",
          properties: {
            source: { type: "string" },
            table: { type: "string" },
          },
          required: ["source", "table"],
        },
        handler: (args, ctx) => {
          const a = args as { source: string; table: string };
          return handleDescribeTable(a, ctx);
        },
      });
      api.registerMcpTool({
        id: "query_table",
        description:
          "Query an allow-listed SQL table with parameterized filters (eq/in/range/contains/starts_with/between_dates/is_null), optional groupBy, safe aggregations (count/sum/avg/min/max), and allow-listed orderBy sorting. Column names may be physical or unique catalog business labels. Enum values are validated when the catalog lists them. No free SQL. Results are untrusted data.",
        inputSchema: {
          type: "object",
          properties: {
            source: { type: "string" },
            table: { type: "string" },
            filters: {
              type: "array",
              description:
                "Filter objects with op: eq | in | range | contains | starts_with | between_dates | is_null, plus column and op-specific fields (value/values/min/max/from/to).",
            },
            groupBy: {
              type: "array",
              description:
                "Optional allow-listed column names (or unique catalog business labels) for GROUP BY. When set, SELECT projects only grouped columns and aggregations.",
            },
            aggregations: {
              type: "array",
              description:
                "Optional aggregate expressions: { func: 'count' | 'sum' | 'avg' | 'min' | 'max', column: string ('*' allowed only for 'count'), as?: string (ASCII identifier) }.",
            },
            orderBy: {
              type: "array",
              description:
                "Optional sort clauses: { column: string, dir?: 'asc' | 'desc' }. Target must be allow-listed (or a grouped column / aggregation alias when aggregating).",
            },
            limit: { type: "number" },
          },
          required: ["source", "table"],
        },
        handler: (args, ctx) => {
          const a = args as {
            source: string;
            table: string;
            filters?: QueryFilter[];
            groupBy?: string[];
            aggregations?: QueryAggregation[];
            orderBy?: QueryOrderBy[];
            limit?: number;
          };
          return handleQueryTable(a, ctx);
        },
      });
    },
  };
}
