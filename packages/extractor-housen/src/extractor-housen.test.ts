import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  ConfigError,
  createPluginHost,
  loadPlugins,
  type FileEntry,
} from "@hoanghainh/knot-sync-core";
import {
  HOUSEN_EXTRACTOR_ID,
  HOUSEN_PLUGIN_NAME,
  HOUSEN_TEST_LICENSE_SENTINEL,
  NOT_FORM_CODE,
  buildDenseTableXlsx,
  buildFormXlsx,
  createHousenPlugin,
  parseHousenSettings,
  scoreFormLikeness,
  worksheetToGrid,
} from "./index.js";
import ExcelJS from "exceljs";

function entry(
  root: string,
  rel: string,
  size = 1000,
): FileEntry {
  return {
    sourceId: "s",
    absPath: join(root, rel),
    relPath: rel,
    ext: ".xlsx",
    type: "xlsx",
    size,
    mtimeMs: Date.now(),
    hash: "h1",
  };
}

test("parseHousenSettings rejects unknown keys and bad timeouts/thresholds", () => {
  assert.throws(
    () => parseHousenSettings({ cloudUrl: "x" }),
    (err: unknown) => err instanceof ConfigError && /Unknown key "cloudUrl"/.test(err.message),
  );
  assert.throws(
    () => parseHousenSettings({ timeoutSeconds: 0 }),
    ConfigError,
  );
  assert.throws(
    () => parseHousenSettings({ formThreshold: 1.5 }),
    ConfigError,
  );
  const ok = parseHousenSettings({
    formThreshold: 0.5,
    licenseKey: HOUSEN_TEST_LICENSE_SENTINEL,
  });
  assert.equal(ok.formThreshold, 0.5);
});

test("plugin registers housen-xlsx only when loaded", async () => {
  const without = await loadPlugins({ builtins: [], entries: [], baseDir: process.cwd() });
  assert.equal(without.extractors.has(HOUSEN_EXTRACTOR_ID), false);

  const host = createPluginHost();
  host.registerPlugin(
    createHousenPlugin({
      settings: { licenseKey: HOUSEN_TEST_LICENSE_SENTINEL },
      env: {},
    }),
  );
  assert.equal(host.loaded[0]?.name, HOUSEN_PLUGIN_NAME);
  assert.ok(host.extractors.get(HOUSEN_EXTRACTOR_ID)?.extensions.includes(".xlsx"));
});

test("LICENSE soft-fail names JP path; sentinel allows extract", async () => {
  const root = await mkdtemp(join(tmpdir(), "knot-housen-lic-"));
  const rel = join("申請", "休暇届.xlsx");
  await mkdir(join(root, "申請"), { recursive: true });
  await writeFile(join(root, rel), await buildFormXlsx());
  const file = entry(root, rel);

  const missing = createPluginHost();
  missing.registerPlugin(createHousenPlugin({ settings: {}, env: {} }));
  const miss = await missing.extractors.get(HOUSEN_EXTRACTOR_ID)!.extract(file);
  assert.equal(miss.ok, false);
  if (!miss.ok) {
    assert.equal(miss.code, "LICENSE");
    assert.match(miss.message, /申請[/\\]休暇届\.xlsx/);
    assert.match(miss.message, /KNOT_SYNC_HOUSEN_LICENSE/);
  }

  const okHost = createPluginHost();
  okHost.registerPlugin(
    createHousenPlugin({
      settings: { licenseKey: HOUSEN_TEST_LICENSE_SENTINEL },
      env: {},
    }),
  );
  const ok = await okHost.extractors.get(HOUSEN_EXTRACTOR_ID)!.extract(file);
  assert.equal(ok.ok, true, ok.ok ? "" : `${ok.code}: ${ok.message}`);
  if (ok.ok) {
    assert.match(ok.document.content, /氏名/);
    assert.match(ok.document.content, /山田太郎/);
    assert.match(ok.document.content, /請求日/);
  }
});

test("form fixture scores above threshold; dense table below", async () => {
  const root = await mkdtemp(join(tmpdir(), "knot-housen-score-"));
  const formPath = join(root, "form.xlsx");
  const tablePath = join(root, "table.xlsx");
  await writeFile(formPath, await buildFormXlsx());
  await writeFile(tablePath, await buildDenseTableXlsx());

  const formWb = new ExcelJS.Workbook();
  await formWb.xlsx.readFile(formPath);
  const tableWb = new ExcelJS.Workbook();
  await tableWb.xlsx.readFile(tablePath);

  const formScore = scoreFormLikeness(worksheetToGrid(formWb.worksheets[0]!));
  const tableScore = scoreFormLikeness(worksheetToGrid(tableWb.worksheets[0]!));
  assert.ok(formScore.score >= 0.42, `form score ${formScore.score}`);
  assert.ok(tableScore.score < 0.42, `table score ${tableScore.score}`);
  assert.ok(formScore.labelValuePairs >= 3);
});

test("structured emit includes 氏名/請求日; source unchanged", async () => {
  const root = await mkdtemp(join(tmpdir(), "knot-housen-emit-"));
  const rel = "form.xlsx";
  const abs = join(root, rel);
  const buf = await buildFormXlsx();
  await writeFile(abs, buf);
  const before = await readFile(abs);

  const host = createPluginHost();
  host.registerPlugin(
    createHousenPlugin({
      settings: { licenseKey: HOUSEN_TEST_LICENSE_SENTINEL },
      env: {},
    }),
  );
  const result = await host.extractors.get(HOUSEN_EXTRACTOR_ID)!.extract(entry(root, rel));
  assert.equal(result.ok, true, result.ok ? "" : `${result.code}: ${result.message}`);
  if (result.ok) {
    assert.match(result.document.content, /\*\*氏名\*\*.*山田太郎/);
    assert.match(result.document.content, /請求日/);
    assert.equal(result.document.metadata.extractor, HOUSEN_EXTRACTOR_ID);
    assert.ok(result.document.tables.length >= 1);
  }
  assert.deepEqual(await readFile(abs), before);
});

test("dense table returns NOT_FORM", async () => {
  const root = await mkdtemp(join(tmpdir(), "knot-housen-table-"));
  await writeFile(join(root, "t.xlsx"), await buildDenseTableXlsx());
  const host = createPluginHost();
  host.registerPlugin(
    createHousenPlugin({
      settings: { licenseKey: HOUSEN_TEST_LICENSE_SENTINEL },
      env: {},
    }),
  );
  const result = await host.extractors
    .get(HOUSEN_EXTRACTOR_ID)!
    .extract(entry(root, "t.xlsx"));
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, NOT_FORM_CODE);
});

test("oversized and aborted soft-fail", async () => {
  const root = await mkdtemp(join(tmpdir(), "knot-housen-size-"));
  await writeFile(join(root, "big.xlsx"), await buildFormXlsx());
  const host = createPluginHost();
  host.registerPlugin(
    createHousenPlugin({
      settings: { licenseKey: HOUSEN_TEST_LICENSE_SENTINEL, maxInputMb: 0.000001 },
      env: {},
    }),
  );
  const oversized = await host.extractors
    .get(HOUSEN_EXTRACTOR_ID)!
    .extract(entry(root, "big.xlsx", 10_000_000));
  assert.equal(oversized.ok, false);
  if (!oversized.ok) assert.equal(oversized.code, "SKIPPED_TOO_LARGE");

  const timedHost = createPluginHost();
  timedHost.registerPlugin(
    createHousenPlugin({
      settings: { licenseKey: HOUSEN_TEST_LICENSE_SENTINEL },
      env: {},
    }),
  );
  const timed = await timedHost.extractors
    .get(HOUSEN_EXTRACTOR_ID)!
    .extract(entry(root, "big.xlsx"), { signal: AbortSignal.abort() });
  assert.equal(timed.ok, false);
  if (!timed.ok) assert.equal(timed.code, "EXTRACT_TIMEOUT");
});

test("Ed25519 KS1 license enforcement and production sentinel gating", async () => {
  const { generateKeyPairSync } = await import("node:crypto");
  const { signLicensePayload } = await import("@hoanghainh/knot-sync-plugin-license");
  const {
    HOUSEN_PLUGIN_NAME,
    HOUSEN_TEST_LICENSE_SENTINEL,
    checkHousenLicense,
    isValidHousenLicense,
    parseHousenSettings,
  } = await import("./index.js");

  const { publicKey, privateKey } = generateKeyPairSync("ed25519", {
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });

  assert.equal(isValidHousenLicense("arbitrary-string", process.env, { publicKey }), false);
  assert.equal(isValidHousenLicense(HOUSEN_TEST_LICENSE_SENTINEL, process.env, { publicKey }), true);
  assert.equal(
    isValidHousenLicense(HOUSEN_TEST_LICENSE_SENTINEL, { KNOT_SYNC_ALLOW_TEST_LICENSE: "0" }, { publicKey }),
    false,
  );

  const validToken = signLicensePayload(
    { licensee: "株式会社方眼", plugins: [HOUSEN_PLUGIN_NAME], exp: 4_102_444_800 },
    privateKey,
  );
  assert.equal(
    checkHousenLicense(parseHousenSettings({ licenseKey: validToken }), "form.xlsx", {}, { publicKey }),
    undefined,
  );

  const expiredToken = signLicensePayload(
    { licensee: "株式会社方眼", plugins: [HOUSEN_PLUGIN_NAME], exp: 1_700_000_000 },
    privateKey,
  );
  const expFail = checkHousenLicense(
    parseHousenSettings({ licenseKey: expiredToken }),
    "form.xlsx",
    {},
    { publicKey },
  );
  assert.ok(expFail && !expFail.ok && expFail.code === "LICENSE");
  assert.match(expFail.message, /expired/i);

  const wrongPluginToken = signLicensePayload(
    { licensee: "株式会社方眼", plugins: ["extractor-ocr"], exp: 4_102_444_800 },
    privateKey,
  );
  const wrongFail = checkHousenLicense(
    parseHousenSettings({ licenseKey: wrongPluginToken }),
    "form.xlsx",
    {},
    { publicKey },
  );
  assert.ok(wrongFail && !wrongFail.ok && wrongFail.code === "LICENSE");
  assert.match(wrongFail.message, /plugin_not_allowed/);
});
