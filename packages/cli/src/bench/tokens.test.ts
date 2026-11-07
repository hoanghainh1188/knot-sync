import assert from "node:assert/strict";
import { documentId, sha256, type Document } from "@hoanghainh/knot-sync-core";
import { test } from "node:test";
import { aggregateTokens } from "./tokens.js";

function doc(meta: Record<string, string | number | boolean | null>): Document {
  return {
    id: documentId("s", "a"),
    sourceId: "s",
    type: "txt",
    title: "t",
    content: "c",
    tables: [],
    metadata: meta,
    pii: [],
    guard: [],
    hash: sha256("c"),
  };
}

test("aggregateTokens sums JP cleaned doc where before >= after", () => {
  const report = aggregateTokens([
    doc({ tokensBefore: 40, tokensAfter: 28 }),
    doc({ tokensBefore: 10, tokensAfter: 10 }),
    doc({ note: "no tokens" }),
  ]);
  assert.equal(report.documents, 2);
  assert.equal(report.skipped, 1);
  assert.equal(report.before, 50);
  assert.equal(report.after, 38);
  assert.equal(report.saved, 12);
  assert.ok(report.after <= report.before);
  assert.equal(report.reductionPct, 24);
});
