/** DTO for HTML report — kept free of store-sqlite imports. */

export interface HtmlTypeStat {
  type: string;
  count: number;
  bytes: number;
}

export interface HtmlSourceStats {
  sourceId: string;
  fileCount: number;
  totalBytes: number;
  byType: HtmlTypeStat[];
  duplicateGroups: number;
  duplicateFiles: number;
  duplicateBytes: number;
  oldFiles: number;
  emptyFiles: number;
  issues: number;
  scannedAt: string | null;
}

export interface HtmlDuplicateGroup {
  size: number;
  paths: string[];
}

export interface HtmlIssue {
  path: string;
  code: string;
  message: string;
}

export interface HtmlSourceReport {
  stats: HtmlSourceStats;
  issues: HtmlIssue[];
  topDuplicates: HtmlDuplicateGroup[];
  piiLikelyFiles?: number;
}

export interface HtmlReportInput {
  version: string;
  storePath: string;
  generatedAt: string;
  sources: HtmlSourceReport[];
  oldFileYears: number;
}
