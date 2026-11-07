import assert from "node:assert/strict";
import { test } from "node:test";
import { filterColumnNames, resolveUiLocale, uiT } from "./chrome-i18n.js";

test("resolveUiLocale reads lang query", () => {
  assert.equal(resolveUiLocale("?lang=ja"), "ja");
  assert.equal(resolveUiLocale("lang=vi"), "vi");
  assert.equal(resolveUiLocale(""), "en");
});

test("Japanese chrome title", () => {
  assert.match(uiT("ja", "title"), /カタログ/);
  assert.match(uiT("ja", "filterUnreviewed"), /未レビュー/);
});

test("filterColumnNames keeps unreviewed only", () => {
  const cols = {
    TKSK_CD: { reviewed: false },
    DONE_COL: { reviewed: true },
    ma_kh: { reviewed: false },
  };
  assert.deepEqual(filterColumnNames(cols, false).sort(), ["DONE_COL", "TKSK_CD", "ma_kh"]);
  assert.deepEqual(filterColumnNames(cols, true).sort(), ["TKSK_CD", "ma_kh"]);
});
