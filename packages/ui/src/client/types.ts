export interface CatalogLabel {
  ja: string;
  vi: string;
  en: string;
}

export interface CatalogColumn {
  label: CatalogLabel;
  description: string;
  type: string;
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
