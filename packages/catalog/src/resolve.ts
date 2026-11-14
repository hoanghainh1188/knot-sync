import type {
  CatalogColumn,
  CatalogDocument,
  CatalogLabel,
} from "./types.js";

export type AllowColumnsMap = Record<string, readonly string[] | ReadonlySet<string> | undefined>;

export interface ActiveLookupJoin {
  name: string;
  targetTable: string;
  localColumn: string;
  targetColumn: string;
  columns: Record<string, CatalogColumn>;
}

export interface ResolvedColumnTarget {
  qualifiedName: string;
  joinName?: string;
  column: string;
  catalogColumn?: CatalogColumn;
}

export class CatalogResolveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CatalogResolveError";
  }
}

function labelMatches(label: CatalogLabel, name: string): boolean {
  return (
    (label.ja !== "" && label.ja === name) ||
    (label.vi !== "" && label.vi === name) ||
    (label.en !== "" && label.en === name)
  );
}

/** Format labels for enrichment display. */
export function formatColumnLabels(col: CatalogColumn): string {
  const parts: string[] = [];
  if (col.label.ja) parts.push(`ja: ${col.label.ja}`);
  if (col.label.vi) parts.push(`vi: ${col.label.vi}`);
  if (col.label.en) parts.push(`en: ${col.label.en}`);
  return parts.join("; ");
}

export function getCatalogColumn(
  catalog: CatalogDocument | undefined,
  sourceId: string,
  table: string,
  physicalColumn: string,
): CatalogColumn | undefined {
  return catalog?.sources[sourceId]?.tables[table]?.columns[physicalColumn];
}

/**
 * Resolve a filter column name to a physical allow-listed column.
 * Accepts physical name or unique business label (ja/vi/en).
 */
export function resolveColumnName(
  catalog: CatalogDocument | undefined,
  sourceId: string,
  table: string,
  name: string,
  allowedColumns: Set<string>,
): string {
  if (allowedColumns.has(name)) return name;

  if (!catalog) {
    throw new CatalogResolveError(
      `Filter column "${name}" is not allow-listed for table "${table}".`,
    );
  }

  const tableEntry = catalog.sources[sourceId]?.tables[table];
  if (!tableEntry) {
    throw new CatalogResolveError(
      `Filter column "${name}" is not allow-listed for table "${table}".`,
    );
  }

  const matches: string[] = [];
  for (const [physical, col] of Object.entries(tableEntry.columns)) {
    if (!allowedColumns.has(physical)) continue;
    if (labelMatches(col.label, name)) matches.push(physical);
  }

  if (matches.length === 1) return matches[0]!;
  if (matches.length > 1) {
    throw new CatalogResolveError(
      `Business name "${name}" matches multiple columns (${matches.join(", ")}) on table "${table}". ` +
        `Use the physical column name instead.`,
    );
  }
  throw new CatalogResolveError(
    `Filter column "${name}" is not an allow-listed physical name or unique catalog label for table "${table}".`,
  );
}

function isColAllowed(allowMap: AllowColumnsMap, table: string, col: string): boolean {
  const entry = allowMap[table];
  if (!entry) return false;
  return Array.isArray(entry) ? entry.includes(col) : (entry as ReadonlySet<string>).has(col);
}

/**
 * Return only lookup joins on `baseTable` that pass BOTH safety gates:
 * 1) `reviewed === true` in catalog
 * 2) `source.allow` covers `baseTable.localColumn`, `targetTable.targetColumn`, and exposed columns.
 */
export function resolveActiveLookupJoins(
  catalog: CatalogDocument | undefined,
  sourceId: string,
  baseTable: string,
  allowMap: AllowColumnsMap,
): ActiveLookupJoin[] {
  const tableEntry = catalog?.sources[sourceId]?.tables[baseTable];
  if (!tableEntry?.lookupJoins?.length) return [];

  const active: ActiveLookupJoin[] = [];
  for (const join of tableEntry.lookupJoins) {
    if (join.reviewed !== true) continue;
    if (!isColAllowed(allowMap, baseTable, join.localColumn)) continue;
    if (!isColAllowed(allowMap, join.targetTable, join.targetColumn)) continue;

    const exposedColumns: Record<string, CatalogColumn> = {};
    for (const [colName, colMeta] of Object.entries(join.columns)) {
      if (colMeta.expose === false) continue;
      if (!isColAllowed(allowMap, join.targetTable, colName)) continue;
      exposedColumns[colName] = colMeta;
    }
    if (Object.keys(exposedColumns).length === 0) continue;

    active.push({
      name: join.name,
      targetTable: join.targetTable,
      localColumn: join.localColumn,
      targetColumn: join.targetColumn,
      columns: exposedColumns,
    });
  }
  return active;
}

/**
 * Resolve a column reference (physical base column, `<joinName>.<col>`, or business label)
 * against allow-listed base columns and active (reviewed + allow-listed) lookup joins.
 */
export function resolveQueryColumn(
  catalog: CatalogDocument | undefined,
  sourceId: string,
  baseTable: string,
  name: string,
  allowedBaseColumns: Set<string>,
  allowMap: AllowColumnsMap,
  activeJoins?: ActiveLookupJoin[],
): ResolvedColumnTarget {
  if (allowedBaseColumns.has(name)) {
    return {
      qualifiedName: name,
      column: name,
      catalogColumn: getCatalogColumn(catalog, sourceId, baseTable, name),
    };
  }

  const joins = activeJoins ?? resolveActiveLookupJoins(catalog, sourceId, baseTable, allowMap);
  const tableEntry = catalog?.sources[sourceId]?.tables[baseTable];

  // Check explicit `<joinName>.<colName>` syntax
  const dotIdx = name.indexOf(".");
  if (dotIdx > 0 && dotIdx < name.length - 1 && name.indexOf(".", dotIdx + 1) === -1) {
    const joinName = name.slice(0, dotIdx);
    const colName = name.slice(dotIdx + 1);
    const activeJoin = joins.find((j) => j.name === joinName);
    if (activeJoin && activeJoin.columns[colName]) {
      return {
        qualifiedName: `${joinName}.${colName}`,
        joinName,
        column: colName,
        catalogColumn: activeJoin.columns[colName],
      };
    }

    const rawJoin = tableEntry?.lookupJoins?.find((j) => j.name === joinName);
    if (rawJoin) {
      if (rawJoin.reviewed !== true) {
        throw new CatalogResolveError(
          `Lookup join "${joinName}" on table "${baseTable}" is not reviewed (reviewed: true required).`,
        );
      }
      throw new CatalogResolveError(
        `Lookup column "${name}" on table "${baseTable}" is not allow-listed in source.allow.`,
      );
    }
  }

  // Check business labels across base allow-listed columns and active lookup columns
  const matches: ResolvedColumnTarget[] = [];
  if (tableEntry) {
    for (const [physical, col] of Object.entries(tableEntry.columns)) {
      if (!allowedBaseColumns.has(physical)) continue;
      if (labelMatches(col.label, name)) {
        matches.push({ qualifiedName: physical, column: physical, catalogColumn: col });
      }
    }
  }
  for (const j of joins) {
    for (const [colName, col] of Object.entries(j.columns)) {
      if (labelMatches(col.label, name)) {
        matches.push({
          qualifiedName: `${j.name}.${colName}`,
          joinName: j.name,
          column: colName,
          catalogColumn: col,
        });
      }
    }
  }

  if (matches.length === 1) return matches[0]!;
  if (matches.length > 1) {
    throw new CatalogResolveError(
      `Business name "${name}" matches multiple columns (${matches.map((m) => m.qualifiedName).join(", ")}) on table "${baseTable}". ` +
        `Use the qualified column name instead.`,
    );
  }

  // Surface clear error if label belongs to an unreviewed or disallowed lookup join
  for (const rawJoin of tableEntry?.lookupJoins ?? []) {
    for (const col of Object.values(rawJoin.columns)) {
      if (labelMatches(col.label, name)) {
        if (rawJoin.reviewed !== true) {
          throw new CatalogResolveError(
            `Lookup join "${rawJoin.name}" for "${name}" on table "${baseTable}" is not reviewed (reviewed: true required).`,
          );
        }
        throw new CatalogResolveError(
          `Lookup join "${rawJoin.name}" for "${name}" on table "${baseTable}" is not allow-listed in source.allow.`,
        );
      }
    }
  }

  throw new CatalogResolveError(
    `Column "${name}" is not allow-listed (physical name, active lookup column, or unique catalog label) for table "${baseTable}".`,
  );
}

const ENUM_LIST_MAX = 20;

/**
 * Validate equals/`in` filter values against catalog enum values when present.
 * Returns null when OK; otherwise an error message.
 */
export function validateEnumFilter(
  col: CatalogColumn | undefined,
  op: "eq" | "in" | "range" | "contains",
  values: Array<string | number | boolean | null>,
): string | null {
  if (!col || col.values.length === 0) return null;
  if (op !== "eq" && op !== "in") return null;

  const allowed = new Set(col.values);
  const bad: string[] = [];
  for (const v of values) {
    if (v === null) continue;
    const s = String(v);
    if (!allowed.has(s)) bad.push(s);
  }
  if (bad.length === 0) return null;
  const listed = col.values.slice(0, ENUM_LIST_MAX);
  const more = col.values.length > ENUM_LIST_MAX ? ` (and ${col.values.length - ENUM_LIST_MAX} more)` : "";
  return (
    `Value(s) ${bad.map((b) => JSON.stringify(b)).join(", ")} not in catalog valid values for this column. ` +
    `Allowed: ${listed.map((x) => JSON.stringify(x)).join(", ")}${more}.`
  );
}
