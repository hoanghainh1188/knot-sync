import { test } from "node:test";
import assert from "node:assert/strict";
import { ConfigError, parseConfig, starterConfigYaml } from "./config.js";
import { extOf, isJunkFile, typeFromExt } from "./filetype.js";
import { documentId, sha256 } from "./hash.js";

test("extOf and typeFromExt", () => {
  assert.equal(extOf("請求書_2024.XLSX"), ".xlsx");
  assert.equal(extOf("folder/Hóa đơn.pdf"), ".pdf");
  assert.equal(extOf("README"), "");
  assert.equal(extOf(".bashrc"), "");
  assert.equal(typeFromExt(".xlsm"), "xlsx");
  assert.equal(typeFromExt(".exe"), "other");
});

test("isJunkFile", () => {
  assert.equal(isJunkFile("~$見積書.xlsx"), true);
  assert.equal(isJunkFile("Thumbs.db"), true);
  assert.equal(isJunkFile("見積書.xlsx"), false);
});

test("hash helpers are stable", () => {
  assert.equal(sha256("abc").length, 64);
  assert.equal(documentId("s", "a/b.xlsx"), documentId("s", "a/b.xlsx"));
  assert.notEqual(documentId("s", "a"), documentId("t", "a"));
});

test("starter config parses", () => {
  const cfg = parseConfig(starterConfigYaml("./share"), "/base");
  assert.equal(cfg.sources.length, 1);
  assert.equal(cfg.sources[0]?.path, "/base/share");
  assert.ok(cfg.sources[0]?.extensions.includes(".xlsx"));
  assert.ok(cfg.sources[0]?.exclude.includes("node_modules"));
  assert.equal(cfg.store.path, "/base/.data/store.sqlite");
  assert.equal(cfg.scan.oldFileYears, 5);
  assert.equal(cfg.scan.hash, true);
});

test("config normalizes extensions", () => {
  const cfg = parseConfig(
    "sources:\n  - id: a\n    type: fs\n    path: /x\n    extensions: [XLSX, .Pdf]\n",
    "/",
  );
  assert.deepEqual(cfg.sources[0]?.extensions, [".xlsx", ".pdf"]);
});

test("config errors are clear", () => {
  assert.throws(() => parseConfig("sources: []", "/"), ConfigError);
  assert.throws(
    () => parseConfig("sources:\n  - id: Bad Id\n    type: fs\n    path: /x\n", "/"),
    /id must be/,
  );
  assert.throws(
    () => parseConfig("sources:\n  - id: a\n    type: oracle\n    path: /x\n", "/"),
    /not supported yet/,
  );
  assert.throws(
    () =>
      parseConfig(
        "sources:\n  - {id: a, type: fs, path: /x}\n  - {id: a, type: fs, path: /y}\n",
        "/",
      ),
    /Duplicate source id/,
  );
});
