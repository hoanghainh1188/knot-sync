import type { Store, SearchHit } from "@hoanghainh/knot-sync-store-sqlite";
import type { SearchCase, SearchExpect } from "./suite.js";

export interface SearchCaseResult {
  id: string;
  query: string;
  passed: boolean;
  reason?: string;
  hitIds: string[];
}

export interface SearchSuiteResult {
  passed: number;
  failed: number;
  cases: SearchCaseResult[];
}

function includesInsensitive(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

function hitMatches(
  hit: SearchHit,
  expect: SearchExpect,
  relPath: string | null,
): boolean {
  if (expect.documentId && hit.id !== expect.documentId) return false;
  if (expect.titleContains && !includesInsensitive(hit.title, expect.titleContains)) {
    return false;
  }
  if (expect.pathContains) {
    if (!relPath || !includesInsensitive(relPath, expect.pathContains)) return false;
  }
  return true;
}

/** Score one search case against the cleaned-store search API. */
export function runSearchCase(store: Store, c: SearchCase): SearchCaseResult {
  const hits = store.search(c.query, { limit: 20 });
  const hitIds = hits.map((h) => h.id);
  const match = hits.find((h) =>
    hitMatches(h, c.expect, store.findRelPathForDocument(h.id)),
  );
  if (match) {
    return { id: c.id, query: c.query, passed: true, hitIds };
  }
  return {
    id: c.id,
    query: c.query,
    passed: false,
    reason: "no hit matched expect criteria",
    hitIds,
  };
}

export function runSearchSuite(store: Store, cases: SearchCase[]): SearchSuiteResult {
  const results = cases.map((c) => runSearchCase(store, c));
  const passed = results.filter((r) => r.passed).length;
  return {
    passed,
    failed: results.length - passed,
    cases: results,
  };
}
