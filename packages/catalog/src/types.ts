/** Multilingual business label. Empty strings mean unset. */
export interface CatalogLabel {
  ja: string;
  vi: string;
  en: string;
}

export interface CatalogColumn {
  label: CatalogLabel;
  description: string;
  type: string;
  /** Distinct / enum hints (short lists only). */
  values: string[];
  /** Optional foreign-key target in `"<table>.<column>"` format. */
  references?: string;
  pii: boolean;
  expose: boolean;
  reviewed: boolean;
}

/** Pre-approved single-hop LEFT JOIN relationship on a catalog table. */
export interface CatalogLookupJoin {
  /** Logical alias & prefix for lookup columns (e.g., "tokuisaki"). */
  name: string;
  /** Target table or view name (e.g., "tokuisaki_mst"). */
  targetTable: string;
  /** Join key column on the base table. */
  localColumn: string;
  /** Join key column on the target table. */
  targetColumn: string;
  /** Exposed columns from the target table. */
  columns: Record<string, CatalogColumn>;
  /** Must be explicitly true in catalog YAML to activate at query time. */
  reviewed: boolean;
}

export interface CatalogTable {
  label: CatalogLabel;
  description: string;
  reviewed: boolean;
  columns: Record<string, CatalogColumn>;
  /** Optional pre-approved lookup joins to related tables/views. */
  lookupJoins?: CatalogLookupJoin[];
}

export interface CatalogSourceEntry {
  tables: Record<string, CatalogTable>;
}

export interface CatalogDocument {
  version: 1;
  sources: Record<string, CatalogSourceEntry>;
}

export function emptyLabel(): CatalogLabel {
  return { ja: "", vi: "", en: "" };
}

export function emptyColumn(partial?: Partial<CatalogColumn>): CatalogColumn {
  const { label, values, references, ...rest } = partial ?? {};
  const trimmedRef = typeof references === "string" ? references.trim() : "";
  return {
    description: "",
    type: "",
    pii: false,
    expose: true,
    reviewed: false,
    ...rest,
    ...(trimmedRef !== "" ? { references: trimmedRef } : {}),
    label: { ...emptyLabel(), ...(label ?? {}) },
    values: values ? [...values] : [],
  };
}

export function emptyLookupJoin(
  partial: Omit<Partial<CatalogLookupJoin>, "name" | "targetTable" | "localColumn" | "targetColumn"> &
    Pick<CatalogLookupJoin, "name" | "targetTable" | "localColumn" | "targetColumn">,
): CatalogLookupJoin {
  const { columns, reviewed, ...rest } = partial;
  return {
    ...rest,
    columns: { ...(columns ?? {}) },
    reviewed: reviewed ?? false,
  };
}

export function emptyTable(partial?: Partial<CatalogTable>): CatalogTable {
  const { label, columns, lookupJoins, ...rest } = partial ?? {};
  return {
    description: "",
    reviewed: false,
    ...rest,
    label: { ...emptyLabel(), ...(label ?? {}) },
    columns: { ...(columns ?? {}) },
    ...(lookupJoins && lookupJoins.length > 0
      ? { lookupJoins: lookupJoins.map((j) => emptyLookupJoin(j)) }
      : {}),
  };
}

export function emptyCatalog(): CatalogDocument {
  return { version: 1, sources: {} };
}
