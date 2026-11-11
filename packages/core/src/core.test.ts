import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  ConfigError,
  DEFAULT_CLEANING_CONFIG,
  DEFAULT_EXTRACTION_CONFIG,
  DEFAULT_GUARD_MODE,
  DEFAULT_PII_MODE,
  parseCleaningConfig,
  parseCliConfig,
  parseConfig,
  parseExtractionConfig,
  parseGuardConfig,
  parseLoggingConfig,
  parsePiiConfig,
  parsePromptsConfig,
  parseServerConfig,
  resolveConfig,
  resolvePath,
  starterConfigYaml,
} from "./config.js";
import { extOf, isJunkFile, typeFromExt } from "./filetype.js";
import { documentId, sha256 } from "./hash.js";
import { assertPathOutsideSources } from "./paths.js";
import { PLUGIN_API_VERSION, createPluginHost, type KnotSyncPlugin } from "./plugin.js";
import { createSystemLogger } from "./system-log.js";
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
  assert.deepEqual(cfg.extraction, DEFAULT_EXTRACTION_CONFIG);
  assert.equal(cfg.pii.mode, DEFAULT_PII_MODE);
  assert.match(cfg.pii.saltPath, /pii-salt$/);
  assert.equal(cfg.guard.mode, DEFAULT_GUARD_MODE);
  assert.match(starterConfigYaml(), /extraction:/);
  assert.match(starterConfigYaml(), /maxFileSizeMb/);
  assert.match(starterConfigYaml(), /logging:/);
  assert.match(starterConfigYaml(), /system\.jsonl/);
  assert.match(starterConfigYaml(), /server\.audit_log/);
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

test("logging defaults path beside store and level info when omitted", () => {
  const structural = parseConfig("sources:\n  - id: a\n    type: fs\n    path: /x\n", "/work");
  assert.equal(structural.logging.path, resolve("/work", ".data/system.jsonl"));
  assert.equal(structural.logging.level, "info");
});

test("logging rejects unknown keys, empty path, and bad level", () => {
  assert.throws(
    () => parseLoggingConfig({ syslog: true }, "/default.jsonl", "/base"),
    /Unknown key "syslog".*logging/,
  );
  assert.throws(
    () => parseLoggingConfig({ path: "" }, "/default.jsonl", "/base"),
    /logging\.path.*non-empty/,
  );
  assert.throws(
    () => parseLoggingConfig({ level: "debug" }, "/default.jsonl", "/base"),
    /logging\.level.*info, warn, error/,
  );
});

test("logging.path under Japanese source root is rejected", () => {
  const share = resolve("/work", "経理");
  assert.throws(
    () =>
      assertPathOutsideSources(join(share, "system.jsonl"), [share], {
        key: "logging.path",
        label: "system log",
      }),
    /logging\.path/,
  );
});

test("logging.path rejects store and audit collisions", () => {
  assert.throws(
    () =>
      parseConfig(
        [
          "sources:",
          "  - id: a",
          "    type: fs",
          "    path: /x",
          "store:",
          "  path: ./.data/store.sqlite",
          "logging:",
          "  path: ./.data/store.sqlite",
          "",
        ].join("\n"),
        "/work",
      ),
    /logging\.path.*store\.path/,
  );
  assert.throws(
    () =>
      parseConfig(
        [
          "sources:",
          "  - id: a",
          "    type: fs",
          "    path: /x",
          "server:",
          "  audit_log: ./.data/mcp-audit.jsonl",
          "logging:",
          "  path: ./.data/mcp-audit.jsonl",
          "",
        ].join("\n"),
        "/work",
      ),
    /logging\.path.*server\.audit_log/,
  );
});

test("assertPathOutsideSources follows symlink into source", async () => {
  const root = await mkdtemp(join(tmpdir(), "knot-symlink-"));
  try {
    const share = join(root, "share");
    const link = join(root, "lnk");
    const { mkdir, symlink } = await import("node:fs/promises");
    await mkdir(share, { recursive: true });
    await symlink(share, link);
    assert.throws(
      () =>
        assertPathOutsideSources(join(link, "system.jsonl"), [share], {
          key: "logging.path",
          label: "system log",
        }),
      /logging\.path/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("SystemLogger filters by level and writes JSONL without content field", async () => {
  const root = await mkdtemp(join(tmpdir(), "knot-syslog-"));
  try {
    const logPath = join(root, "system.jsonl");
    const logger = createSystemLogger({
      path: logPath,
      level: "warn",
      sourcePaths: [join(root, "share")],
    });
    await logger.append({ level: "info", event: "command.start", command: "run" });
    const jpPath = join(root, "経理", "請求書.xlsx");
    await logger.append({
      level: "warn",
      event: "command.end",
      command: "run",
      path: jpPath,
    });
    const text = await readFile(logPath, "utf8");
    const lines = text.trim().split("\n");
    assert.equal(lines.length, 1);
    const row = JSON.parse(lines[0]!) as {
      level: string;
      event: string;
      path: string;
      content?: unknown;
    };
    assert.equal(row.level, "warn");
    assert.equal(row.event, "command.end");
    assert.equal(row.path, jpPath);
    assert.match(row.path, /経理/);
    assert.match(row.path, /請求書\.xlsx/);
    assert.equal(row.content, undefined);
    // Public API is typed without `content`; extra junk cannot be passed as a field.
    assert.equal(
      Object.prototype.hasOwnProperty.call(
        { level: "info", event: "x" } satisfies import("./system-log.js").SystemLogRecord,
        "content",
      ),
      false,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
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

test("cli defaults to empty when omitted", () => {
  const structural = parseConfig("sources:\n  - id: a\n    type: fs\n    path: /x\n", "/work");
  assert.deepEqual(structural.cli, {});
  assert.equal(structural.pluginSettings.cli, undefined);
});

test("cli accepts locale ja and rejects bad values", () => {
  const structural = parseConfig(
    "sources:\n  - id: a\n    type: fs\n    path: /x\ncli:\n  locale: ja\n",
    "/work",
  );
  assert.equal(structural.cli.locale, "ja");
  assert.equal(parseCliConfig({ locale: "vi" }).locale, "vi");
  assert.throws(() => parseCliConfig({ theme: "dark" }), /Unknown key "theme".*cli/);
  assert.throws(() => parseCliConfig({ locale: "fr" }), /cli\.locale.*en, ja, vi/);
});

test("starter config mentions cli.locale", () => {
  const yaml = starterConfigYaml("./share");
  assert.match(yaml, /# cli:/);
  assert.match(yaml, /#\s*locale:\s*ja/);
  const cfg = withFs(yaml, "/base");
  assert.deepEqual(cfg.cli, {});
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

test("cleaning defaults when omitted", () => {
  assert.equal(DEFAULT_CLEANING_CONFIG.keepOriginalText, false);
  assert.deepEqual(parseCleaningConfig(undefined), DEFAULT_CLEANING_CONFIG);
  const structural = parseConfig("sources:\n  - id: a\n    type: fs\n    path: /x\n", "/");
  assert.deepEqual(structural.cleaning, DEFAULT_CLEANING_CONFIG);
});

test("cleaning partial override keeps other steps enabled and keepOriginalText false", () => {
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
  assert.equal(structural.cleaning.keepOriginalText, false);
});

test("cleaning supports explicit keepOriginalText opt-in", () => {
  const structural = parseConfig(
    [
      "sources:",
      "  - id: a",
      "    type: fs",
      "    path: /x",
      "cleaning:",
      "  keepOriginalText: true",
      "",
    ].join("\n"),
    "/",
  );
  assert.equal(structural.cleaning.keepOriginalText, true);
  assert.equal(structural.cleaning.nfkc, true);
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
  assert.throws(
    () => parseCleaningConfig({ keepOriginalText: "true" }),
    /cleaning\.keepOriginalText.*boolean/,
  );
});

test("extraction defaults when omitted", () => {
  assert.deepEqual(parseExtractionConfig(undefined), DEFAULT_EXTRACTION_CONFIG);
  const structural = parseConfig("sources:\n  - id: a\n    type: fs\n    path: /x\n", "/");
  assert.deepEqual(structural.extraction, DEFAULT_EXTRACTION_CONFIG);
});

test("extraction partial override keeps other defaults", () => {
  const structural = parseConfig(
    [
      "sources:",
      "  - id: a",
      "    type: fs",
      "    path: /x",
      "extraction:",
      "  maxFileSizeMb: 10",
      "",
    ].join("\n"),
    "/",
  );
  assert.equal(structural.extraction.maxFileSizeMb, 10);
  assert.equal(structural.extraction.timeoutSeconds, 30);
  assert.equal(structural.extraction.maxTextChars, 500_000);
});

test("extraction rejects unknown keys and non-positive values", () => {
  assert.throws(
    () => parseExtractionConfig({ foo: 1 }),
    /Unknown key "foo".*extraction/,
  );
  assert.throws(
    () => parseExtractionConfig({ maxFileSizeMb: 0 }),
    /extraction\.maxFileSizeMb.*positive/,
  );
  assert.throws(
    () => parseExtractionConfig({ timeoutSeconds: -1 }),
    /extraction\.timeoutSeconds.*positive/,
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
