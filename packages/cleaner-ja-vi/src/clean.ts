import {
  DEFAULT_CLEANING_CONFIG,
  sha256,
  type CleaningConfig,
  type Cleaner,
  type Document,
  type TableData,
} from "@hoanghainh/knot-sync-core";
import { convertDatesIso } from "./dates.js";
import {
  convertLegacyVietnamese,
  detectLegacyVietnamese,
  type LegacyVnMode,
} from "./legacy-vn.js";
import { reduceTables, tokenReduceContent } from "./token-reduce.js";
import { estimateTokens, flattenDocumentText } from "./tokens.js";
import { convertWareki } from "./wareki.js";

export type { CleaningConfig };

function mapStrings(
  content: string,
  tables: TableData[],
  fn: (s: string) => string,
): { content: string; tables: TableData[] } {
  return {
    content: fn(content),
    tables: tables.map((t) => ({
      ...t,
      name: t.name !== undefined ? fn(t.name) : undefined,
      headers: t.headers.map(fn),
      rows: t.rows.map((r) => r.map(fn)),
    })),
  };
}

function tablesEqual(a: TableData[], b: TableData[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function cleanDocument(document: Document, settings: CleaningConfig): Document {
  const originalContent = document.content;
  const originalTables = document.tables;
  const tokensBefore = estimateTokens(flattenDocumentText(originalContent, originalTables));

  let content = originalContent;
  let tables = originalTables.map((t) => ({
    ...t,
    headers: [...t.headers],
    rows: t.rows.map((r) => [...r]),
  }));

  const apply = (fn: (s: string) => string) => {
    const next = mapStrings(content, tables, fn);
    content = next.content;
    tables = next.tables;
  };

  if (settings.legacyVietnamese) {
    // Detect once on the whole document so short table cells still convert.
    const mode: LegacyVnMode = detectLegacyVietnamese(
      flattenDocumentText(content, tables),
    );
    if (mode !== "none") {
      apply((s) => convertLegacyVietnamese(s, mode));
    }
  }
  if (settings.nfkc) apply((s) => s.normalize("NFKC"));
  if (settings.wareki) apply(convertWareki);
  if (settings.datesIso) apply(convertDatesIso);
  if (settings.tokenReduce) {
    content = tokenReduceContent(content);
    tables = reduceTables(tables);
  }

  const tokensAfter = estimateTokens(flattenDocumentText(content, tables));
  const metadata: Document["metadata"] = { ...document.metadata };
  if (metadata.originalContent === undefined) {
    metadata.originalContent = originalContent;
  }
  if (!tablesEqual(originalTables, tables) && metadata.originalTables === undefined) {
    metadata.originalTables = JSON.stringify(originalTables);
  }
  metadata.tokensBefore = tokensBefore;
  metadata.tokensAfter = tokensAfter;

  return {
    ...document,
    content,
    tables,
    metadata,
    hash: sha256(content),
  };
}

export function createJaViCleaner(
  settings: CleaningConfig = DEFAULT_CLEANING_CONFIG,
): Cleaner {
  const resolved = { ...DEFAULT_CLEANING_CONFIG, ...settings };
  return {
    id: "cleaner-ja-vi",
    clean(document) {
      return cleanDocument(document, resolved);
    },
  };
}
