import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ConfigError,
  createPluginHost,
  documentId,
  PLUGIN_API_VERSION,
  type Document,
  type KnotSyncPlugin,
} from "@hoanghainh/knot-sync-core";
import { Store } from "@hoanghainh/knot-sync-store-sqlite";
import {
  SEARCH_SIMILAR_TOOL_ID,
  SEARCH_VECTOR_PLUGIN_NAME,
  SEARCH_VECTOR_TEST_LICENSE_SENTINEL,
  cosineSimilarity,
  createSearchVectorPlugin,
  embedAllDocuments,
  embedText,
  getEmbedding,
  parseSearchVectorSettings,
  searchSimilar,
  type FetchLike,
} from "./index.js";

function doc(id: string, title: string, content: string): Document {
  return {
    id,
    sourceId: "share",
    type: "txt",
    title,
    content,
    tables: [],
    metadata: {},
    pii: [],
    guard: [],
    hash: `hash-${id}`,
  };
}

/** Deterministic fake embedding from character codes (stable for tests). */
function fakeEmbed(text: string, dim = 8): number[] {
  const v = new Array(dim).fill(0);
  for (let i = 0; i < text.length; i++) {
    v[i % dim]! += text.charCodeAt(i) / 1000;
  }
  return v;
}

function mockFetch(map: (input: string) => number[]): FetchLike {
  const impl: FetchLike = async (_input, init) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as { input?: string };
    const input = typeof body.input === "string" ? body.input : "";
    return new Response(
      JSON.stringify({ data: [{ embedding: map(input) }] }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };
  return impl;
}

test("parseSearchVectorSettings rejects unknown keys", () => {
  assert.throws(() => parseSearchVectorSettings({ weird: true }), /Unknown key/);
  assert.throws(() => parseSearchVectorSettings({ timeoutMs: 0 }), /positive integer/);
  const defaults = parseSearchVectorSettings(undefined);
  assert.equal(defaults.embedOnRun, false);
  assert.match(defaults.baseUrl, /127\.0\.0\.1/);
});

test("plugin registers tools only when loaded; free host has none", () => {
  const free = createPluginHost();
  assert.equal(free.mcpTools.has(SEARCH_SIMILAR_TOOL_ID), false);

  const paid = createPluginHost();
  paid.registerPlugin(
    createSearchVectorPlugin({
      settings: { licenseKey: SEARCH_VECTOR_TEST_LICENSE_SENTINEL },
      fetchImpl: mockFetch((t) => fakeEmbed(t)),
    }),
  );
  assert.ok(paid.mcpTools.has(SEARCH_SIMILAR_TOOL_ID));
  assert.ok(paid.mcpTools.has("embed_documents"));
  assert.ok(paid.loaded.some((p) => p.name === SEARCH_VECTOR_PLUGIN_NAME));
});

test("cosine ranks matching vectors higher", () => {
  const a = [1, 0, 0];
  const b = [0.9, 0.1, 0];
  const c = [0, 1, 0];
  assert.ok(cosineSimilarity(a, b) > cosineSimilarity(a, c));
});

test("embedText soft-fails on HTTP error", async () => {
  const settings = parseSearchVectorSettings({
    licenseKey: SEARCH_VECTOR_TEST_LICENSE_SENTINEL,
  });
  await assert.rejects(
    () =>
      embedText({
        settings,
        text: "x",
        fetchImpl: async () => new Response("nope", { status: 503 }),
      }),
    /HTTP 503/,
  );
});

test("batch embed stores JP doc; search_similar ranks paraphrase above unrelated", async () => {
  const store = new Store(":memory:");
  const invoice = doc(
    "share:a",
    "令和6年度 請求書一覧",
    "取引先: 株式会社サンプル 金額 120,000円 請求書",
  );
  const other = doc("share:b", "会議メモ", "今日のアジェンダは採用計画です");
  store.upsertDocument(invoice);
  store.upsertDocument(other);

  const soft: string[] = [];
  const runtime = {
    settings: parseSearchVectorSettings({
      licenseKey: SEARCH_VECTOR_TEST_LICENSE_SENTINEL,
      model: "test-embed",
    }),
    fetchImpl: mockFetch((t) => {
      // Bias invoice-like text toward a shared direction.
      if (/請求|invoice|seikyu/i.test(t) || t.includes("請求書")) {
        return fakeEmbed("invoice-cluster" + t.slice(0, 20));
      }
      return fakeEmbed("other-cluster" + t.slice(0, 20));
    }),
    onSoftFail: (m: string) => soft.push(m),
  };

  const stats = await embedAllDocuments(store, runtime);
  assert.equal(stats.written, 2);
  assert.ok(getEmbedding(store.db, invoice.id, "test-embed"));

  const hits = await searchSimilar(
    store,
    { query: "請求書の一覧を探して", limit: 5 },
    runtime,
  );
  assert.ok(hits.length >= 1);
  assert.equal(hits[0]?.id, invoice.id);
  assert.ok((hits[0]?.score ?? 0) > (hits.find((h) => h.id === other.id)?.score ?? -1));
  store.close();
});

test("unlicensed search returns empty without fetch", async () => {
  const store = new Store(":memory:");
  store.upsertDocument(doc("share:a", "t", "c"));
  let called = 0;
  const hits = await searchSimilar(
    store,
    { query: "hello" },
    {
      settings: parseSearchVectorSettings({}),
      env: {},
      fetchImpl: async () => {
        called += 1;
        return new Response("{}", { status: 200 });
      },
    },
  );
  assert.deepEqual(hits, []);
  assert.equal(called, 0);
  store.close();
});

test("invalid plugin settings throw ConfigError", () => {
  const host = createPluginHost();
  const bad: KnotSyncPlugin = createSearchVectorPlugin({ settings: { nope: 1 } });
  assert.equal(bad.apiVersion, PLUGIN_API_VERSION);
  assert.throws(() => host.registerPlugin(bad), ConfigError);
});

test("pruneStaleDocuments removes deleted document embedding and excludes it from searchSimilar", async () => {
  const store = new Store(":memory:");
  const keepId = documentId("share", "keep.txt");
  const deadId = documentId("share", "請求書2026.txt");
  store.upsertDocument(doc(keepId, "メモ", "定例会議メモ"));
  store.upsertDocument(doc(deadId, "請求書2026", "令和8年度 請求書 サンプル"));

  const runtime = {
    settings: parseSearchVectorSettings({
      licenseKey: SEARCH_VECTOR_TEST_LICENSE_SENTINEL,
      model: "test-embed",
    }),
    fetchImpl: mockFetch((t) => fakeEmbed(t)),
  };

  const stats = await embedAllDocuments(store, runtime);
  assert.equal(stats.written, 2);
  assert.ok(getEmbedding(store.db, deadId, "test-embed"));

  store.replaceScan(
    "share",
    [
      {
        sourceId: "share",
        absPath: "/root/keep.txt",
        relPath: "keep.txt",
        ext: ".txt",
        type: "txt",
        size: 10,
        mtimeMs: Date.now(),
        hash: "h-keep",
      },
    ],
    [],
  );

  const pruneRes = store.pruneStaleDocuments(["share"]);
  assert.equal(pruneRes.pruned, 1);
  assert.equal(getEmbedding(store.db, deadId, "test-embed"), null);
  assert.ok(getEmbedding(store.db, keepId, "test-embed"));

  const hits = await searchSimilar(store, { query: "請求書", limit: 5 }, runtime);
  assert.ok(hits.every((h) => h.id !== deadId));
  store.close();
});
