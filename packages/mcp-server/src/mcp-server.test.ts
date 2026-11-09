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
  AuditLog,
  assertAuditPathOutsideSources,
  createKnotMcpServer,
  createMcpToolsPlugin,
  documentUri,
  frameDocument,
  framedDocumentText,
  handleGetDocument,
  handleSearchDocuments,
  parseDocumentUri,
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
