import { test } from "node:test";
import assert from "node:assert/strict";
import { escapeHtml } from "./escape.js";
import { renderScanReportHtml } from "./render.js";
import type { HtmlReportInput } from "./types.js";

function sample(partial?: Partial<HtmlReportInput>): HtmlReportInput {
  return {
    version: "0.0.1",
    storePath: "/work/.data/store.sqlite",
    generatedAt: "2026-11-06T12:00:00.000Z",
    oldFileYears: 5,
    sources: [
      {
        stats: {
          sourceId: "shared-folder",
          fileCount: 3,
          totalBytes: 1200,
          byType: [{ type: "xlsx", count: 2, bytes: 1000 }],
          duplicateGroups: 1,
          duplicateFiles: 1,
          duplicateBytes: 400,
          oldFiles: 1,
          emptyFiles: 0,
          issues: 0,
          scannedAt: "2026-11-06T11:00:00.000Z",
        },
        issues: [],
        topDuplicates: [
          {
            size: 400,
            paths: ["営業/見積書.xlsx", "営業/見積書 (1).xlsx"],
          },
        ],
        piiLikelyFiles: 1,
      },
    ],
    ...partial,
  };
}

test("escapeHtml escapes markup", () => {
  assert.equal(escapeHtml(`a<b>&"'`), "a&lt;b&gt;&amp;&quot;&#39;");
});

test("renderScanReportHtml is self-contained with JP paths and i18n", () => {
  const html = renderScanReportHtml(sample());
  assert.match(html, /<!DOCTYPE html>/i);
  assert.match(html, /<style>/);
  assert.match(html, /prefers-color-scheme:\s*dark/);
  assert.match(html, /data-lang="ja"/);
  assert.match(html, /data-lang="vi"/);
  assert.match(html, /営業\/見積書\.xlsx/);
  assert.match(html, /shared-folder/);
  assert.match(html, />1</); // pii estimate present
  assert.doesNotMatch(html, /https?:\/\/cdn\./i);
  assert.doesNotMatch(html, /<link[^>]+href=["']https?:/i);
  assert.doesNotMatch(html, /<script[^>]+src=/i);
  assert.match(html, /knot-sync-report-lang/);
  assert.match(html, /スキャンレポート|KnotSync scan report/);
});

test("omits fabricated PII when estimate absent", () => {
  const input = sample();
  delete input.sources[0]!.piiLikelyFiles;
  const html = renderScanReportHtml(input);
  assert.match(html, /piiNotEstimated/);
});

test("escapes hostile paths", () => {
  const input = sample();
  input.sources[0]!.topDuplicates[0]!.paths = [`<script>alert(1)</script>`];
  const html = renderScanReportHtml(input);
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
});
