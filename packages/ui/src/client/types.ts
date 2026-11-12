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

export type GuardRiskLevel = "none" | "low" | "medium" | "high";

export interface SanitizedDocumentSummary {
  id: string;
  sourceId: string;
  type: string;
  title: string;
  updatedAt: string;
  snippet: string;
  piiCount: number;
  piiByType: Record<string, number>;
  guardRisk: GuardRiskLevel;
  guardCount: number;
  guardTypes: string[];
}

export interface DocumentsApiResponse {
  storeExists: boolean;
  total: number;
  limit: number;
  offset: number;
  documents: SanitizedDocumentSummary[];
  sources: string[];
  types: string[];
}

export interface HealthSourceStat {
  sourceId: string;
  fileCount: number;
  documentCount: number;
  duplicateFiles: number;
  oldFiles: number;
  emptyFiles: number;
  issues: number;
  scannedAt: string | null;
}

export interface HealthIssue {
  sourceId: string;
  path: string;
  code: string;
  message: string;
  recordedAt?: string;
}

export interface HealthSummaryApiResponse {
  storeExists: boolean;
  totalDocuments: number;
  sources: HealthSourceStat[];
  scanIssues: HealthIssue[];
  runIssues: HealthIssue[];
}
