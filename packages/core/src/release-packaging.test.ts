import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const packagesDir = join(repoRoot, "packages");

function packageDirs(): string[] {
  return readdirSync(packagesDir).filter((d) =>
    existsSync(join(packagesDir, d, "package.json")),
  );
}

test("every package is 0.1.0 with README and LICENSE in files", () => {
  for (const dir of packageDirs()) {
    const pkgPath = join(packagesDir, dir, "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
      version: string;
      files?: string[];
    };
    assert.equal(pkg.version, "0.1.0", `${dir} version`);
    assert.ok(existsSync(join(packagesDir, dir, "README.md")), `${dir} README`);
    assert.ok(existsSync(join(packagesDir, dir, "LICENSE")), `${dir} LICENSE`);
    const files = pkg.files ?? [];
    assert.ok(files.includes("README.md"), `${dir} files README`);
    assert.ok(files.includes("LICENSE"), `${dir} files LICENSE`);
  }
});

test("CHANGELOG 0.1.0 mentions describe / Semantic Catalog", () => {
  const text = readFileSync(join(repoRoot, "CHANGELOG.md"), "utf8");
  assert.match(text, /0\.1\.0/);
  assert.match(text, /Semantic Catalog|describe/i);
});

test("docs/ja and docs/vi cover read-only and commands", () => {
  const ja = readFileSync(join(repoRoot, "docs/ja/README.md"), "utf8");
  assert.match(ja, /読み取り専用/);
  assert.match(ja, /serve/);
  assert.match(ja, /describe/);

  const vi = readFileSync(join(repoRoot, "docs/vi/README.md"), "utf8");
  assert.match(vi, /không ghi đè|không sửa/i);
  assert.match(vi, /scan/);
  assert.match(vi, /serve/);
});

test("CI workflow matrix includes Node 22/24 and three OSes", () => {
  const yml = readFileSync(join(repoRoot, ".github/workflows/ci.yml"), "utf8");
  assert.match(yml, /node:\s*\[22,\s*24\]/);
  assert.match(yml, /ubuntu-latest/);
  assert.match(yml, /macos-latest/);
  assert.match(yml, /windows-latest/);
  assert.match(yml, /pnpm test/);
});

test("publish workflow is tag-triggered with provenance", () => {
  const yml = readFileSync(join(repoRoot, ".github/workflows/publish.yml"), "utf8");
  assert.match(yml, /tags:/);
  assert.match(yml, /v\*/);
  assert.match(yml, /provenance|NPM_CONFIG_PROVENANCE|id-token:\s*write/i);
  assert.match(yml, /pnpm -r publish|pnpm publish/);
});

test("root README links ja/vi docs and documents npx verification", () => {
  const readme = readFileSync(join(repoRoot, "README.md"), "utf8");
  assert.match(readme, /docs\/ja/);
  assert.match(readme, /docs\/vi/);
  assert.match(readme, /npx @hoanghainh\/knot-sync/);
});
