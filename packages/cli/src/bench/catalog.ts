import {
  resolveColumnName,
  CatalogResolveError,
  type CatalogDocument,
} from "@hoanghainh/knot-sync-catalog";
import type { CatalogCase } from "./suite.js";

export interface CatalogCaseResult {
  id: string;
  name: string;
  source: string;
  table: string;
  beforePassed: boolean;
  afterPassed: boolean;
  beforePhysical?: string;
  afterPhysical?: string;
  beforeError?: string;
  afterError?: string;
  /** Whether the after outcome matched expectResolved. */
  passed: boolean;
}

export interface CatalogSuiteResult {
  passed: number;
  failed: number;
  skipped: boolean;
  skipReason?: string;
  beforePassed: number;
  afterPassed: number;
  cases: CatalogCaseResult[];
}

function tryResolve(
  catalog: CatalogDocument | undefined,
  c: CatalogCase,
  allowed: Set<string>,
): { ok: true; physical: string } | { ok: false; error: string } {
  try {
    const physical = resolveColumnName(catalog, c.source, c.table, c.name, allowed);
    return { ok: true, physical };
  } catch (err) {
    const message =
      err instanceof CatalogResolveError ? err.message : (err as Error).message;
    return { ok: false, error: message };
  }
}

function allowedColumnsFor(
  catalog: CatalogDocument,
  source: string,
  table: string,
): Set<string> | null {
  const cols = catalog.sources[source]?.tables[table]?.columns;
  if (!cols) return null;
  return new Set(Object.keys(cols));
}

/**
 * Score catalog cases: before = resolve without catalog; after = with catalog.
 * When catalog is missing, returns skipped: true and empty cases.
 */
export function runCatalogSuite(
  catalog: CatalogDocument | undefined,
  cases: CatalogCase[],
): CatalogSuiteResult {
  if (cases.length === 0) {
    return {
      passed: 0,
      failed: 0,
      skipped: false,
      beforePassed: 0,
      afterPassed: 0,
      cases: [],
    };
  }
  if (!catalog) {
    return {
      passed: 0,
      failed: 0,
      skipped: true,
      skipReason:
        "No catalog file loaded; catalog suite cases were skipped. Run knot-sync describe or point catalog.path at an existing file.",
      beforePassed: 0,
      afterPassed: 0,
      cases: [],
    };
  }

  const results: CatalogCaseResult[] = [];
  for (const c of cases) {
    const allowed = allowedColumnsFor(catalog, c.source, c.table);
    if (!allowed || allowed.size === 0) {
      results.push({
        id: c.id,
        name: c.name,
        source: c.source,
        table: c.table,
        beforePassed: false,
        afterPassed: false,
        beforeError: `Table ${c.source}.${c.table} missing from catalog`,
        afterError: `Table ${c.source}.${c.table} missing from catalog`,
        passed: !c.expectResolved,
      });
      continue;
    }

    const before = tryResolve(undefined, c, allowed);
    const after = tryResolve(catalog, c, allowed);
    const afterOk = after.ok;
    const passed = c.expectResolved ? afterOk : !afterOk;

    results.push({
      id: c.id,
      name: c.name,
      source: c.source,
      table: c.table,
      beforePassed: before.ok,
      afterPassed: after.ok,
      beforePhysical: before.ok ? before.physical : undefined,
      afterPhysical: after.ok ? after.physical : undefined,
      beforeError: before.ok ? undefined : before.error,
      afterError: after.ok ? undefined : after.error,
      passed,
    });
  }

  const passed = results.filter((r) => r.passed).length;
  return {
    passed,
    failed: results.length - passed,
    skipped: false,
    beforePassed: results.filter((r) => r.beforePassed).length,
    afterPassed: results.filter((r) => r.afterPassed).length,
    cases: results,
  };
}
