import { test } from "node:test";
import assert from "node:assert/strict";
import { ConfigError } from "./errors.js";
import {
  PLUGIN_API_VERSION,
  createPluginHost,
  isPluginPathEntry,
  loadPlugins,
  resolvePluginSpecifier,
  type KnotSyncPlugin,
} from "./plugin.js";

function makePlugin(
  overrides: Partial<KnotSyncPlugin> & { onRegister?: KnotSyncPlugin["register"] } = {},
): KnotSyncPlugin {
  const { onRegister, ...rest } = overrides;
  return {
    name: "demo",
    version: "1.0.0",
    apiVersion: PLUGIN_API_VERSION,
    register: onRegister ?? (() => {}),
    ...rest,
  };
}

test("createPluginHost registers extensions", () => {
  const host = createPluginHost();
  host.registerPlugin(
    makePlugin({
      name: "fs-like",
      onRegister: (api) => {
        api.registerConnector({
          id: "fs",
          parseSource: () => {
            throw new Error("unused");
          },
          scan: async function* () {},
        });
        api.registerPiiRule({ id: "email" });
      },
    }),
  );
  assert.equal(host.connectors.has("fs"), true);
  assert.equal(host.piiRules.has("email"), true);
  assert.deepEqual(host.loaded[0]?.extensions, [
    { point: "connector", id: "fs" },
    { point: "pii-rule", id: "email" },
  ]);
});

test("rejects incompatible apiVersion", () => {
  const host = createPluginHost();
  assert.throws(
    () => host.registerPlugin(makePlugin({ apiVersion: 999 })),
    (err: unknown) => {
      assert.ok(err instanceof ConfigError);
      assert.match(err.message, /apiVersion 999/);
      assert.match(err.message, new RegExp(String(PLUGIN_API_VERSION)));
      return true;
    },
  );
});

test("rejects duplicate extension id", () => {
  const host = createPluginHost();
  host.registerPlugin(
    makePlugin({
      name: "a",
      onRegister: (api) => api.registerPiiRule({ id: "email" }),
    }),
  );
  assert.throws(
    () =>
      host.registerPlugin(
        makePlugin({
          name: "b",
          onRegister: (api) => api.registerPiiRule({ id: "email" }),
        }),
      ),
    /Duplicate pii-rule id "email"/,
  );
});

test("Japanese plugin name is preserved in loaded list", () => {
  const host = createPluginHost();
  host.registerPlugin(
    makePlugin({
      name: "mask-請求書-id",
      onRegister: (api) => api.registerPiiRule({ id: "mask-seikyusho" }),
    }),
  );
  assert.equal(host.loaded[0]?.name, "mask-請求書-id");
});

test("loadPlugins imports a module and applies settings", async () => {
  const settings = { pattern: "ACME-.*" };
  const host = await loadPlugins({
    baseDir: "/work",
    entries: ["./plugins/demo.mjs"],
    pluginSettings: { demo: settings },
    importModule: async () =>
      makePlugin({
        name: "demo",
        onRegister: (api) => {
          assert.deepEqual(api.getPluginSettings(), settings);
          api.registerPiiRule({ id: "mask-company-id" });
        },
      }),
  });
  assert.equal(host.piiRules.has("mask-company-id"), true);
});

test("loadPlugins wraps import failures", async () => {
  await assert.rejects(
    loadPlugins({
      baseDir: "/work",
      entries: ["./missing.mjs"],
      importModule: async () => {
        throw new Error("ENOENT");
      },
    }),
    /Could not load plugin/,
  );
});

test("scoped npm package names are not treated as file paths", () => {
  assert.equal(isPluginPathEntry("@acme/knot-plugin"), false);
  assert.equal(isPluginPathEntry("./plugins/demo.mjs"), true);
  assert.equal(isPluginPathEntry("/abs/plugin.mjs"), true);
  assert.throws(
    () => resolvePluginSpecifier("@acme/missing-plugin", "/work"),
    /Could not resolve plugin package "@acme\/missing-plugin"/,
  );
});

test("register keeps this binding", () => {
  const host = createPluginHost();
  const plugin = {
    name: "with-this",
    version: "1.0.0",
    apiVersion: PLUGIN_API_VERSION,
    tag: "ok",
    register(this: { tag: string }, api: { registerPiiRule: (r: { id: string }) => void }) {
      assert.equal(this.tag, "ok");
      api.registerPiiRule({ id: this.tag });
    },
  };
  host.registerPlugin(plugin);
  assert.equal(host.piiRules.has("ok"), true);
});
