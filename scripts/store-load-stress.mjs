#!/usr/bin/env node
/**
 * Offline load/stress helper for large SQLite + FTS5 indices.
 * Usage: node scripts/store-load-stress.mjs [--count 50000] [--chunk 500]
 * Requires: pnpm build (imports package dist folders).
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const storeUrl = pathToFileURL(join(root, "packages/store-sqlite/dist/index.js")).href;
const coreUrl = pathToFileURL(join(root, "packages/core/dist/index.js")).href;

const { values } = parseArgs({
  options: {
    count: { type: "string", default: "50000" },
    chunk: { type: "string", default: "500" },
    help: { type: "boolean", short: "h" },
  },
  allowPositionals: false,
});

if (values.help) {
  process.stdout.write(
    "store-load-stress — populate a temp KnotSync SQLite store and time a search\n\n" +
      "Usage:\n" +
      "  node scripts/store-load-stress.mjs [--count 50000] [--chunk 500]\n\n" +
      "Requires pnpm build. No network. Writes only under a temp directory.\n",
  );
  process.exit(0);
}

const count = Math.max(1, Number(values.count) || 50_000);
const chunkSize = Math.max(1, Number(values.chunk) || 500);

const { Store } = await import(storeUrl);
const { documentId, sha256 } = await import(coreUrl);

function makeDoc(i) {
  const loc = `doc-${i}.txt`;
  const title =
    i % 2 === 0 ? `令和6年度 請求書一覧 ${i}` : `Hóa đơn tháng 5 số ${i}`;
  const content =
    i % 2 === 0
      ? `取引先サンプル 金額 ${i} 円 請求書`
      : `Khách hàng ABC hóa đơn ${i}`;
  return {
    id: documentId("stress", loc),
    sourceId: "stress",
    type: "txt",
    title,
    content,
    tables: [],
    metadata: {},
    pii: [],
    guard: [],
    hash: sha256(content),
  };
}

const dir = await mkdtemp(join(tmpdir(), "knot-sync-stress-"));
const dbPath = join(dir, "store.sqlite");
const store = new Store(dbPath);

const memBefore = process.memoryUsage().heapUsed;
const t0 = performance.now();
const batch = [];
for (let i = 0; i < count; i++) {
  batch.push(makeDoc(i));
  if (batch.length >= chunkSize) {
    store.upsertDocuments(batch, { chunkSize });
    batch.length = 0;
  }
}
if (batch.length) store.upsertDocuments(batch, { chunkSize });
const insertMs = performance.now() - t0;

store.optimize();

const t1 = performance.now();
const hits = store.search("請求書", { limit: 20 });
const searchMs = performance.now() - t1;
const memAfter = process.memoryUsage().heapUsed;

store.close();
await rm(dir, { recursive: true, force: true });

process.stdout.write(
  JSON.stringify(
    {
      count,
      chunkSize,
      insertMs: Math.round(insertMs),
      searchMs: Math.round(searchMs * 100) / 100,
      hitCount: hits.length,
      heapUsedMb: Math.round(((memAfter - memBefore) / (1024 * 1024)) * 10) / 10,
      heapTotalMb: Math.round((memAfter / (1024 * 1024)) * 10) / 10,
    },
    null,
    2,
  ) + "\n",
);
