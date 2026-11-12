import { test } from "node:test";
import assert from "node:assert/strict";
import { documentId, sha256, type Document, type FileEntry } from "@hoanghainh/knot-sync-core";
import { DEFAULT_UPSERT_CHUNK, Store } from "./index.js";

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
    guard: [],
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

test("search filters by sourceId and type", () => {
  const store = new Store(":memory:");
  store.upsertDocument(doc("share", "a", "令和6年度 請求書一覧", "請求書 body"));
  const other = doc("other", "b", "請求書 other", "請求書 other body");
  other.type = "txt";
  store.upsertDocument(other);

  const bySource = store.search("請求書", { sourceId: "share" });
  assert.equal(bySource.length, 1);
  assert.equal(bySource[0]?.sourceId, "share");

  const byType = store.search("請求書", { type: "txt" });
  assert.equal(byType.length, 1);
  assert.equal(byType[0]?.type, "txt");

  const shortFiltered = store.search("請求", { sourceId: "share" });
  assert.equal(shortFiltered.length, 1);
  assert.equal(shortFiltered[0]?.sourceId, "share");
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

test("listFiles and unchanged extraction helpers", () => {
  const store = new Store(":memory:");
  store.replaceScan("s", [file("経理/a.xlsx", 10, "abc"), file("b.xlsx", 5, "def")], []);
  const listed = store.listFiles("s");
  assert.equal(listed.length, 2);
  assert.equal(listed[0]?.relPath, "b.xlsx");
  assert.equal(listed[1]?.relPath, "経理/a.xlsx");

  assert.equal(store.isUnchangedExtraction(file("経理/a.xlsx", 10, "abc")), false);
  const d = doc("s", "経理/a.xlsx", "t", "c");
  d.metadata = { sourceFileHash: "abc" };
  store.upsertDocument(d);
  assert.equal(store.isUnchangedExtraction(file("経理/a.xlsx", 10, "abc")), true);
  assert.equal(store.isUnchangedExtraction(file("経理/a.xlsx", 10, "changed")), false);
  assert.equal(store.getDocumentByLocation("s", "経理/a.xlsx")?.title, "t");
  assert.equal(store.documentCount(), 1);
  assert.equal(store.listDocuments().length, 1);
  assert.equal(store.findRelPathForDocument(d.id), "経理/a.xlsx");
  store.close();
});

test("upsertDocuments batches Japanese docs and keeps search working", () => {
  const store = new Store(":memory:");
  assert.equal(DEFAULT_UPSERT_CHUNK, 500);
  store.upsertDocuments([
    doc("s", "a", "令和6年度 請求書一覧", "請求書 body"),
    doc("s", "b", "Hóa đơn tháng 5", "hóa đơn body"),
  ]);
  assert.equal(store.search("請求書")[0]?.title, "令和6年度 請求書一覧");
  assert.equal(store.documentCount(), 2);
  store.close();
});

test("upsertDocuments rolls back only the failed chunk", () => {
  const store = new Store(":memory:");
  const ok = doc("s", "ok", "請求書 ok", "請求書 committed");
  store.upsertDocuments([ok], { chunkSize: 1 });

  const good = doc("s", "g", "請求書 good", "請求書 pending");
  const bad = doc("s", "bad", "請求書 bad", "x");
  Object.defineProperty(bad, "content", {
    get() {
      throw new Error("boom");
    },
  });
  assert.throws(() => store.upsertDocuments([good, bad], { chunkSize: 2 }), /boom/);
  assert.equal(store.documentCount(), 1);
  assert.equal(store.search("committed")[0]?.id, ok.id);
  assert.equal(store.getDocument(good.id), null);
  store.close();
});

test("optimize keeps Japanese search working", () => {
  const store = new Store(":memory:");
  store.upsertDocument(doc("s", "a", "請求書", "本文 請求書"));
  const result = store.optimize();
  assert.equal(result.ftsOptimized, true);
  assert.equal(store.search("請求書").length, 1);
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

test("hasAnyScan and pruneStaleDocuments remove deleted JP/VI docs and FTS hits", () => {
  const store = new Store(":memory:");
  assert.equal(store.hasAnyScan(), false);

  const invDoc = doc("s", "令和6年度_請求書.xlsx", "請求書", "請求書 120000円");
  const memoDoc = doc("s", "メモ.txt", "メモ", "メモ 本文");
  const manualDoc = doc("manual", "keep.txt", "Hóa đơn thủ công", "Hóa đơn thủ công nội dung");
  store.upsertDocuments([invDoc, memoDoc, manualDoc]);

  // Without scan markers, nothing is pruned even when files table is empty.
  assert.deepEqual(store.pruneStaleDocuments(), { pruned: 0, prunedIds: [] });
  assert.equal(store.documentCount(), 3);

  store.replaceScan(
    "s",
    [file("メモ.txt", 10, "h-memo")],
    [],
  );
  assert.equal(store.hasAnyScan(), true);

  const res = store.pruneStaleDocuments();
  assert.equal(res.pruned, 1);
  assert.deepEqual(res.prunedIds, [invDoc.id]);
  assert.equal(store.getDocument(invDoc.id), null);
  assert.equal(store.search("請求書").length, 0, "pruned document must leave FTS5 index");
  assert.equal(store.search("メモ").length, 1, "live document stays searchable");
  assert.equal(store.getDocument(manualDoc.id)?.title, "Hóa đơn thủ công", "unscanned source preserved");

  // Scanned source cleared to 0 files prunes all remaining docs for that source.
  store.replaceScan("s", [], []);
  const resAll = store.pruneStaleDocuments(["s"]);
  assert.equal(resAll.pruned, 1);
  assert.deepEqual(resAll.prunedIds, [memoDoc.id]);
  assert.equal(store.search("メモ").length, 0);
  assert.equal(store.documentCount(), 1, "manual source doc remains");
  store.close();
});

test("pruneStaleDocuments cleans orphaned rows from document_embeddings when present", () => {
  const store = new Store(":memory:");
  const keepDoc = doc("s", "keep.txt", "Keep", "giữ lại");
  const staleDoc = doc("s", "deleted.txt", "Deleted", "đã xóa");
  store.upsertDocuments([keepDoc, staleDoc]);

  store.db.exec(`
    CREATE TABLE document_embeddings (
      doc_id TEXT NOT NULL,
      model TEXT NOT NULL,
      dim INTEGER NOT NULL,
      vector_json TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (doc_id, model)
    );
  `);
  const insEmb = store.db.prepare(
    "INSERT INTO document_embeddings (doc_id, model, dim, vector_json, content_hash, updated_at) VALUES (?, 'm', 2, '[1,0]', 'h', '2026-01-01')",
  );
  insEmb.run(keepDoc.id);
  insEmb.run(staleDoc.id);

  store.replaceScan("s", [file("keep.txt", 5, "hk")], []);
  const res = store.pruneStaleDocuments(["s"]);
  assert.equal(res.pruned, 1);

  const remaining = store.db
    .prepare("SELECT doc_id FROM document_embeddings")
    .all() as Array<{ doc_id: string }>;
  assert.deepEqual(remaining.map((r) => r.doc_id), [keepDoc.id]);
  store.close();
});

test("run_issues round-trip replacement and listScanIssues", () => {
  const store = new Store(":memory:");
  store.replaceScan("s", [file("ok.txt", 10, "h1")], [
    { sourceId: "s", path: "bad.pdf", code: "EACCES", message: "Permission denied" },
  ]);
  store.replaceRunIssues([
    { sourceId: "s", path: "scan.pdf", code: "EXTRACT", message: "No text layer" },
    { path: "sheet.xlsx", code: "PII", message: "Masked 2 findings" },
  ]);

  const scanIssues = store.listScanIssues();
  assert.equal(scanIssues.length, 1);
  assert.equal(scanIssues[0]?.code, "EACCES");
  assert.equal(store.listScanIssues("other").length, 0);

  const runIssues = store.listRunIssues();
  assert.equal(runIssues.length, 2);
  assert.equal(runIssues[0]?.code, "EXTRACT");
  assert.equal(runIssues[1]?.sourceId, "");
  assert.ok(runIssues[0]?.recordedAt);

  // Subsequent pass replaces previous run_issues
  store.replaceRunIssues([]);
  assert.equal(store.listRunIssues().length, 0);

  const allStats = store.listAllSourceStats();
  assert.equal(allStats.length, 1);
  assert.equal(allStats[0]?.sourceId, "s");
  store.close();
});

test("listSanitizedDocuments filters JP/VN/guardRisk and omits originalContent/raw PII", () => {
  const store = new Store(":memory:");
  const jpDoc = {
    ...doc("jp-src", "seikyu.pdf", "令和6年度 請求書一覧", "担当者: [PII:email] 請求書の内容です。"),
    pii: [{ rule: "email", start: 5, end: 25 }],
    guard: [{ rule: "instruction-en", start: 0, end: 10 }],
    metadata: {
      guardRisk: "medium",
      originalContent: "担当者: taro@example.com 請求書の内容です。",
      originalTables: "[[\"0901234567\"]]",
    },
  };
  const vnDoc = {
    ...doc("vn-src", "hoadon.docx", "Hóa đơn tháng 5", "Khách hàng: [PII:cccd]"),
    pii: [{ rule: "cccd", start: 12, end: 24 }],
    guard: [{ rule: "controls", start: 0, end: 1 }],
    metadata: {
      guardRisk: "low",
      originalContent: "Khách hàng: 079099001234",
    },
  };
  store.upsertDocuments([jpDoc, vnDoc]);

  const counts = store.countDocumentsBySource();
  assert.deepEqual(counts, { "jp-src": 1, "vn-src": 1 });

  const jpSearch = store.listSanitizedDocuments({ q: "請求書" });
  assert.equal(jpSearch.total, 1);
  assert.equal(jpSearch.documents[0]?.id, jpDoc.id);
  assert.equal(jpSearch.documents[0]?.piiCount, 1);
  assert.deepEqual(jpSearch.documents[0]?.piiByType, { email: 1 });
  assert.equal(jpSearch.documents[0]?.guardRisk, "medium");

  const payloadJson = JSON.stringify(jpSearch);
  assert.equal(payloadJson.includes("taro@example.com"), false);
  assert.equal(payloadJson.includes("0901234567"), false);
  assert.equal(payloadJson.includes("originalContent"), false);
  assert.equal(payloadJson.includes("originalTables"), false);

  const riskLow = store.listSanitizedDocuments({ guardRisk: "low" });
  assert.equal(riskLow.total, 1);
  assert.equal(riskLow.documents[0]?.id, vnDoc.id);

  const paged = store.listSanitizedDocuments({ limit: 1, offset: 1 });
  assert.equal(paged.total, 2);
  assert.equal(paged.documents.length, 1);
  store.close();
});
