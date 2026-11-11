import assert from "node:assert/strict";
import { test } from "node:test";
import {
  allCatalogs,
  CLI_LOCALES,
  parseLangFlag,
  resolveLocale,
  t,
} from "./index.js";
import type { MessageKey } from "./messages.js";

test("resolveLocale priority: flag > config > KNOT_SYNC_LANG > LANG > en", () => {
  assert.equal(
    resolveLocale({ flag: "en", configLocale: "ja", env: { KNOT_SYNC_LANG: "vi" } }),
    "en",
  );
  assert.equal(
    resolveLocale({ configLocale: "ja", env: { KNOT_SYNC_LANG: "vi" } }),
    "ja",
  );
  assert.equal(resolveLocale({ env: { KNOT_SYNC_LANG: "vi", LANG: "ja_JP.UTF-8" } }), "vi");
  assert.equal(resolveLocale({ env: { LANG: "ja_JP.UTF-8" } }), "ja");
  assert.equal(resolveLocale({ env: { LC_ALL: "vi_VN.UTF-8" } }), "vi");
  assert.equal(resolveLocale({ env: { LANG: "en_US.UTF-8" } }), "en");
  assert.equal(resolveLocale({ env: {} }), "en");
});

test("parseLangFlag rejects invalid values", () => {
  assert.equal(parseLangFlag(undefined), undefined);
  assert.equal(parseLangFlag("ja"), "ja");
  assert.throws(() => parseLangFlag("fr"), /Allowed: en, ja, vi/);
  assert.throws(() => resolveLocale({ flag: "fr" }), /Allowed: en, ja, vi/);
});

test("t interpolates and falls back", () => {
  assert.match(t("ja", "error.unknownCommand", { command: "x" }), /x/);
  assert.match(t("vi", "init.next"), /knot-sync scan/);
  assert.match(t("vi", "scan.next"), /knot-sync run/);
  assert.match(t("ja", "run.next"), /knot-sync serve/);
  assert.equal(t("en", "scan.olderThan", { years: 5 }), "Older than 5 years");
  assert.match(
    t("en", "run.complete", { extracted: "1", skipped: "2", pruned: "3", failed: "0" }),
    /3 pruned/,
  );
  assert.match(
    t("ja", "run.complete", { extracted: "1", skipped: "2", pruned: "3", failed: "0" }),
    /削除 3/,
  );
  assert.match(
    t("vi", "run.complete", { extracted: "1", skipped: "2", pruned: "3", failed: "0" }),
    /3 đã dọn/,
  );
});

test("help organizes commands into workflow groups across en/ja/vi", () => {
  const required = [
    "init",
    "scan",
    "run",
    "describe",
    "ui",
    "serve",
    "bench",
    "optimize",
    "embed",
    "plugins",
  ];
  for (const locale of CLI_LOCALES) {
    const help = t(locale, "help");
    for (const cmd of required) {
      assert.match(help, new RegExp(`\\b${cmd}\\b`), `${locale} help missing ${cmd}`);
    }
  }
  assert.match(t("vi", "help"), /theo quy trình/);
  assert.match(t("ja", "help"), /作業順/);
});

test("every locale defines every key", () => {
  const catalogs = allCatalogs();
  const keys = Object.keys(catalogs.en) as MessageKey[];
  assert.ok(keys.length > 10);
  for (const locale of CLI_LOCALES) {
    const cat = catalogs[locale];
    for (const key of keys) {
      assert.equal(typeof cat[key], "string", `${locale} missing ${key}`);
      assert.ok(cat[key].length > 0, `${locale}.${key} empty`);
    }
    assert.deepEqual(Object.keys(cat).sort(), keys.slice().sort());
  }
});
