import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  documentId,
  sha256,
  type Document,
  type PiiConfig,
} from "@hoanghainh/knot-sync-core";
import {
  ALL_RULES,
  applyPiiToDocument,
  collectFindings,
  isValidMyNumber,
  luhnOk,
  makeValidMyNumber,
  textHasPii,
} from "./index.js";

function doc(content: string): Document {
  return {
    id: documentId("s", "a.txt"),
    sourceId: "s",
    type: "txt",
    title: "a.txt",
    content,
    tables: [],
    metadata: {},
    pii: [],
    hash: sha256(content),
  };
}

test("email phone jp/vn cccd my-number credit-card", () => {
  const my = makeValidMyNumber("12345678901");
  assert.equal(isValidMyNumber(my), true);
  assert.equal(isValidMyNumber("123456789012"), false);

  const text = [
    "mail user@example.com",
    "JP 03-1234-5678",
    "VN 0912345678",
    `CCCD 079123456789`,
    `MN ${my}`,
    "CC 4111 1111 1111 1111",
  ].join("\n");

  const findings = collectFindings(text, ALL_RULES);
  const rules = new Set(findings.map((f) => f.rule));
  assert.ok(rules.has("email"));
  assert.ok(rules.has("phone-jp"));
  assert.ok(rules.has("phone-vn"));
  assert.ok(rules.has("cccd"));
  assert.ok(rules.has("my-number"));
  assert.ok(rules.has("credit-card"));
  assert.ok(luhnOk("4111111111111111"));
});

test("mask removes unmasked values; findings keep positions", async () => {
  const root = await mkdtemp(join(tmpdir(), "pii-"));
  try {
    const cfg: PiiConfig = { mode: "mask", saltPath: join(root, "salt") };
    const email = "secret@example.com";
    const before = doc(`contact ${email} end`);
    const out = applyPiiToDocument(before, ALL_RULES, cfg);
    assert.doesNotMatch(out.content, /secret@example.com/);
    assert.match(out.content, /\*\*\*/);
    assert.equal(out.pii.length, 1);
    assert.equal(out.pii[0]?.rule, "email");
    assert.equal(before.content.slice(out.pii[0]!.start, out.pii[0]!.end), email);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("hash is stable for same install salt", async () => {
  const root = await mkdtemp(join(tmpdir(), "pii-hash-"));
  try {
    const cfg: PiiConfig = { mode: "hash", saltPath: join(root, "salt") };
    const a = applyPiiToDocument(doc("a@b.co"), ALL_RULES, cfg);
    const b = applyPiiToDocument(doc("a@b.co"), ALL_RULES, cfg);
    assert.equal(a.content, b.content);
    assert.match(a.content, /pii_/);
    assert.doesNotMatch(a.content, /a@b\.co/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("drop removes span", async () => {
  const root = await mkdtemp(join(tmpdir(), "pii-drop-"));
  try {
    const cfg: PiiConfig = { mode: "drop", saltPath: join(root, "salt") };
    const out = applyPiiToDocument(doc("x a@b.co y"), ALL_RULES, cfg);
    assert.doesNotMatch(out.content, /a@b\.co/);
    assert.doesNotMatch(out.content, /pii_/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("drop keeps offsets valid across multiple spans", async () => {
  const root = await mkdtemp(join(tmpdir(), "pii-drop-multi-"));
  try {
    const cfg: PiiConfig = { mode: "drop", saltPath: join(root, "salt") };
    const out = applyPiiToDocument(
      doc("a  b foo@x.com and bar@y.com end"),
      ALL_RULES,
      cfg,
    );
    assert.doesNotMatch(out.content, /foo@x\.com|bar@y\.com|@/);
    assert.match(out.content, /a b .+ end/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("masks originalContent metadata copies", async () => {
  const root = await mkdtemp(join(tmpdir(), "pii-meta-"));
  try {
    const cfg: PiiConfig = { mode: "mask", saltPath: join(root, "salt") };
    const before = doc("clean contact ***");
    before.content = "contact secret@example.com";
    before.metadata = { originalContent: "raw secret@example.com copy" };
    const out = applyPiiToDocument(before, ALL_RULES, cfg);
    assert.doesNotMatch(out.content, /secret@example.com/);
    assert.doesNotMatch(String(out.metadata.originalContent), /secret@example.com/);
    assert.match(String(out.metadata.originalContent), /\*\*\*/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("credit-card finds Luhn window inside longer digit run", () => {
  const text = "card 4111 1111 1111 1111 123";
  const findings = collectFindings(text, ALL_RULES);
  const card = findings.find((f) => f.rule === "credit-card");
  assert.ok(card);
  assert.equal(text.slice(card!.start, card!.end).replace(/\D/g, ""), "4111111111111111");
});

test("phone-vn ignores digit runs inside SKUs", () => {
  assert.equal(textHasPii("SKU 4000100200300", ALL_RULES), false);
});

test("textHasPii for scan sampling", () => {
  assert.equal(textHasPii("hello", ALL_RULES), false);
  assert.equal(textHasPii("mail me@x.co", ALL_RULES), true);
});
