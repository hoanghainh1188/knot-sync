import type { CatalogColumn, CatalogDocument, CatalogLabel } from "./types.js";

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
