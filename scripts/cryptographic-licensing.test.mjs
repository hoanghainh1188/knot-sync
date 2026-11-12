import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const licenseTool = join(root, "scripts/license-tool.mjs");
const bundlePaidScript = join(root, "scripts/bundle-paid-plugins.mjs");

const PAID_PLUGIN_VALIDATORS = [
  { dir: "auth-oauth", fn: "isValidOauthLicense", sentinel: "knot-sync-oauth-dev" },
  { dir: "catalog-llm", fn: "isValidCatalogLlmLicense", sentinel: "knot-sync-catalog-llm-dev" },
  {
    dir: "connector-sql-enterprise",
    fn: "isValidEnterpriseSqlLicense",
    sentinel: "knot-sync-sql-enterprise-dev",
  },
  { dir: "extractor-housen", fn: "isValidHousenLicense", sentinel: "knot-sync-housen-dev" },
  { dir: "extractor-ocr", fn: "isValidOcrLicense", sentinel: "knot-sync-ocr-dev" },
  { dir: "guard-llm", fn: "isValidGuardLlmLicense", sentinel: "knot-sync-guard-llm-dev" },
  { dir: "search-vector", fn: "isValidSearchVectorLicense", sentinel: "knot-sync-search-vector-dev" },
];

function productionEnv() {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  delete env.KNOT_SYNC_ALLOW_TEST_LICENSE;
  return env;
}

test("license-tool.mjs keygen, sign, verify offline round-trip with JA/VI licensee and expiry checks", () => {
  const workDir = mkdtempSync(join(tmpdir(), "ks-lic-tool-"));
  try {
    const keyOut = execFileSync(
      process.execPath,
      [licenseTool, "keygen", "--out", workDir],
      { encoding: "utf8" },
    );
    const { privateKeyPath, publicKeyPath } = JSON.parse(keyOut);
    assert.ok(existsSync(privateKeyPath));
    assert.ok(existsSync(publicKeyPath));

    const licensee = "Công ty Việt-Nhật / 株式会社テスト";
    const token = execFileSync(
      process.execPath,
      [
        licenseTool,
        "sign",
        "--private-key",
        privateKeyPath,
        "--licensee",
        licensee,
        "--plugins",
        "extractor-ocr,extractor-housen",
        "--days",
        "30",
      ],
      { encoding: "utf8" },
    ).trim();
    assert.match(token, /^KS1\./);

    const verifyOut = execFileSync(
      process.execPath,
      [
        licenseTool,
        "verify",
        "--public-key",
        publicKeyPath,
        "--token",
        token,
        "--plugin",
        "extractor-ocr",
      ],
      { encoding: "utf8" },
    );
    const decoded = JSON.parse(verifyOut);
    assert.equal(decoded.valid, true);
    assert.equal(decoded.licensee, licensee);

    // Plugin mismatch exits non-zero.
    assert.throws(
      () =>
        execFileSync(
          process.execPath,
          [
            licenseTool,
            "verify",
            "--public-key",
            publicKeyPath,
            "--token",
            token,
            "--plugin",
            "auth-oauth",
          ],
          { encoding: "utf8", stdio: "pipe" },
        ),
      (err) => err && /plugin_not_allowed/.test(String(err.stderr ?? "")),
    );

    // Past exp fails verification.
    const expiredToken = execFileSync(
      process.execPath,
      [
        licenseTool,
        "sign",
        "--private-key",
        privateKeyPath,
        "--licensee",
        licensee,
        "--plugins",
        "*",
        "--exp",
        "1700000000",
      ],
      { encoding: "utf8" },
    ).trim();
    assert.throws(
      () =>
        execFileSync(
          process.execPath,
          [licenseTool, "verify", "--public-key", publicKeyPath, "--token", expiredToken],
          { encoding: "utf8", stdio: "pipe" },
        ),
      (err) => err && /expired/.test(String(err.stderr ?? "")),
    );
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
});

test("bundle-paid-plugins.mjs builds standalone bundles with injected key that pass in production subprocesses", () => {
  const workDir = mkdtempSync(join(tmpdir(), "ks-paid-bundle-"));
  const keysDir = join(workDir, "keys");
  const outDir = join(workDir, "dist-paid");
  try {
    const keyOut = execFileSync(
      process.execPath,
      [licenseTool, "keygen", "--out", keysDir],
      { encoding: "utf8" },
    );
    const { privateKeyPath, publicKeyPath } = JSON.parse(keyOut);

    const wildcardToken = execFileSync(
      process.execPath,
      [
        licenseTool,
        "sign",
        "--private-key",
        privateKeyPath,
        "--licensee",
        "Enterprise Bundle Test Co.",
        "--plugins",
        "*",
        "--days",
        "365",
      ],
      { encoding: "utf8" },
    ).trim();

    execFileSync(
      process.execPath,
      [bundlePaidScript, "--out-dir", outDir, "--public-key", publicKeyPath, "--pack"],
      { encoding: "utf8" },
    );

    const prodEnv = productionEnv();
    for (const item of PAID_PLUGIN_VALIDATORS) {
      const bundleDir = join(outDir, item.dir);
      const bundleEntry = join(bundleDir, "index.mjs");
      assert.ok(existsSync(bundleEntry), `missing ${bundleEntry}`);
      assert.ok(existsSync(join(bundleDir, "package.json")));
      const tgzFiles = readdirSync(bundleDir).filter((f) => f.endsWith(".tgz"));
      assert.equal(tgzFiles.length, 1, `expected .tgz tarball for ${item.dir}`);

      // Execute bundled ESM directly in clean production process (no NODE_TEST_CONTEXT).
      const checkScript = `
        import * as mod from ${JSON.stringify(pathToFileURL(bundleEntry).href)};
        if (mod.default?.apiVersion !== 1) throw new Error("missing default plugin export");
        if (mod[${JSON.stringify(item.fn)}](${JSON.stringify(item.sentinel)}) !== false) {
          throw new Error("test sentinel leaked into production bundle");
        }
        if (mod[${JSON.stringify(item.fn)}]("plain-string") !== false) {
          throw new Error("plain string accepted");
        }
        if (mod[${JSON.stringify(item.fn)}](${JSON.stringify(wildcardToken)}) !== true) {
          throw new Error("signed KS1 token rejected by bundled plugin");
        }
      `;
      execFileSync(process.execPath, ["--input-type=module", "-e", checkScript], {
        env: prodEnv,
        encoding: "utf8",
      });
    }
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
});

test("bundle:cli excludes @hoanghainh/knot-sync-plugin-license and Paid plugin markers", () => {
  execFileSync("node", [join(root, "scripts/bundle-cli.mjs")], {
    cwd: root,
    encoding: "utf8",
  });
  const cliBundle = readFileSync(join(root, "packages/cli/dist/bin.js"), "utf8");
  assert.doesNotMatch(cliBundle, /DEFAULT_VENDOR_PUBLIC_KEY_PEM/);
  assert.doesNotMatch(cliBundle, /verifyLicenseToken/);
  assert.doesNotMatch(cliBundle, /knot-sync-plugin-license/);
});
