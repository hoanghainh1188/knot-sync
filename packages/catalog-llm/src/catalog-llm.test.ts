import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ConfigError,
  createPluginHost,
  PLUGIN_API_VERSION,
  type KnotSyncPlugin,
} from "@hoanghainh/knot-sync-core";
import {
  CATALOG_LLM_PLUGIN_NAME,
  CATALOG_LLM_SOURCE_ID,
  CATALOG_LLM_TEST_LICENSE_SENTINEL,
  createCatalogLlmPlugin,
  createCatalogLlmSource,
  parseCatalogLlmSettings,
  suggestViaChat,
} from "./index.js";

test("parseCatalogLlmSettings rejects unknown keys", () => {
  assert.throws(() => parseCatalogLlmSettings({ weird: true }), /Unknown key/);
  assert.throws(() => parseCatalogLlmSettings({ timeoutMs: 0 }), /positive integer/);
  const defaults = parseCatalogLlmSettings(undefined);
  assert.equal(defaults.includeSamples, false);
  assert.match(defaults.baseUrl, /127\.0\.0\.1/);
});

test("plugin registers catalog-llm only when loaded; free host has none", () => {
  const free = createPluginHost();
  assert.equal(free.catalogSources.has(CATALOG_LLM_SOURCE_ID), false);

  const paid = createPluginHost();
  paid.registerPlugin(
    createCatalogLlmPlugin({
      settings: { licenseKey: CATALOG_LLM_TEST_LICENSE_SENTINEL },
      fetchImpl: async () =>
        new Response(JSON.stringify({ choices: [{ message: { content: "{}" } }] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    }),
  );
  assert.ok(paid.catalogSources.has(CATALOG_LLM_SOURCE_ID));
  assert.ok(paid.loaded.some((p) => p.name === CATALOG_LLM_PLUGIN_NAME));
});

test("suggestViaChat parses ja/vi JSON from mock fetch", async () => {
  const settings = parseCatalogLlmSettings({
    licenseKey: CATALOG_LLM_TEST_LICENSE_SENTINEL,
    model: "test-model",
  });
  const suggestion = await suggestViaChat({
    settings,
    input: { sourceId: "erp", table: "注文", column: "ma_xyz", dbType: "varchar" },
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: '{"ja":"不明フラグ","vi":"cờ xyz","en":"xyz flag","description":"draft"}',
              },
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
  });
  assert.equal(suggestion.label?.ja, "不明フラグ");
  assert.equal(suggestion.label?.vi, "cờ xyz");
  assert.equal(suggestion.description, "draft");
});

test("suggestViaChat soft-fails on timeout/down", async () => {
  const settings = parseCatalogLlmSettings({
    licenseKey: CATALOG_LLM_TEST_LICENSE_SENTINEL,
    timeoutMs: 20,
  });
  await assert.rejects(
    () =>
      suggestViaChat({
        settings,
        input: { sourceId: "s", table: "t", column: "c" },
        fetchImpl: async (_url, init) => {
          const signal = init?.signal;
          await new Promise<void>((resolve, reject) => {
            const timer = setTimeout(() => resolve(), 200);
            signal?.addEventListener(
              "abort",
              () => {
                clearTimeout(timer);
                const err = new Error("aborted");
                err.name = "AbortError";
                reject(err);
              },
              { once: true },
            );
          });
          return new Response("{}", { status: 200 });
        },
      }),
    /timed out/i,
  );

  await assert.rejects(
    () =>
      suggestViaChat({
        settings,
        input: { sourceId: "s", table: "t", column: "c" },
        fetchImpl: async () => new Response("nope", { status: 503 }),
      }),
    /HTTP 503/,
  );
});

test("unlicensed source returns empty without calling fetch", async () => {
  let called = 0;
  const source = createCatalogLlmSource({
    settings: parseCatalogLlmSettings({}),
    env: {},
    fetchImpl: async () => {
      called += 1;
      return new Response("{}", { status: 200 });
    },
  });
  const out = await source.suggest({ sourceId: "s", table: "t", column: "c" });
  assert.deepEqual(out, {});
  assert.equal(called, 0);
});

test("licensed source returns draft labels via mock fetch", async () => {
  const source = createCatalogLlmSource({
    settings: parseCatalogLlmSettings({ licenseKey: CATALOG_LLM_TEST_LICENSE_SENTINEL }),
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          choices: [{ message: { content: '{"ja":"予備","vi":"dự phòng"}' } }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
  });
  const out = await source.suggest({
    sourceId: "erp",
    table: "受注",
    column: "xyz_flg",
  });
  assert.equal(out.label?.ja, "予備");
  assert.equal(out.label?.vi, "dự phòng");
});

test("down endpoint soft-fails to empty suggestion", async () => {
  const soft: string[] = [];
  const source = createCatalogLlmSource({
    settings: parseCatalogLlmSettings({ licenseKey: CATALOG_LLM_TEST_LICENSE_SENTINEL }),
    onSoftFail: (m) => soft.push(m),
    fetchImpl: async () => new Response("err", { status: 500 }),
  });
  const out = await source.suggest({ sourceId: "s", table: "t", column: "c" });
  assert.deepEqual(out, {});
  assert.match(soft.join("\n"), /HTTP 500/);
});

test("invalid plugin settings throw ConfigError", () => {
  const host = createPluginHost();
  const bad: KnotSyncPlugin = createCatalogLlmPlugin({ settings: { nope: 1 } });
  assert.equal(bad.apiVersion, PLUGIN_API_VERSION);
  assert.throws(() => host.registerPlugin(bad), ConfigError);
});

test("Ed25519 KS1 license enforcement and production sentinel gating", async () => {
  const { generateKeyPairSync } = await import("node:crypto");
  const { signLicensePayload } = await import("@hoanghainh/knot-sync-plugin-license");
  const {
    CATALOG_LLM_PLUGIN_NAME,
    CATALOG_LLM_TEST_LICENSE_SENTINEL,
    assertCatalogLlmLicense,
    isValidCatalogLlmLicense,
    parseCatalogLlmSettings,
  } = await import("./index.js");

  const { publicKey, privateKey } = generateKeyPairSync("ed25519", {
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });

  assert.equal(isValidCatalogLlmLicense("arbitrary-string", process.env, { publicKey }), false);
  assert.equal(isValidCatalogLlmLicense(CATALOG_LLM_TEST_LICENSE_SENTINEL, process.env, { publicKey }), true);
  assert.equal(
    isValidCatalogLlmLicense(CATALOG_LLM_TEST_LICENSE_SENTINEL, { KNOT_SYNC_ALLOW_TEST_LICENSE: "0" }, { publicKey }),
    false,
  );

  const validToken = signLicensePayload(
    { licensee: "株式会社カタログ", plugins: [CATALOG_LLM_PLUGIN_NAME], exp: 4_102_444_800 },
    privateKey,
  );
  assert.doesNotThrow(() =>
    assertCatalogLlmLicense(parseCatalogLlmSettings({ licenseKey: validToken }), {}, { publicKey }),
  );

  const expiredToken = signLicensePayload(
    { licensee: "株式会社カタログ", plugins: [CATALOG_LLM_PLUGIN_NAME], exp: 1_700_000_000 },
    privateKey,
  );
  assert.throws(
    () => assertCatalogLlmLicense(parseCatalogLlmSettings({ licenseKey: expiredToken }), {}, { publicKey }),
    /expired/i,
  );

  const wrongPluginToken = signLicensePayload(
    { licensee: "株式会社カタログ", plugins: ["extractor-ocr"], exp: 4_102_444_800 },
    privateKey,
  );
  assert.throws(
    () => assertCatalogLlmLicense(parseCatalogLlmSettings({ licenseKey: wrongPluginToken }), {}, { publicKey }),
    /plugin_not_allowed/,
  );
});
