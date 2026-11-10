import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createPluginHost,
  documentId,
  sha256,
  type AppConfig,
  type Document,
} from "@hoanghainh/knot-sync-core";
import { Store } from "@hoanghainh/knot-sync-store-sqlite";
import {
  API_KEY_ENV,
  AuditLog,
  assertAuditPathOutsideSources,
  checkBearerAuth,
  createKnotMcpServer,
  createMcpToolsPlugin,
  documentUri,
  frameDocument,
  framedDocumentText,
  handleGetDocument,
  handleSearchDocuments,
  isAllowedLoopbackHostHeader,
  missingApiKeyMessage,
  parseDocumentUri,
  readApiKeyFromEnv,
  runWithAuditHttpContext,
  serveHttp,
  SOURCES_URI,
  UNTRUSTED_BANNER,
} from "./index.js";

function doc(
  sourceId: string,
  loc: string,
  title: string,
  content: string,
  extra?: Partial<Document>,
): Document {
  return {
    id: documentId(sourceId, loc),
    sourceId,
    type: "xlsx",
    title,
    content,
    tables: [],
    metadata: {},
    pii: [],
    guard: [],
    hash: sha256(content),
    ...extra,
  };
}

function minimalConfig(sourcePath: string, auditLog: string): AppConfig {
  return {
    baseDir: "/",
    sources: [
      {
        id: "share",
        type: "fs",
        path: sourcePath,
        extensions: [],
        exclude: [],
      },
    ],
    store: { path: join(sourcePath, "..", "store.sqlite") },
    scan: { oldFileYears: 5, hash: true },
    cleaning: {
      nfkc: true,
      wareki: true,
      datesIso: true,
      legacyVietnamese: true,
      tokenReduce: true,
    },
    extraction: { maxFileSizeMb: 50, timeoutSeconds: 30, maxTextChars: 500_000 },
    pii: { mode: "mask", saltPath: "/tmp/salt" },
    guard: { mode: "flag" },
    server: { auditLog },
    logging: { path: join(sourcePath, "..", "system.jsonl"), level: "info" },
    catalog: {
      path: "/tmp/knot-sync.catalog.yaml",
      definitionMapping: {
        physical: "物理名",
        label_ja: "論理名",
        label_vi: "Tên nghiệp vụ",
        label_en: "Business name",
        description: "説明",
        sheet: "項目",
      },
    },
    prompts: [
      {
        name: "find-invoice",
        description: "Find invoices",
        arguments: [{ name: "query", description: "Terms", required: true }],
        template: "Search for {{query}}",
      },
    ],
    cli: {},
    plugins: [],
    pluginSettings: {},
  };
}

test("frameDocument always includes untrusted banner and guard fields", () => {
  const d = doc("share", "a.xlsx", "請求書", "body", {
    guard: [{ rule: "instruction-ja", start: 0, end: 2 }],
    metadata: { guardRisk: "high" },
  });
  const framed = frameDocument(d);
  assert.equal(framed.framing, UNTRUSTED_BANNER);
  assert.equal(framed.guardRisk, "high");
  assert.equal(framed.guard.length, 1);
  const text = framedDocumentText(framed);
  assert.match(text, /UNTRUSTED_DOCUMENT_CONTENT/);
  assert.match(text, /請求書/);
  assert.match(text, /instruction-ja/);
});

test("document URI round-trip with JP-safe encoding", () => {
  const id = documentId("share", "営業/見積書.xlsx");
  const uri = documentUri("share", id);
  assert.match(uri, /^knot:\/\/docs\/share\//);
  const parsed = parseDocumentUri(uri);
  assert.deepEqual(parsed, { sourceId: "share", docId: id });
  assert.equal(SOURCES_URI, "knot://sources");
});

test("audit log refuses source paths and appends JSONL", async () => {
  const root = await mkdtemp(join(tmpdir(), "mcpn-audit-"));
  try {
    const share = join(root, "share");
    assert.throws(
      () => assertAuditPathOutsideSources(join(share, "audit.jsonl"), [share]),
      /Refusing to write MCP audit log/,
    );
    const auditPath = join(root, "mcp-audit.jsonl");
    const abs = assertAuditPathOutsideSources(auditPath, [share]);
    const log = new AuditLog(abs);
    await log.append({
      timestamp: "2026-01-01T00:00:00.000Z",
      kind: "tool",
      name: "search_documents",
      arguments: { query: "請求書" },
      resultCount: 1,
      status: "ok",
    });
    const text = await readFile(abs, "utf8");
    const line = JSON.parse(text.trim()) as { name: string; arguments: { query: string } };
    assert.equal(line.name, "search_documents");
    assert.equal(line.arguments.query, "請求書");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("search_documents and get_document handlers with JP/VN and guard flags", async () => {
  const store = new Store(":memory:");
  const ja = doc("share", "a.xlsx", "令和6年度 請求書一覧", "請求書 body", {
    guard: [{ rule: "instruction-ja", start: 0, end: 4 }],
    metadata: { guardRisk: "medium" },
  });
  const vn = doc("share", "b.txt", "Hóa đơn tháng 5", "nội dung hóa đơn");
  vn.type = "txt";
  store.upsertDocument(ja);
  store.upsertDocument(vn);

  const search = await handleSearchDocuments({ query: "請求書" }, { store });
  assert.match(search.content, /UNTRUSTED_DOCUMENT_CONTENT/);
  assert.match(search.content, /令和6年度/);
  assert.equal(search.meta?.resultCount, 1);

  const filtered = await handleSearchDocuments(
    { query: "Hóa đơn", source: "share", type: "txt" },
    { store },
  );
  assert.equal(filtered.meta?.resultCount, 1);

  const got = await handleGetDocument({ id: ja.id }, { store });
  assert.match(got.content, /UNTRUSTED_DOCUMENT_CONTENT/);
  assert.match(got.content, /guardRisk: medium/);
  assert.match(got.content, /instruction-ja/);

  const missing = await handleGetDocument({ id: "nope" }, { store });
  assert.match(missing.content, /not found/i);
  assert.equal(missing.meta?.status, "not_found");
  store.close();
});

test("createMcpToolsPlugin registers mcp-tool ids", () => {
  const host = createPluginHost();
  host.registerPlugin(createMcpToolsPlugin());
  assert.ok(host.mcpTools.has("search_documents"));
  assert.ok(host.mcpTools.has("get_document"));
});

test("createKnotMcpServer builds without binding a network port", async () => {
  const root = await mkdtemp(join(tmpdir(), "mcpn-srv-"));
  try {
    const share = join(root, "share");
    const auditLog = join(root, "audit.jsonl");
    const store = new Store(":memory:");
    const host = createPluginHost();
    host.registerPlugin(createMcpToolsPlugin());
    const server = createKnotMcpServer({
      store,
      host,
      config: minimalConfig(share, auditLog),
    });
    assert.ok(server);
    // Exercise handlers used by tools (no stdio / no listen).
    const result = await handleSearchDocuments({ query: "x" }, { store });
    assert.equal(result.meta?.resultCount, 0);
    store.close();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("checkBearerAuth matches timing-safe and rejects bad headers", () => {
  assert.equal(checkBearerAuth("Bearer secret-key", "secret-key"), true);
  assert.equal(checkBearerAuth("bearer secret-key", "secret-key"), true);
  assert.equal(checkBearerAuth("Bearer wrong", "secret-key"), false);
  assert.equal(checkBearerAuth("Basic secret-key", "secret-key"), false);
  assert.equal(checkBearerAuth(undefined, "secret-key"), false);
  assert.equal(readApiKeyFromEnv({ [API_KEY_ENV]: "  abc  " }), "abc");
  assert.equal(readApiKeyFromEnv({ [API_KEY_ENV]: "  " }), undefined);
  assert.match(missingApiKeyMessage(), new RegExp(API_KEY_ENV));
});

test("AuditLog merges HTTP context fields", async () => {
  const root = await mkdtemp(join(tmpdir(), "mcpn-aud-"));
  try {
    const path = join(root, "a.jsonl");
    const log = new AuditLog(path);
    await log.append({
      timestamp: "2024-01-01T00:00:00.000Z",
      kind: "tool",
      name: "search_documents",
      resultCount: 0,
      status: "ok",
    });
    await runWithAuditHttpContext(
      { clientIp: "127.0.0.1", userAgent: "test-agent", requestId: "req-1" },
      async () => {
        await log.append({
          timestamp: "2024-01-01T00:00:01.000Z",
          kind: "tool",
          name: "search_documents",
          resultCount: 1,
          status: "ok",
        });
      },
    );
    const lines = (await readFile(path, "utf8")).trim().split("\n");
    assert.equal(lines.length, 2);
    const first = JSON.parse(lines[0]!);
    const second = JSON.parse(lines[1]!);
    assert.equal(first.clientIp, undefined);
    assert.equal(second.clientIp, "127.0.0.1");
    assert.equal(second.userAgent, "test-agent");
    assert.equal(second.requestId, "req-1");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("serveHttp requires API key and rejects unauthorized requests", async () => {
  assert.equal(isAllowedLoopbackHostHeader("127.0.0.1:3000"), true);
  assert.equal(isAllowedLoopbackHostHeader("[::1]:3000"), true);
  assert.equal(isAllowedLoopbackHostHeader("[::1]"), true);
  assert.equal(isAllowedLoopbackHostHeader("::1"), true);
  assert.equal(isAllowedLoopbackHostHeader("evil.example"), false);

  const root = await mkdtemp(join(tmpdir(), "mcpn-http-"));
  const share = join(root, "share");
  const auditLog = join(root, "audit.jsonl");
  const store = new Store(":memory:");
  store.upsertDocument(
    doc("share", "経理/請求.txt", "請求書", "合計金額 1000", { type: "txt" }),
  );
  const host = createPluginHost();
  host.registerPlugin(createMcpToolsPlugin());
  const config = minimalConfig(share, auditLog);
  const ac = new AbortController();
  let boundPort = 0;
  const serving = serveHttp({
    store,
    host,
    config,
    apiKey: "test-secret",
    bindHost: "127.0.0.1",
    port: 0,
    signal: ac.signal,
    onListening: (info) => {
      boundPort = info.port;
    },
  });
  // Wait until listening
  for (let i = 0; i < 50 && boundPort === 0; i++) {
    await new Promise((r) => setTimeout(r, 20));
  }
  assert.ok(boundPort > 0);

  try {
    const unauthorized = await fetch(`http://127.0.0.1:${boundPort}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        host: "127.0.0.1",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "t", version: "0" },
        },
      }),
    });
    assert.equal(unauthorized.status, 401);

    const ok = await fetch(`http://127.0.0.1:${boundPort}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        authorization: "Bearer test-secret",
        host: "127.0.0.1",
        "user-agent": "knot-test/1",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "t", version: "0" },
        },
      }),
    });
    assert.equal(ok.status, 200);
    assert.ok(ok.headers.get("mcp-session-id"));
  } finally {
    ac.abort();
    await serving;
    store.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("serveHttp fails fast without API key", async () => {
  const store = new Store(":memory:");
  const host = createPluginHost();
  await assert.rejects(
    () =>
      serveHttp({
        store,
        host,
        config: minimalConfig("/tmp/share", "/tmp/a.jsonl"),
        apiKey: "",
        bindHost: "127.0.0.1",
        port: 0,
      }),
    /KNOT_SYNC_API_KEY/,
  );
  store.close();
});
