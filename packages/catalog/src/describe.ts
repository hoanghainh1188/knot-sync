import type { CatalogSource, CatalogSuggestion, SqlSourceConfig } from "@hoanghainh/knot-sync-core";
import { emptyColumn, emptyTable, type CatalogDocument } from "./types.js";
import { applySuggestionsWithFillEmpty } from "./sources.js";

export const DISTINCT_SAMPLE_LIMIT = 50;

/**
 * CatalogSource ids that only fill blank labels (paid local LLM).
 * Must match `CATALOG_LLM_SOURCE_ID` in packages/catalog-llm (avoid importing paid package).
 */
export const FILL_EMPTY_CATALOG_SOURCE_IDS = new Set(["catalog-llm"]);

/** Column meta from SQL introspection (injected to keep catalog free of drivers). */
export interface DescribeColumnMeta {
  name: string;
  dataType: string;
  references?: string;
}

export interface DescribeTableMeta {
  name: string;
  columns: DescribeColumnMeta[];
}

export interface DescribeSqlHooks {
  /** Introspect one allow-listed table; return null if missing. */
  introspectTable(source: SqlSourceConfig, table: string): Promise<DescribeTableMeta | null>;
  /**
   * Sample distinct values for one column (read-only, bounded).
   * Return [] when sampling is skipped (blob/text/pii).
   */
  sampleDistinct(
    source: SqlSourceConfig,
    table: string,
    column: string,
    limit: number,
  ): Promise<string[]>;
}

function isWideType(dataType: string): boolean {
  const t = dataType.toLowerCase();
  return (
    t.includes("text") ||
    t.includes("blob") ||
    t.includes("bytea") ||
    t.includes("json") ||
    t.includes("xml") ||
    t.includes("clob")
  );
}

function filterAllowedReference(
  ref: string | undefined,
  allow: SqlSourceConfig["allow"],
): string | undefined {
  if (!ref) return undefined;
  const dot = ref.indexOf(".");
  if (dot <= 0 || dot >= ref.length - 1) return undefined;
  const targetTable = ref.slice(0, dot);
  const targetCol = ref.slice(dot + 1);
  return allow[targetTable]?.columns.includes(targetCol) ? ref : undefined;
}

function suggestionToColumn(
  suggestion: CatalogSuggestion,
  dbType: string,
  samples: string[],
  references?: string,
): ReturnType<typeof emptyColumn> {
  return emptyColumn({
    label: {
      ja: suggestion.label?.ja ?? "",
      vi: suggestion.label?.vi ?? "",
      en: suggestion.label?.en ?? "",
    },
    description: suggestion.description ?? "",
    type: dbType,
    values: suggestion.values && suggestion.values.length > 0 ? suggestion.values : samples,
    ...(references ? { references } : {}),
    pii: suggestion.pii ?? false,
    expose: true,
    reviewed: false,
  });
}

/**
 * Build a draft catalog for the given SQL sources using hooks + catalog-sources.
 */
export async function buildDescribeDraft(options: {
  sqlSources: SqlSourceConfig[];
  catalogSources: CatalogSource[];
  hooks: DescribeSqlHooks;
  /** Existing catalog used only to skip sampling for columns already tagged pii. */
  existing?: CatalogDocument;
}): Promise<CatalogDocument> {
  const draft: CatalogDocument = { version: 1, sources: {} };
  const { hooks, catalogSources, existing } = options;

  for (const source of options.sqlSources) {
    const tables: CatalogDocument["sources"][string]["tables"] = {};
    for (const [tableName, allow] of Object.entries(source.allow)) {
      const meta = await hooks.introspectTable(source, tableName);
      const columnMetas: DescribeColumnMeta[] =
        meta?.columns.filter((c) => allow.columns.includes(c.name)) ??
        allow.columns.map((name) => ({ name, dataType: "unknown" }));

      // Include allow-listed columns missing from introspection.
      for (const name of allow.columns) {
        if (!columnMetas.some((c) => c.name === name)) {
          columnMetas.push({ name, dataType: "unknown" });
        }
      }

      const columns: Record<string, ReturnType<typeof emptyColumn>> = {};
      for (const col of columnMetas) {
        const existingCol = existing?.sources[source.id]?.tables[tableName]?.columns[col.name];
        let samples: string[] = [];
        if (!existingCol?.pii && !isWideType(col.dataType)) {
          samples = await hooks.sampleDistinct(
            source,
            tableName,
            col.name,
            DISTINCT_SAMPLE_LIMIT,
          );
        }
        const overwriteSources = catalogSources.filter(
          (s) => !FILL_EMPTY_CATALOG_SOURCE_IDS.has(s.id),
        );
        const fillEmptySources = catalogSources.filter((s) =>
          FILL_EMPTY_CATALOG_SOURCE_IDS.has(s.id),
        );
        const suggestion = await applySuggestionsWithFillEmpty(
          overwriteSources,
          fillEmptySources,
          {
            sourceId: source.id,
            table: tableName,
            column: col.name,
            dbType: col.dataType,
            sampleValues: samples,
          },
        );
        if (samples.length > 0 && (!suggestion.values || suggestion.values.length === 0)) {
          suggestion.values = samples;
        }
        const allowedRef = filterAllowedReference(col.references, source.allow);
        columns[col.name] = suggestionToColumn(suggestion, col.dataType, samples, allowedRef);
      }

      tables[tableName] = emptyTable({
        label: { ja: "", vi: "", en: "" },
        columns,
      });
    }
    draft.sources[source.id] = { tables };
  }
  return draft;
}
