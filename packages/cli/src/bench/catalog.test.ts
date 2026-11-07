import assert from "node:assert/strict";
import { emptyCatalog, emptyColumn, emptyTable } from "@hoanghainh/knot-sync-catalog";
import { test } from "node:test";
import { runCatalogSuite } from "./catalog.js";

test("得意先コード resolves only after catalog is loaded", () => {
  const catalog = emptyCatalog();
  catalog.sources.erp = {
    tables: {
      受注: emptyTable({
        columns: {
          TKSK_CD: emptyColumn({
            label: { ja: "得意先コード", vi: "", en: "" },
          }),
        },
      }),
    },
  };

  const cases = [
    {
      id: "tksk",
      source: "erp",
      table: "受注",
      name: "得意先コード",
      expectResolved: true,
    },
  ];

  const skipped = runCatalogSuite(undefined, cases);
  assert.equal(skipped.skipped, true);
  assert.match(skipped.skipReason ?? "", /catalog/i);

  const result = runCatalogSuite(catalog, cases);
  assert.equal(result.skipped, false);
  assert.equal(result.cases.length, 1);
  assert.equal(result.cases[0]?.beforePassed, false, "business label fails without catalog");
  assert.equal(result.cases[0]?.afterPassed, true);
  assert.equal(result.cases[0]?.afterPhysical, "TKSK_CD");
  assert.equal(result.cases[0]?.passed, true);
  assert.equal(result.passed, 1);
});
