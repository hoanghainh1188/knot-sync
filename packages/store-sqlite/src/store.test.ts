import { test } from "node:test";
import assert from "node:assert/strict";
import { documentId, sha256, type Document, type FileEntry } from "@hoanghainh/knot-sync-core";
import { Store } from "./index.js";

function doc(sourceId: string, loc: string, title: string, content: string): Document {
  return {
    id: documentId(sourceId, loc),
    sourceId,
    type: "xlsx",
    title,
    content,
    tables: [],
    metadata: { dept: "経理" },
    pii: [],
    hash: sha256(content),
  };
}

function file(rel: string, size: number, hash: string | null, mtimeMs = Date.now()): FileEntry {
  return {
    sourceId: "s",
    absPath: `/root/${rel}`,
    relPath: rel,
    ext: ".xlsx",
    type: "xlsx",
    size,
    mtimeMs,
    hash,
  };
}

test("search works for Japanese, Vietnamese and short terms", () => {
  const store = new Store(":memory:");
  store.upsertDocument(doc("s", "a", "令和6年度 請求書一覧", "取引先: 株式会社サンプル 金額 120,000円"));
  store.upsertDocument(doc("s", "b", "Hóa đơn tháng 5", "Khách hàng: Công ty ABC, số tiền 5.000.000 đồng"));

  assert.equal(store.search("請求書")[0]?.title, "令和6年度 請求書一覧");
  assert.equal(store.search("請求")[0]?.title, "令和6年度 請求書一覧", "2-char term falls back to LIKE");
  assert.equal(store.search("hóa đơn")[0]?.title, "Hóa đơn tháng 5");
  assert.equal(store.search("サンプル 金額").length, 1, "terms are AND-ed");
  assert.equal(store.search("サンプル Khách").length, 0);
  assert.deepEqual(store.search("   "), []);
  assert.equal(store.search('"quote" 100%').length, 0, "special characters do not break SQL");
  store.close();
});

test("upsert updates the FTS index", () => {
  const store = new Store(":memory:");
  const d = doc("s", "a", "見積書", "旧内容テキスト");
  store.upsertDocument(d);
  store.upsertDocument({ ...d, content: "新しい内容テキスト" });
  assert.equal(store.search("旧内容").length, 0);
  assert.equal(store.search("新しい").length, 1);
  assert.equal(store.getDocument(d.id)?.metadata.dept, "経理");
  assert.equal(store.getDocument("missing"), null);
  store.close();
});

test("scan stats: types, duplicates, old and empty files", () => {
  const store = new Store(":memory:");
  const tenYearsAgo = Date.now() - 10 * 365 * 24 * 3600 * 1000;
  store.replaceScan(
    "s",
    [
      file("a.xlsx", 100, "h1"),
      file("copy/a.xlsx", 100, "h1"),
      file("copy2/a.xlsx", 100, "h1"),
      file("b.xlsx", 50, "h2", tenYearsAgo),
      file("empty1.xlsx", 0, "e"),
      file("empty2.xlsx", 0, "e"),
    ],
    [{ sourceId: "s", path: "/root/secret", code: "EACCES", message: "denied" }],
  );
  const st = store.stats("s", 5);
  assert.equal(st.fileCount, 6);
  assert.equal(st.totalBytes, 350);
  assert.equal(st.duplicateGroups, 1);
  assert.equal(st.duplicateFiles, 2);
  assert.equal(st.duplicateBytes, 200);
  assert.equal(st.oldFiles, 1);
  assert.equal(st.emptyFiles, 2);
  assert.equal(st.issues, 1);
  assert.ok(st.scannedAt);

  const groups = store.duplicateGroups("s");
  assert.deepEqual(groups[0]?.paths, ["a.xlsx", "copy/a.xlsx", "copy2/a.xlsx"]);

  // A new scan replaces the old inventory.
  store.replaceScan("s", [file("only.xlsx", 1, "x")], []);
  assert.equal(store.stats("s", 5).fileCount, 1);
  assert.equal(store.stats("s", 5).issues, 0);
  store.close();
});
