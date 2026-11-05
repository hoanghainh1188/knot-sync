import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ConfigError,
  parseConfig,
  resolveConfig,
  resolvePath,
  starterConfigYaml,
} from "./config.js";
import { extOf, isJunkFile, typeFromExt } from "./filetype.js";
import { documentId, sha256 } from "./hash.js";
import { PLUGIN_API_VERSION, createPluginHost, type KnotSyncPlugin } from "./plugin.js";
import type { FsSourceConfig } from "./types.js";

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
  assert.equal(cfg.sources[0]?.path, "/base/share");
  assert.equal(cfg.store.path, "/base/.data/store.sqlite");
  assert.equal(cfg.scan.oldFileYears, 5);
  assert.equal(cfg.scan.hash, true);
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
