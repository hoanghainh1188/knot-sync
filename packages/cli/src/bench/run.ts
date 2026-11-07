import { access } from "node:fs/promises";
import { loadCatalogFile, type CatalogDocument } from "@hoanghainh/knot-sync-catalog";
import type { CliLocale } from "@hoanghainh/knot-sync-core";
import { Store } from "@hoanghainh/knot-sync-store-sqlite";
import { t } from "../i18n/index.js";
import type { Io } from "../main.js";
import { runCatalogSuite, type CatalogSuiteResult } from "./catalog.js";
import { runSearchSuite, type SearchSuiteResult } from "./search.js";
import {
  defaultSuitePath,
  loadBenchSuite,
  loadBenchSuiteIfPresent,
  type BenchSuite,
} from "./suite.js";
import { aggregateTokens, type TokenReport } from "./tokens.js";

export const BENCH_REPORT_VERSION = "0.1.0";

export interface BenchReport {
  version: string;
  tokens: TokenReport;
  suite: {
    path: string | null;
    search: SearchSuiteResult | null;
    catalog: CatalogSuiteResult | null;
  };
}

async function loadCatalogIfPresent(path: string): Promise<CatalogDocument | undefined> {
  try {
    await access(path);
  } catch {
    return undefined;
  }
  return loadCatalogFile(path);
}

function formatHuman(report: BenchReport, locale: CliLocale): string[] {
  const lines: string[] = [];
  const tok = report.tokens;
  lines.push(t(locale, "bench.tokensHeader"));
  lines.push(
    t(locale, "bench.tokensLine", {
      before: String(tok.before),
      after: String(tok.after),
      saved: String(tok.saved),
      pct: String(tok.reductionPct),
      documents: String(tok.documents),
      skipped: String(tok.skipped),
    }),
  );

  if (!report.suite.path) {
    lines.push(t(locale, "bench.noSuite"));
    return lines;
  }

  lines.push(t(locale, "bench.suiteHeader", { path: report.suite.path }));

  const search = report.suite.search;
  if (search) {
    lines.push(
      t(locale, "bench.searchSummary", {
        passed: String(search.passed),
        failed: String(search.failed),
      }),
    );
    for (const c of search.cases) {
      const mark = c.passed ? "PASS" : "FAIL";
      const extra = c.passed ? "" : ` (${c.reason ?? "failed"})`;
      lines.push(`  [${mark}] search/${c.id}: ${c.query}${extra}`);
    }
  }

  const catalog = report.suite.catalog;
  if (catalog) {
    if (catalog.skipped) {
      lines.push(t(locale, "bench.catalogSkipped", { reason: catalog.skipReason ?? "" }));
    } else {
      lines.push(
        t(locale, "bench.catalogSummary", {
          passed: String(catalog.passed),
          failed: String(catalog.failed),
          before: String(catalog.beforePassed),
          after: String(catalog.afterPassed),
        }),
      );
      for (const c of catalog.cases) {
        const mark = c.passed ? "PASS" : "FAIL";
        lines.push(
          `  [${mark}] catalog/${c.id}: ${c.name} (before=${c.beforePassed ? "ok" : "no"}, after=${c.afterPassed ? "ok" : "no"})`,
        );
      }
    }
  }

  return lines;
}

export interface CmdBenchOptions {
  configPath: string;
  storePath: string;
  catalogPath: string;
  suitePathFlag?: string;
  json: boolean;
  locale: CliLocale;
}

/**
 * Run `knot-sync bench`: token report + optional suite scoring.
 * Exit 1 when the store has no documents.
 */
export async function cmdBench(options: CmdBenchOptions, io: Io): Promise<number> {
  const { storePath, catalogPath, suitePathFlag, json, locale } = options;
  const store = new Store(storePath);
  try {
    const count = store.documentCount();
    if (count === 0) {
      io.err(t(locale, "bench.emptyStore", { path: storePath }));
      return 1;
    }

    const documents = store.listDocuments();
    const tokens = aggregateTokens(documents);

    let suite: BenchSuite | null = null;
    if (suitePathFlag) {
      suite = await loadBenchSuite(suitePathFlag);
    } else {
      suite = await loadBenchSuiteIfPresent(defaultSuitePath(options.configPath));
    }

    const catalog = await loadCatalogIfPresent(catalogPath);

    let searchResult: SearchSuiteResult | null = null;
    let catalogResult: CatalogSuiteResult | null = null;
    if (suite) {
      searchResult = runSearchSuite(store, suite.search);
      catalogResult = runCatalogSuite(catalog, suite.catalog);
    }

    const report: BenchReport = {
      version: BENCH_REPORT_VERSION,
      tokens,
      suite: {
        path: suite?.path ?? null,
        search: searchResult,
        catalog: catalogResult,
      },
    };

    if (json) {
      io.out(JSON.stringify(report, null, 2));
    } else {
      for (const line of formatHuman(report, locale)) io.out(line);
    }
    return 0;
  } finally {
    store.close();
  }
}
