import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const cliDir = join(repoRoot, "packages/cli");
const bundleScript = join(repoRoot, "scripts/bundle-cli.mjs");
const packScript = join(repoRoot, "scripts/with-cli-publish-manifest.mjs");
const cliVersion = (
  JSON.parse(readFileSync(join(cliDir, "package.json"), "utf8")) as { version: string }
).version;

/**
 * Run pack helpers without `pnpm bundle:cli` (that re-runs `pnpm build` /
 * Vite `emptyOutDir` and races parallel UI tests that read packages/ui/static).
 * Assumes `pnpm test` already ran `pnpm build`.
 */
function runNode(script: string, args: string[] = []) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    env: process.env,
  });
}

test("bundle:cli produces runnable bin and copies UI static", () => {
  const bundle = runNode(bundleScript);
  assert.equal(bundle.status, 0, bundle.stderr || bundle.stdout);
  const binPath = join(cliDir, "dist/bin.js");
  assert.ok(existsSync(binPath));
  assert.ok(existsSync(join(cliDir, "static/index.html")));
  // Executable bit so npm keeps bin mapping (0644 triggers "invalid and removed").
  // Windows/NTFS does not surface Unix execute bits via fs.stat mode.
  if (process.platform !== "win32") {
    assert.equal(statSync(binPath).mode & 0o111, 0o111);
  }

  const run = spawnSync(process.execPath, [binPath, "--version"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stdout.trim(), cliVersion);
});

test("pnpm pack:cli tarball has registry-safe package.json and required files", async () => {
  const bundle = runNode(bundleScript);
  assert.equal(bundle.status, 0, bundle.stderr || bundle.stdout);

  const pack = runNode(packScript, ["npm", "pack"]);
  assert.equal(pack.status, 0, pack.stderr || pack.stdout);

  const tgz = join(cliDir, `hoanghainh-knot-sync-${cliVersion}.tgz`);
  assert.ok(existsSync(tgz), `missing ${tgz}\n${pack.stdout}\n${pack.stderr}`);

  const dir = await mkdtemp(join(tmpdir(), "knot-pack-"));
  try {
    const extract = spawnSync("tar", ["-xzf", tgz, "-C", dir], { encoding: "utf8" });
    assert.equal(extract.status, 0, extract.stderr);

    const pkgRoot = join(dir, "package");
    const pkg = JSON.parse(await readFile(join(pkgRoot, "package.json"), "utf8")) as {
      name: string;
      version: string;
      main?: string;
      bin?: Record<string, string>;
      dependencies?: Record<string, string>;
    };
    assert.equal(pkg.name, "@hoanghainh/knot-sync");
    assert.equal(pkg.version, cliVersion);
    // No "./" prefix — npm publish treats "./dist/bin.js" as invalid and drops bin.
    assert.equal(pkg.bin?.["knot-sync"], "dist/bin.js");
    assert.equal(pkg.main, "dist/bin.js");
    for (const [name, range] of Object.entries(pkg.dependencies ?? {})) {
      assert.doesNotMatch(name, /^@hoanghainh\/knot-sync-/);
      assert.doesNotMatch(range, /^workspace:/);
    }
    assert.ok(pkg.dependencies?.yaml);
    assert.ok(pkg.dependencies?.["@modelcontextprotocol/sdk"]);

    assert.ok(existsSync(join(pkgRoot, "dist/bin.js")));
    assert.ok(existsSync(join(pkgRoot, "static/index.html")));
    assert.ok(existsSync(join(pkgRoot, "LICENSE")));
    assert.ok(existsSync(join(pkgRoot, "README.md")));
    assert.equal(existsSync(join(pkgRoot, "dist/main.js")), false);
  } finally {
    await rm(dir, { recursive: true, force: true });
    await rm(tgz, { force: true });
  }
});
