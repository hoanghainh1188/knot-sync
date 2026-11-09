import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const cliDir = join(repoRoot, "packages/cli");

test("bundle:cli produces runnable bin and copies UI static", () => {
  const bundle = spawnSync("pnpm", ["bundle:cli"], {
    cwd: repoRoot,
    encoding: "utf8",
    shell: false,
  });
  assert.equal(bundle.status, 0, bundle.stderr || bundle.stdout);
  assert.ok(existsSync(join(cliDir, "dist/bin.js")));
  assert.ok(existsSync(join(cliDir, "static/index.html")));

  const run = spawnSync(process.execPath, [join(cliDir, "dist/bin.js"), "--version"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout.trim(), /^0\.1\.0$/);
});

test("pnpm pack:cli tarball has registry-safe package.json and required files", async () => {
  const pack = spawnSync("pnpm", ["pack:cli"], {
    cwd: repoRoot,
    encoding: "utf8",
    shell: false,
  });
  assert.equal(pack.status, 0, pack.stderr || pack.stdout);

  const tgz = join(cliDir, "hoanghainh-knot-sync-0.1.0.tgz");
  assert.ok(existsSync(tgz), `missing ${tgz}\n${pack.stdout}\n${pack.stderr}`);

  const dir = await mkdtemp(join(tmpdir(), "knot-pack-"));
  try {
    const extract = spawnSync("tar", ["-xzf", tgz, "-C", dir], { encoding: "utf8" });
    assert.equal(extract.status, 0, extract.stderr);

    const pkgRoot = join(dir, "package");
    const pkg = JSON.parse(await readFile(join(pkgRoot, "package.json"), "utf8")) as {
      name: string;
      dependencies?: Record<string, string>;
    };
    assert.equal(pkg.name, "@hoanghainh/knot-sync");
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
