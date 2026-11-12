import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  stringifyCatalog,
  type CatalogDocument,
  writeCatalogFile,
} from "@hoanghainh/knot-sync-catalog";
import { Store } from "@hoanghainh/knot-sync-store-sqlite";
import {
  DEFAULT_UI_PORT,
  LOOPBACK_HOST,
  createUiServer,
  readStaticIndex,
  resolveStaticDir,
} from "./server.js";

function sampleCatalog(): CatalogDocument {
  return {
    version: 1,
    sources: {
      erp: {
        tables: {
          受注: {
            label: { ja: "受注", vi: "", en: "Orders" },
            description: "",
            reviewed: false,
            columns: {
              TKSK_CD: {
                label: { ja: "", vi: "mã KH", en: "" },
                description: "",
                type: "text",
                values: ["001"],
                pii: false,
                expose: true,
                reviewed: false,
              },
              DONE_COL: {
                label: { ja: "完了", vi: "", en: "done" },
                description: "",
                type: "text",
                values: [],
                pii: false,
                expose: true,
                reviewed: true,
              },
            },
          },
        },
      },
    },
  };
}

test("createUiServer rejects non-loopback host", async () => {
  await assert.rejects(
    () =>
      createUiServer({
        catalogPath: "/tmp/x.yaml",
        host: "0.0.0.0",
        staticDir: resolveStaticDir(),
      }),
    /loopback|127\.0\.0\.1/,
  );
});

test("busy port yields actionable error", async () => {
  const blocker = createServer(() => undefined);
  await new Promise<void>((resolve, reject) => {
    blocker.once("error", reject);
    blocker.listen(0, LOOPBACK_HOST, () => resolve());
  });
  const addr = blocker.address();
  assert.ok(addr && typeof addr === "object");
  const port = addr.port;
  try {
    await assert.rejects(
      () =>
        createUiServer({
          catalogPath: "/tmp/x.yaml",
          port,
          staticDir: resolveStaticDir(),
        }),
      /already in use|--port/,
    );
  } finally {
    await new Promise<void>((resolve, reject) => {
      blocker.close((err) => (err ? reject(err) : resolve()));
    });
  }
});

test("GET/PUT catalog round-trip with JP names and reviewed", async () => {
  const dir = await mkdtemp(join(tmpdir(), "knot-ui-"));
  const catalogPath = join(dir, "knot-sync.catalog.yaml");
  await writeCatalogFile(catalogPath, sampleCatalog());
  const staticDir = resolveStaticDir();
  const ui = await createUiServer({ catalogPath, staticDir, port: 0 });
  try {
    assert.equal(ui.host, LOOPBACK_HOST);
    assert.match(ui.url, /^http:\/\/127\.0\.0\.1:\d+\/$/);

    const health = await fetch(new URL("/api/health", ui.url));
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { ok: true });

    const getRes = await fetch(new URL("/api/catalog", ui.url));
    assert.equal(getRes.status, 200);
    const doc = (await getRes.json()) as CatalogDocument;
    assert.ok(doc.sources.erp?.tables["受注"]?.columns.TKSK_CD);

    doc.sources.erp!.tables["受注"]!.columns.TKSK_CD!.label.ja = "得意先コード";
    doc.sources.erp!.tables["受注"]!.columns.TKSK_CD!.reviewed = true;

    const putRes = await fetch(new URL("/api/catalog", ui.url), {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(doc),
    });
    assert.equal(putRes.status, 200);

    const text = await readFile(catalogPath, "utf8");
    assert.match(text, /得意先コード/);
    assert.match(text, /TKSK_CD/);
    assert.match(text, /reviewed:\s*true/);
  } finally {
    await ui.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("built index.html has no CDN URLs", async () => {
  const html = await readStaticIndex();
  assert.doesNotMatch(html, /https?:\/\/cdn\.|unpkg\.com|jsdelivr|googleapis/i);
  assert.match(html, /script|stylesheet|\.js/i);
});

test("default port constant is documented value", () => {
  assert.equal(DEFAULT_UI_PORT, 8787);
  assert.equal(LOOPBACK_HOST, "127.0.0.1");
});

test("stringify sample stays valid yaml shape", () => {
  const text = stringifyCatalog(sampleCatalog());
  assert.match(text, /受注/);
  assert.match(text, /TKSK_CD/);
});

test("missing storePath returns storeExists: false without creating a SQLite file", async () => {
  const dir = await mkdtemp(join(tmpdir(), "knot-sync-ui-nostore-"));
  const catalogPath = join(dir, "knot-sync.catalog.yaml");
  const missingStorePath = join(dir, "never-created.sqlite");
  await writeCatalogFile(catalogPath, sampleCatalog());

  const ui = await createUiServer({ catalogPath, storePath: missingStorePath, port: 0 });
  try {
    const docsRes = await fetch(`${ui.url}api/documents`);
    assert.equal(docsRes.status, 200);
    const docsBody = (await docsRes.json()) as { storeExists: boolean; documents: unknown[] };
    assert.equal(docsBody.storeExists, false);
    assert.deepEqual(docsBody.documents, []);

    const healthRes = await fetch(`${ui.url}api/health-summary`);
    assert.equal(healthRes.status, 200);
    const healthBody = (await healthRes.json()) as { storeExists: boolean; sources: unknown[] };
    assert.equal(healthBody.storeExists, false);
    assert.deepEqual(healthBody.sources, []);

    assert.equal(existsSync(missingStorePath), false, "UI must not create an empty DB file");
  } finally {
    await ui.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("GET /api/documents, GET /api/health-summary, and 405 on mutations", async () => {
  const dir = await mkdtemp(join(tmpdir(), "knot-sync-ui-docs-"));
  const catalogPath = join(dir, "knot-sync.catalog.yaml");
  const storePath = join(dir, "store.sqlite");
  await writeCatalogFile(catalogPath, sampleCatalog());

  const store = new Store(storePath);
  store.replaceScan(
    "jp-docs",
    [
      {
        sourceId: "jp-docs",
        absPath: "/tmp/seikyu.pdf",
        relPath: "seikyu.pdf",
        ext: ".pdf",
        type: "pdf",
        size: 120,
        mtimeMs: Date.now(),
        hash: "h1",
      },
    ],
    [{ sourceId: "jp-docs", path: "locked.pdf", code: "EACCES", message: "Locked" }],
  );
  store.replaceRunIssues([
    { sourceId: "jp-docs", path: "scan.pdf", code: "EXTRACT", message: "No text layer" },
  ]);
  store.upsertDocuments([
    {
      id: "doc-jp-1",
      sourceId: "jp-docs",
      type: "pdf",
      title: "令和6年度 請求書一覧",
      content: "担当: [PII:email] 請求書",
      tables: [],
      metadata: {
        guardRisk: "high",
        originalContent: "担当: secret@example.co.jp 請求書",
        originalTables: "[[\"090-1111-2222\"]]",
      },
      pii: [{ rule: "email", start: 4, end: 24 }],
      guard: [{ rule: "instruction-ja", start: 0, end: 5 }],
      hash: "h1",
    },
    {
      id: "doc-vn-1",
      sourceId: "vn-docs",
      type: "docx",
      title: "Hóa đơn tháng 5",
      content: "Số CCCD: [PII:cccd]",
      tables: [],
      metadata: { guardRisk: "low" },
      pii: [{ rule: "cccd", start: 9, end: 19 }],
      guard: [{ rule: "controls", start: 0, end: 1 }],
      hash: "h2",
    },
  ]);
  store.close();

  const ui = await createUiServer({ catalogPath, storePath, port: 0 });
  try {
    const jpRes = await fetch(`${ui.url}api/documents?q=${encodeURIComponent("請求書")}`);
    assert.equal(jpRes.status, 200);
    const jpText = await jpRes.text();
    assert.equal(jpText.includes("secret@example.co.jp"), false);
    assert.equal(jpText.includes("090-1111-2222"), false);
    assert.equal(jpText.includes("originalContent"), false);
    assert.equal(jpText.includes("originalTables"), false);
    const jpJson = JSON.parse(jpText) as {
      storeExists: boolean;
      total: number;
      documents: Array<{ id: string; guardRisk: string; piiCount: number }>;
    };
    assert.equal(jpJson.storeExists, true);
    assert.equal(jpJson.total, 1);
    assert.equal(jpJson.documents[0]?.id, "doc-jp-1");
    assert.equal(jpJson.documents[0]?.guardRisk, "high");
    assert.equal(jpJson.documents[0]?.piiCount, 1);

    const lowRes = await fetch(`${ui.url}api/documents?guardRisk=low`);
    assert.equal(lowRes.status, 200);
    const lowJson = (await lowRes.json()) as { documents: Array<{ title: string }> };
    assert.equal(lowJson.documents.length, 1);
    assert.equal(lowJson.documents[0]?.title, "Hóa đơn tháng 5");

    const healthRes = await fetch(`${ui.url}api/health-summary`);
    assert.equal(healthRes.status, 200);
    const healthJson = (await healthRes.json()) as {
      storeExists: boolean;
      totalDocuments: number;
      sources: Array<{ sourceId: string; documentCount: number }>;
      scanIssues: Array<{ code: string }>;
      runIssues: Array<{ code: string }>;
    };
    assert.equal(healthJson.storeExists, true);
    assert.equal(healthJson.totalDocuments, 2);
    assert.equal(healthJson.scanIssues[0]?.code, "EACCES");
    assert.equal(healthJson.runIssues[0]?.code, "EXTRACT");

    for (const method of ["POST", "PUT", "DELETE"]) {
      const mDocs = await fetch(`${ui.url}api/documents`, { method });
      assert.equal(mDocs.status, 405);
      const mHealth = await fetch(`${ui.url}api/health-summary`, { method });
      assert.equal(mHealth.status, 405);
    }
  } finally {
    await ui.close();
    await rm(dir, { recursive: true, force: true });
  }
});
