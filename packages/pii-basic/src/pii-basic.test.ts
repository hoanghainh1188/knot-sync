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
    guard: [],
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

test("mst-vn detects enterprise and branch tax codes", () => {
  const enterprise = collectFindings("MST: 0312345678", ALL_RULES);
  assert.ok(enterprise.some((f) => f.rule === "mst-vn"));
  const branch = collectFindings("Mã số thuế 0312345678-001", ALL_RULES);
  const hit = branch.find((f) => f.rule === "mst-vn");
  assert.ok(hit);
  assert.match("Mã số thuế 0312345678-001".slice(hit!.start, hit!.end), /0312345678/);
});

test("bank-account requires label; bare digits ignored", () => {
  assert.ok(
    collectFindings("Số tài khoản: 0123456789", ALL_RULES).some(
      (f) => f.rule === "bank-account",
    ),
  );
  assert.ok(
    collectFindings("口座番号: 1234567", ALL_RULES).every(
      (f) => f.rule !== "bank-account",
    ),
    "too short",
  );
  assert.ok(
    collectFindings("口座番号: 012345678901", ALL_RULES).some(
      (f) => f.rule === "bank-account",
    ),
  );
  assert.ok(
    collectFindings("order id 0123456789 only", ALL_RULES).every(
      (f) => f.rule !== "bank-account",
    ),
  );
});

test("mst-vn preferred over bank-account for labeled MST digits", () => {
  const text = "MST: 0312345678";
  const findings = collectFindings(text, ALL_RULES);
  assert.ok(findings.some((f) => f.rule === "mst-vn"));
  assert.ok(findings.every((f) => f.rule !== "bank-account"));
});

test("person-name matches labeled JP/VN names only", () => {
  const jp = collectFindings("氏名: 山田 太郎", ALL_RULES);
  assert.ok(jp.some((f) => f.rule === "person-name"));
  const vn = collectFindings("Họ tên: Nguyễn Văn An", ALL_RULES);
  assert.ok(vn.some((f) => f.rule === "person-name"));
  assert.ok(
    collectFindings("山田 went to the shop", ALL_RULES).every(
      (f) => f.rule !== "person-name",
    ),
  );
});

test("typed tokenFormat emits [PII:<RULE>] in mask mode and pii_<rule>_<hash> in hash mode", async () => {
  const root = await mkdtemp(join(tmpdir(), "pii-typed-"));
  try {
    const maskTypedCfg: PiiConfig = {
      mode: "mask",
      saltPath: join(root, "salt"),
      tokenFormat: "typed",
    };
    const sample = doc("氏名: 山田 太郎, CCCD: 079123456789, mail: a@b.co");
    const masked = applyPiiToDocument(sample, ALL_RULES, maskTypedCfg);
    assert.match(masked.content, /\[PII:PERSON_NAME\]/);
    assert.match(masked.content, /\[PII:CCCD\]/);
    assert.match(masked.content, /\[PII:EMAIL\]/);
    assert.doesNotMatch(masked.content, /山田|079123456789|a@b\.co/);

    const hashDefaultCfg: PiiConfig = {
      mode: "hash",
      saltPath: join(root, "salt"),
    };
    const hashed = applyPiiToDocument(sample, ALL_RULES, hashDefaultCfg);
    assert.match(hashed.content, /pii_person-name_[A-Za-z0-9_-]{16}/);
    assert.match(hashed.content, /pii_cccd_[A-Za-z0-9_-]{16}/);
    assert.match(hashed.content, /pii_email_[A-Za-z0-9_-]{16}/);

    const hashLegacyCfg: PiiConfig = {
      mode: "hash",
      saltPath: join(root, "salt"),
      tokenFormat: "legacy",
    };
    const hashedLegacy = applyPiiToDocument(doc("mail: a@b.co"), ALL_RULES, hashLegacyCfg);
    assert.match(hashedLegacy.content, /pii_[A-Za-z0-9_-]{16}/);
    assert.doesNotMatch(hashedLegacy.content, /pii_email_/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("pii.allowlist suppresses B2B Japanese company names and Vietnamese order prefixes", async () => {
  const root = await mkdtemp(join(tmpdir(), "pii-allowlist-"));
  try {
    const allowlist = ["佐藤工業株式会社", "ORD-"];
    const text = "取引先 / 氏名: 佐藤工業株式会社 | Mã đơn hàng: ORD-079123456789";

    assert.equal(textHasPii(text, ALL_RULES), true);
    assert.equal(textHasPii(text, ALL_RULES, allowlist), false);

    const cfg: PiiConfig = {
      mode: "mask",
      saltPath: join(root, "salt"),
      tokenFormat: "typed",
      allowlist,
    };
    const out = applyPiiToDocument(doc(text), ALL_RULES, cfg);
    assert.equal(out.pii.length, 0);
    assert.equal(out.content, text);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
