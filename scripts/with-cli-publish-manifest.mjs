#!/usr/bin/env node
/**
 * Temporarily rewrite packages/cli/package.json for npm pack/publish:
 * - dependencies = publish-dependencies.json (no workspace:*)
 * - files = bundled bin + static + docs only
 * Restores the original package.json afterwards (even on failure).
 *
 * Usage: node scripts/with-cli-publish-manifest.mjs <command> [args...]
 * Commands run with cwd = packages/cli.
 */
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cliDir = join(root, "packages/cli");
const pkgPath = join(cliDir, "package.json");
const depsPath = join(cliDir, "publish-dependencies.json");
const lockDir = join(tmpdir(), "knot-sync-cli-manifest.lock");

/** Acquire a cross-process lock so parallel test workers (e.g. Docker build) never read the temporary publish manifest. */
function acquireManifestLock() {
  const deadline = Date.now() + 180_000;
  const sleepBuf = new Int32Array(new SharedArrayBuffer(4));
  while (true) {
    try {
      mkdirSync(lockDir);
      return;
    } catch (err) {
      if (err && err.code !== "EEXIST") throw err;
      try {
        if (Date.now() - statSync(lockDir).mtimeMs > 300_000) {
          rmSync(lockDir, { recursive: true, force: true });
          continue;
        }
      } catch {
        continue;
      }
      if (Date.now() >= deadline) {
        throw new Error(`Timed out waiting for manifest lock at ${lockDir}`);
      }
      Atomics.wait(sleepBuf, 0, 0, 50);
    }
  }
}

acquireManifestLock();
let status = 1;
const original = readFileSync(pkgPath, "utf8");
try {
  const pkg = JSON.parse(original);
  const publishDeps = JSON.parse(readFileSync(depsPath, "utf8"));

  pkg.dependencies = publishDeps;
  delete pkg.devDependencies;
  delete pkg.scripts;
  pkg.files = [
    "dist/bin.js",
    "dist/bin.js.map",
    "static",
    "README.md",
    "LICENSE",
  ];
  // npm publish strips/rejects "./" bin paths ("script name … invalid and removed").
  pkg.main = "dist/bin.js";
  delete pkg.types;
  pkg.bin = { "knot-sync": "dist/bin.js" };

  // Ensure npm packs the product README even if bundle was skipped.
  cpSync(join(root, "README.md"), join(cliDir, "README.md"));

  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);

  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error("Usage: node scripts/with-cli-publish-manifest.mjs <cmd> [args...]");
    status = 2;
  } else {
    // Windows needs shell so npm.cmd / pnpm.cmd resolve (spawnSync npm → ENOENT).
    const result = spawnSync(args[0], args.slice(1), {
      stdio: "inherit",
      shell: process.platform === "win32",
      cwd: cliDir,
      env: process.env,
    });
    if (result.error) {
      process.stderr.write(`Failed to spawn "${args[0]}": ${result.error.message}\n`);
    }
    status = result.status ?? 1;
  }
} finally {
  try {
    writeFileSync(pkgPath, original);
  } catch (err) {
    process.stderr.write(
      `\nFATAL: could not restore packages/cli/package.json: ${err}\n` +
        `Run: git checkout -- packages/cli/package.json\n`,
    );
  }
  rmSync(lockDir, { recursive: true, force: true });
}

process.exit(status);
