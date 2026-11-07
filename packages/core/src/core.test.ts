import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import {
  ConfigError,
  DEFAULT_CLEANING_CONFIG,
  DEFAULT_GUARD_MODE,
  DEFAULT_PII_MODE,
  parseCleaningConfig,
  parseConfig,
  parseGuardConfig,
  parsePiiConfig,
  parsePromptsConfig,
  parseServerConfig,
  resolveConfig,
  resolvePath,
  starterConfigYaml,
} from "./config.js";
import { extOf, isJunkFile, typeFromExt } from "./filetype.js";
import { documentId, sha256 } from "./hash.js";
import { PLUGIN_API_VERSION, createPluginHost, type KnotSyncPlugin } from "./plugin.js";
import { isFsSource, type FsSourceConfig } from "./types.js";

function fsPlugin(): KnotSyncPlugin {
  return {
    name: "fs",
    version: "0.0.1",
    apiVersion: PLUGIN_API_VERSION,
    register(api) {
      api.registerConnector({
        id: "fs",
        parseSource(raw, ctx) {
          const path = raw.path;
          if (typeof path !== "string" || path.trim() === "") {
            throw new ConfigError(`sources[${ctx.index}].path is required.`);
          }
          return {
            id: String(raw.id),
            type: "fs",
            path: resolvePath(ctx.baseDir, path),
            extensions: [],
            exclude: [],
          } satisfies FsSourceConfig;
        },
        async *scan() {},
      });
    },
  };
}

function withFs(yaml: string, baseDir: string) {
  const structural = parseConfig(yaml, baseDir);
  const host = createPluginHost();
  host.registerPlugin(fsPlugin());
  return resolveConfig(structural, host);
}

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
  const cfg = withFs(starterConfigYaml("./share"), "/base");
  assert.equal(cfg.sources.length, 1);
  const first = cfg.sources[0];
  assert.ok(first);
  assert.ok(isFsSource(first));
  assert.equal(first.path, resolve("/base", "share"));
  assert.equal(cfg.store.path, resolve("/base", ".data/store.sqlite"));
  assert.equal(cfg.scan.oldFileYears, 5);
  assert.equal(cfg.scan.hash, true);
  assert.deepEqual(cfg.cleaning, DEFAULT_CLEANING_CONFIG);
  assert.equal(cfg.pii.mode, DEFAULT_PII_MODE);
  assert.match(cfg.pii.saltPath, /pii-salt$/);
  assert.equal(cfg.guard.mode, DEFAULT_GUARD_MODE);
});

test("pii defaults to mask when omitted", () => {
  const structural = parseConfig("sources:\n  - id: a\n    type: fs\n    path: /x\n", "/work");
  assert.equal(structural.pii.mode, "mask");
  assert.equal(structural.pii.saltPath, resolve("/work", ".data/pii-salt"));
});

test("pii rejects bad mode and unknown keys", () => {
  assert.throws(
    () => parsePiiConfig({ mode: "redact" }, "/salt", "/base"),
    /pii\.mode.*mask, hash, drop/,
  );
  assert.throws(() => parsePiiConfig({ foo: true }, "/salt", "/base"), /Unknown key "foo".*pii/);
});

test("guard defaults to flag when omitted", () => {
  const structural = parseConfig("sources:\n  - id: a\n    type: fs\n    path: /x\n", "/work");
  assert.equal(structural.guard.mode, "flag");
});

test("guard rejects bad mode and unknown keys", () => {
  assert.throws(
    () => parseGuardConfig({ mode: "quarantine" }),
    /guard\.mode.*flag, strip, block/,
  );
  assert.throws(() => parseGuardConfig({ foo: true }), /Unknown key "foo".*guard/);
});

test("server defaults audit_log beside store when omitted", () => {
  const structural = parseConfig("sources:\n  - id: a\n    type: fs\n    path: /x\n", "/work");
  assert.equal(structural.server.auditLog, resolve("/work", ".data/mcp-audit.jsonl"));
  assert.deepEqual(structural.prompts, []);
});

test("catalog defaults path beside config when omitted", () => {
  const structural = parseConfig("sources:\n  - id: a\n    type: fs\n    path: /x\n", "/work");
  assert.equal(structural.catalog.path, resolve("/work", "knot-sync.catalog.yaml"));
  assert.equal(structural.catalog.definitionMapping.physical, "物理名");
});

test("catalog rejects unknown keys and resolves relative definition_excel", () => {
  assert.throws(
    () =>
      parseConfig(
        "sources:\n  - id: a\n    type: fs\n    path: /x\ncatalog:\n  llm: true\n",
        "/work",
      ),
    /Unknown key "llm".*catalog/,
  );
  const structural = parseConfig(
    [
      "sources:",
      "  - id: a",
      "    type: fs",
      "    path: /x",
      "catalog:",
      "  definition_excel: ./defs/項目定義.xlsx",
      "",
    ].join("\n"),
    "/work",
  );
  assert.equal(
    structural.catalog.definitionExcel,
    resolve("/work", "defs/項目定義.xlsx"),
  );
});

test("server rejects unknown keys", () => {
  assert.throws(
    () => parseServerConfig({ port: 8080 }, "/default.jsonl", "/base"),
    /Unknown key "port".*server/,
  );
});

test("prompts accept valid entry and reject duplicates / missing template", () => {
  const prompts = parsePromptsConfig([
    {
      name: "find-invoice",
      description: "Find invoices",
      template: "Search for {{query}}",
      arguments: [{ name: "query", description: "Terms", required: true }],
    },
  ]);
  assert.equal(prompts.length, 1);
  assert.equal(prompts[0]!.name, "find-invoice");
  assert.equal(prompts[0]!.arguments[0]!.required, true);

  assert.throws(
    () =>
      parsePromptsConfig([
        { name: "a", description: "d", template: "t" },
        { name: "a", description: "d2", template: "t2" },
      ]),
    /Duplicate prompt name "a"/,
  );
  assert.throws(
    () => parsePromptsConfig([{ name: "a", description: "d" }]),
    /template.*required fields/,
  );
});

test("cleaning defaults to all true when omitted", () => {
  assert.deepEqual(parseCleaningConfig(undefined), DEFAULT_CLEANING_CONFIG);
  const structural = parseConfig("sources:\n  - id: a\n    type: fs\n    path: /x\n", "/");
  assert.deepEqual(structural.cleaning, DEFAULT_CLEANING_CONFIG);
});

test("cleaning partial override keeps other steps enabled", () => {
  const structural = parseConfig(
    [
      "sources:",
      "  - id: a",
      "    type: fs",
      "    path: /x",
      "cleaning:",
      "  wareki: false",
      "",
    ].join("\n"),
    "/",
  );
  assert.equal(structural.cleaning.wareki, false);
  assert.equal(structural.cleaning.nfkc, true);
  assert.equal(structural.cleaning.datesIso, true);
  assert.equal(structural.cleaning.legacyVietnamese, true);
  assert.equal(structural.cleaning.tokenReduce, true);
});

test("cleaning rejects unknown keys and non-booleans", () => {
  assert.throws(
    () => parseCleaningConfig({ foo: true }),
    /Unknown key "foo".*cleaning/,
  );
  assert.throws(
    () => parseCleaningConfig({ nfkc: "yes" }),
    /cleaning\.nfkc.*boolean/,
  );
});

test("config normalizes plugins and preserves opaque keys", () => {
  const structural = parseConfig(
    [
      "sources:",
      "  - id: a",
      "    type: fs",
      "    path: /x",
      "plugins:",
      "  - ./plugins/demo.mjs",
      "mask-company-id:",
      "  pattern: ACME-.*",
      "",
    ].join("\n"),
    "/work",
  );
  assert.deepEqual(structural.plugins, ["./plugins/demo.mjs"]);
  assert.deepEqual(structural.pluginSettings["mask-company-id"], { pattern: "ACME-.*" });
});

test("duplicate plugins entry fails", () => {
  assert.throws(
    () =>
      parseConfig(
        [
          "sources:",
          "  - {id: a, type: fs, path: /x}",
          "plugins:",
          "  - ./a.mjs",
          "  - ./a.mjs",
          "",
        ].join("\n"),
        "/",
      ),
    /Duplicate plugins entry/,
  );
});

test("config errors are clear", () => {
  assert.throws(() => parseConfig("sources: []", "/"), ConfigError);
  assert.throws(
    () => parseConfig("sources:\n  - id: Bad Id\n    type: fs\n    path: /x\n", "/"),
    /id must be/,
  );
  assert.throws(
    () =>
      parseConfig(
        "sources:\n  - {id: a, type: fs, path: /x}\n  - {id: a, type: fs, path: /y}\n",
        "/",
      ),
    /Duplicate source id/,
  );

  const structural = parseConfig("sources:\n  - id: a\n    type: oracle\n    path: /x\n", "/");
  const host = createPluginHost();
  host.registerPlugin(fsPlugin());
  assert.throws(() => resolveConfig(structural, host), /Registered connector types: fs/);

  assert.throws(
    () =>
      withFs("sources:\n  - id: a\n    type: fs\n    path: ''\n", "/"),
    /path is required/,
  );
});
