import type { Document } from "@hoanghainh/knot-sync-core";

export interface TokenReport {
  before: number;
  after: number;
  saved: number;
  reductionPct: number;
  documents: number;
  skipped: number;
}

function asNonNegInt(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  return Math.floor(value);
}

/**
 * Aggregate tokensBefore / tokensAfter from document metadata.
 * Documents missing either field are skipped (counted in `skipped`).
 */
export function aggregateTokens(documents: Document[]): TokenReport {
  let before = 0;
  let after = 0;
  let documentsCounted = 0;
  let skipped = 0;

  for (const doc of documents) {
    const b = asNonNegInt(doc.metadata.tokensBefore);
    const a = asNonNegInt(doc.metadata.tokensAfter);
    if (b === null || a === null) {
      skipped += 1;
      continue;
    }
    before += b;
    after += a;
    documentsCounted += 1;
  }

  const saved = Math.max(0, before - after);
  const reductionPct = before === 0 ? 0 : Math.round((saved / before) * 1000) / 10;

  return {
    before,
    after,
    saved,
    reductionPct,
    documents: documentsCounted,
    skipped,
  };
}
