import assert from "node:assert/strict";
import { documentId, sha256, type Document, type FileEntry } from "@hoanghainh/knot-sync-core";
import { Store } from "@hoanghainh/knot-sync-store-sqlite";
import { test } from "node:test";
import { runSearchCase, runSearchSuite } from "./search.js";

function doc(loc: string, title: string, content: string): Document {
  return {
    id: documentId("share", loc),
    sourceId: "share",
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

function file(rel: string): FileEntry {
  return {
    sourceId: "share",
    absPath: `/root/${rel}`,
    relPath: rel,
    ext: ".txt",
    type: "txt",
    size: 1,
    mtimeMs: Date.now(),
    hash: "h",
  };
}

test("Vietnamese search case passes; missing expect fails", () => {
  const store = new Store(":memory:");
  try {
    store.replaceScan("share", [file("invoices/hoa-don.txt")], []);
    store.upsertDocument(doc("invoices/hoa-don.txt", "Hóa đơn tháng 5", "Khách hàng ABC hóa đơn"));
    store.upsertDocument(doc("other.txt", "Other", "no match here"));

    const pass = runSearchCase(store, {
      id: "invoice-vi",
      query: "hóa đơn",
      expect: { titleContains: "Hóa đơn" },
    });
    assert.equal(pass.passed, true);

    const byPath = runSearchCase(store, {
      id: "by-path",
      query: "hóa đơn",
      expect: { pathContains: "hoa-don" },
    });
    assert.equal(byPath.passed, true);

    const fail = runSearchCase(store, {
      id: "missing",
      query: "hóa đơn",
      expect: { documentId: "does-not-exist" },
    });
    assert.equal(fail.passed, false);

    const suite = runSearchSuite(store, [
      { id: "ok", query: "hóa đơn", expect: { titleContains: "Hóa đơn" } },
      { id: "bad", query: "hóa đơn", expect: { titleContains: "NOPE" } },
    ]);
    assert.equal(suite.passed, 1);
    assert.equal(suite.failed, 1);
  } finally {
    store.close();
  }
});
