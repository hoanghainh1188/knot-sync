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
  pii: boolean;
  expose: boolean;
  reviewed: boolean;
}

export interface CatalogTable {
  label: CatalogLabel;
  description: string;
  reviewed: boolean;
  columns: Record<string, CatalogColumn>;
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
  const { label, values, ...rest } = partial ?? {};
  return {
    description: "",
    type: "",
    pii: false,
    expose: true,
    reviewed: false,
    ...rest,
    label: { ...emptyLabel(), ...(label ?? {}) },
    values: values ? [...values] : [],
  };
}

export function emptyTable(partial?: Partial<CatalogTable>): CatalogTable {
  const { label, columns, ...rest } = partial ?? {};
  return {
    description: "",
    reviewed: false,
    ...rest,
    label: { ...emptyLabel(), ...(label ?? {}) },
    columns: { ...(columns ?? {}) },
  };
}

export function emptyCatalog(): CatalogDocument {
  return { version: 1, sources: {} };
}
