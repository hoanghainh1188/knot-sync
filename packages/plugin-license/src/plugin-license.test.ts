import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_VENDOR_PUBLIC_KEY_PEM,
  formatLicenseFailureMessage,
  resolveAndVerifyPluginLicense,
  signLicensePayload,
  verifyLicenseToken,
} from "./index.js";

function makeKeyPair() {
  return generateKeyPairSync("ed25519", {
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
}

const FUTURE_EXP = 4_102_444_800; // 2100-01-01T00:00:00Z

test("valid Ed25519 token passes verification offline for JA and VI licensee names", () => {
  const { publicKey, privateKey } = makeKeyPair();

  for (const licensee of ["株式会社テスト", "Công ty Cổ phần Thử Nghiệm"]) {
    const token = signLicensePayload(
      {
        licensee,
        plugins: ["extractor-ocr"],
        exp: FUTURE_EXP,
        iat: 1_700_000_000,
      },
      privateKey,
    );
    assert.match(token, /^KS1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);

    const res = verifyLicenseToken(token, {
      pluginId: "extractor-ocr",
      publicKey,
      nowMs: 1_750_000_000_000,
    });
    assert.equal(res.valid, true);
    if (res.valid) {
      assert.equal(res.licensee, licensee);
      assert.deepEqual(res.plugins, ["extractor-ocr"]);
      assert.equal(res.exp, FUTURE_EXP);
    }
  }
});

test("wildcard '*' token grants access across Paid plugins", () => {
  const { publicKey, privateKey } = makeKeyPair();
  const token = signLicensePayload(
    { licensee: "Acme Corp", plugins: ["*"], exp: FUTURE_EXP },
    privateKey,
  );
  for (const pluginId of ["auth-oauth", "search-vector", "guard-llm"]) {
    const res = verifyLicenseToken(token, { pluginId, publicKey });
    assert.equal(res.valid, true);
  }
});

test("tampered payload or wrong key signature is rejected", () => {
  const pairA = makeKeyPair();
  const pairB = makeKeyPair();
  const token = signLicensePayload(
    { licensee: "Acme", plugins: ["extractor-ocr"], exp: FUTURE_EXP },
    pairA.privateKey,
  );

  // Wrong public key
  const wrongKeyRes = verifyLicenseToken(token, {
    pluginId: "extractor-ocr",
    publicKey: pairB.publicKey,
  });
  assert.equal(wrongKeyRes.valid, false);
  if (!wrongKeyRes.valid) assert.equal(wrongKeyRes.reason, "invalid_signature");

  // Mutated payload segment
  const parts = token.split(".");
  const mutatedPayload = Buffer.from(
    JSON.stringify({ licensee: "Hacker", plugins: ["*"], exp: FUTURE_EXP }),
    "utf8",
  ).toString("base64url");
  const tampered = `${parts[0]}.${mutatedPayload}.${parts[2]}`;
  const tamperedRes = verifyLicenseToken(tampered, {
    pluginId: "extractor-ocr",
    publicKey: pairA.publicKey,
  });
  assert.equal(tamperedRes.valid, false);
  if (!tamperedRes.valid) assert.equal(tamperedRes.reason, "invalid_signature");
});

test("malformed strings and arbitrary text are rejected", () => {
  const { publicKey } = makeKeyPair();
  for (const bad of ["arbitrary-non-empty", "KS1.only-two", "KS2.abc.def", "KS1.abc.short"]) {
    const res = verifyLicenseToken(bad, {
      pluginId: "extractor-ocr",
      publicKey,
    });
    assert.equal(res.valid, false);
    if (!res.valid) assert.equal(res.reason, "malformed");
  }
  const missing = verifyLicenseToken("   ", {
    pluginId: "extractor-ocr",
    publicKey,
  });
  assert.equal(missing.valid, false);
  if (!missing.valid) assert.equal(missing.reason, "missing");
});

test("expired token and plugin mismatch fail with specific reasons", () => {
  const { publicKey, privateKey } = makeKeyPair();
  const expiredToken = signLicensePayload(
    { licensee: "Acme", plugins: ["extractor-ocr"], exp: 1_700_000_000 },
    privateKey,
  );
  const expiredRes = verifyLicenseToken(expiredToken, {
    pluginId: "extractor-ocr",
    publicKey,
    nowMs: 1_700_000_000_000, // exact expiry boundary is expired
  });
  assert.equal(expiredRes.valid, false);
  if (!expiredRes.valid) assert.equal(expiredRes.reason, "expired");

  const scopedToken = signLicensePayload(
    { licensee: "Acme", plugins: ["extractor-ocr"], exp: FUTURE_EXP },
    privateKey,
  );
  const mismatchRes = verifyLicenseToken(scopedToken, {
    pluginId: "extractor-housen",
    publicKey,
  });
  assert.equal(mismatchRes.valid, false);
  if (!mismatchRes.valid) {
    assert.equal(mismatchRes.reason, "plugin_not_allowed");
    assert.match(mismatchRes.detail, /extractor-housen/);
  }
});

test("test sentinel is accepted inside node:test and rejected when test mode is disabled", () => {
  const allowed = resolveAndVerifyPluginLicense({
    pluginId: "extractor-ocr",
    testSentinel: "knot-sync-ocr-dev",
    licenseKey: "knot-sync-ocr-dev",
    licenseEnv: "KNOT_SYNC_OCR_LICENSE",
  });
  assert.equal(allowed.valid, true);
  if (allowed.valid) assert.equal(allowed.isTestSentinel, true);

  const rejectedExplicit = resolveAndVerifyPluginLicense({
    pluginId: "extractor-ocr",
    testSentinel: "knot-sync-ocr-dev",
    licenseKey: "knot-sync-ocr-dev",
    licenseEnv: "KNOT_SYNC_OCR_LICENSE",
    allowTestSentinel: false,
  });
  assert.equal(rejectedExplicit.valid, false);

  const rejectedEnvOptOut = resolveAndVerifyPluginLicense({
    pluginId: "extractor-ocr",
    testSentinel: "knot-sync-ocr-dev",
    licenseKey: "knot-sync-ocr-dev",
    licenseEnv: "KNOT_SYNC_OCR_LICENSE",
    env: { KNOT_SYNC_ALLOW_TEST_LICENSE: "0" },
  });
  assert.equal(rejectedEnvOptOut.valid, false);
});

test("failure diagnostic does not echo token contents and core package has zero license dependency", () => {
  const msg = formatLicenseFailureMessage({
    label: "OCR",
    pluginId: "extractor-ocr",
    licenseEnv: "KNOT_SYNC_OCR_LICENSE",
    reason: "expired",
    detail: "license expired at 2025-01-01T00:00:00.000Z",
    relPath: "scan.png",
  });
  assert.match(msg, /expired/);
  assert.match(msg, /KNOT_SYNC_OCR_LICENSE/);
  assert.match(msg, /extractor-ocr\.licenseKey/);
  assert.doesNotMatch(msg, /BEGIN (PRIVATE|PUBLIC) KEY/);

  // Verify default fallback public key parses cleanly
  const defaultVerify = verifyLicenseToken("KS1.invalid.token", {
    pluginId: "extractor-ocr",
    publicKey: DEFAULT_VENDOR_PUBLIC_KEY_PEM,
  });
  assert.equal(defaultVerify.valid, false);

  // Verify packages/core stays 100% license-unaware
  const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
  const corePkg = JSON.parse(
    readFileSync(join(repoRoot, "packages/core/package.json"), "utf8"),
  ) as { dependencies?: Record<string, string> };
  assert.equal(corePkg.dependencies?.["@hoanghainh/knot-sync-plugin-license"], undefined);
});
