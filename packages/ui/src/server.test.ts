import assert from "node:assert/strict";
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
