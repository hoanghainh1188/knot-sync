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

function stubFind(_text: string): Array<{ start: number; end: number }> {
  return [];
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
        api.registerPiiRule({
          id: "email",
          find: (text) => {
            const i = text.indexOf("@");
            return i >= 0 ? [{ start: i - 1, end: i + 1 }] : [];
          },
        });
        api.registerExtractor({
          id: "office",
          extensions: [".xlsx"],
          extract: async () => ({ ok: false, code: "SKIP", message: "stub" }),
        });
        api.registerCleaner({
          id: "noop",
          clean: (doc) => doc,
        });
      },
    }),
  );
  assert.equal(host.connectors.has("fs"), true);
  assert.equal(typeof host.piiRules.get("email")?.find, "function");
  assert.equal(host.extractors.get("office")?.extensions.includes(".xlsx"), true);
  assert.equal(typeof host.cleaners.get("noop")?.clean, "function");
  assert.deepEqual(host.loaded[0]?.extensions, [
    { point: "connector", id: "fs" },
    { point: "pii-rule", id: "email" },
    { point: "extractor", id: "office" },
    { point: "cleaner", id: "noop" },
  ]);
});

test("rejects cleaner without clean()", () => {
  const host = createPluginHost();
  assert.throws(
    () =>
      host.registerPlugin(
        makePlugin({
          name: "bad-cleaner",
          onRegister: (api) => {
            api.registerCleaner({ id: "x" } as never);
          },
        }),
      ),
    /must provide clean/,
  );
});

test("rejects pii-rule without find()", () => {
  const host = createPluginHost();
  assert.throws(
    () =>
      host.registerPlugin(
        makePlugin({
          name: "bad-pii",
          onRegister: (api) => {
            api.registerPiiRule({ id: "email" } as never);
          },
        }),
      ),
    /must provide find/,
  );
});

test("rejects guard-rule without find()", () => {
  const host = createPluginHost();
  assert.throws(
    () =>
      host.registerPlugin(
        makePlugin({
          name: "bad-guard",
          onRegister: (api) => {
            api.registerGuardRule({ id: "instruction-en" } as never);
          },
        }),
      ),
    /must provide find/,
  );
});

test("registers executable mcp-tool and mcp-prompt", () => {
  const host = createPluginHost();
  host.registerPlugin(
    makePlugin({
      name: "mcp-demo",
      onRegister: (api) => {
        api.registerMcpTool({
          id: "search_documents",
          description: "Search documents",
          inputSchema: { type: "object", properties: { query: { type: "string" } } },
          handler: () => ({ content: "ok" }),
        });
        api.registerMcpPrompt({
          id: "find-invoice",
          description: "Find invoices",
          template: "Search for {{query}}",
        });
      },
    }),
  );
  assert.ok(host.mcpTools.has("search_documents"));
  assert.ok(host.mcpPrompts.has("find-invoice"));
  assert.deepEqual(host.loaded[0]?.extensions, [
    { point: "mcp-tool", id: "search_documents" },
    { point: "mcp-prompt", id: "find-invoice" },
  ]);
});

test("rejects mcp-tool without handler", () => {
  const host = createPluginHost();
  assert.throws(
    () =>
      host.registerPlugin(
        makePlugin({
          name: "bad-mcp",
          onRegister: (api) => {
            api.registerMcpTool({
              id: "broken",
              description: "x",
              inputSchema: { type: "object" },
            } as never);
          },
        }),
      ),
    /must provide handler/,
  );
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
      onRegister: (api) => api.registerPiiRule({ id: "email", find: stubFind }),
    }),
  );
  assert.throws(
    () =>
      host.registerPlugin(
        makePlugin({
          name: "b",
          onRegister: (api) => api.registerPiiRule({ id: "email", find: stubFind }),
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
      onRegister: (api) => api.registerPiiRule({ id: "mask-seikyusho", find: stubFind }),
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
          api.registerPiiRule({ id: "mask-company-id", find: stubFind });
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
    register(
      this: { tag: string },
      api: {
        registerPiiRule: (r: { id: string; find: (text: string) => Array<{ start: number; end: number }> }) => void;
      },
    ) {
      assert.equal(this.tag, "ok");
      api.registerPiiRule({ id: this.tag, find: stubFind });
    },
  };
  host.registerPlugin(plugin);
  assert.equal(host.piiRules.has("ok"), true);
});
