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

test("only CLI is public; internals are private with README/LICENSE", () => {
  for (const dir of packageDirs()) {
    const pkgPath = join(packagesDir, dir, "package.json");
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
      name: string;
      version: string;
      private?: boolean;
      files?: string[];
    };
    assert.ok(existsSync(join(packagesDir, dir, "README.md")), `${dir} README`);
    assert.ok(existsSync(join(packagesDir, dir, "LICENSE")), `${dir} LICENSE`);
    const files = pkg.files ?? [];
    assert.ok(files.includes("README.md"), `${dir} files README`);
    assert.ok(files.includes("LICENSE"), `${dir} files LICENSE`);

    if (pkg.name === "@hoanghainh/knot-sync") {
      assert.equal(pkg.version, "0.2.0", "CLI publishable version");
      assert.notEqual(pkg.private, true, "CLI must be publishable");
    } else {
      assert.equal(pkg.private, true, `${dir} must be private`);
    }
  }
});

test("CLI publish-dependencies.json has no workspace protocol", () => {
  const deps = JSON.parse(
    readFileSync(join(packagesDir, "cli", "publish-dependencies.json"), "utf8"),
  ) as Record<string, string>;
  for (const [name, range] of Object.entries(deps)) {
    assert.doesNotMatch(name, /^@hoanghainh\/knot-sync-/);
    assert.doesNotMatch(range, /^workspace:/);
  }
  assert.ok(deps.yaml);
  assert.ok(deps["@modelcontextprotocol/sdk"]);
});

test("CHANGELOG 0.1.0 mentions describe / Semantic Catalog", () => {
  const text = readFileSync(join(repoRoot, "CHANGELOG.md"), "utf8");
  assert.match(text, /0\.1\.0/);
  assert.match(text, /Semantic Catalog|describe/i);
});

test("docs/ja and docs/vi cover read-only, commands, and Paid not on npm", () => {
  const ja = readFileSync(join(repoRoot, "docs/ja/README.md"), "utf8");
  assert.match(ja, /読み取り専用/);
  assert.match(ja, /serve/);
  assert.match(ja, /describe/);
  assert.match(ja, /npm 上の別パッケージとしては公開されません/);
  assert.match(ja, /plugins:/);
  assert.match(ja, /ライセンス環境変数/);

  const vi = readFileSync(join(repoRoot, "docs/vi/README.md"), "utf8");
  assert.match(vi, /không ghi đè|không sửa/i);
  assert.match(vi, /scan/);
  assert.match(vi, /serve/);
  assert.match(vi, /không phải gói npm riêng/i);
  assert.match(vi, /plugins:/);
  assert.match(vi, /biến môi trường license/i);
});

test("CI workflow matrix includes Node 22/24 and three OSes", () => {
  const yml = readFileSync(join(repoRoot, ".github/workflows/ci.yml"), "utf8");
  assert.match(yml, /node:\s*\[22,\s*24\]/);
  assert.match(yml, /ubuntu-latest/);
  assert.match(yml, /macos-latest/);
  assert.match(yml, /windows-latest/);
  assert.match(yml, /pnpm test/);
});

test("publish workflow publishes only the CLI package via OIDC", () => {
  const yml = readFileSync(join(repoRoot, ".github/workflows/publish.yml"), "utf8");
  assert.match(yml, /tags:/);
  assert.match(yml, /v\*/);
  assert.match(yml, /id-token:\s*write/i);
  assert.match(yml, /publish:cli|filter @hoanghainh\/knot-sync|with-cli-publish-manifest/);
});

test("root README links ja/vi docs and documents npx verification", () => {
  const readme = readFileSync(join(repoRoot, "README.md"), "utf8");
  assert.match(readme, /docs\/ja/);
  assert.match(readme, /docs\/vi/);
  assert.match(readme, /npx @hoanghainh\/knot-sync/);
  assert.match(readme, /single npm package|one npm package|only package/i);
});

test("product README documents public contract and Paid not on npm", () => {
  const readme = readFileSync(join(repoRoot, "README.md"), "utf8");
  assert.match(readme, /## Public contract \(toward 1\.0\)/);
  assert.match(readme, /1\.0\.0 is not\s+published yet/i);
  assert.match(readme, /apiVersion/);
  assert.match(readme, /are \*\*not\*\* separate npm packages/);
  assert.match(readme, /Core never checks licenses/i);

  const cliReadme = readFileSync(join(packagesDir, "cli", "README.md"), "utf8");
  assert.match(cliReadme, /## Public contract \(toward 1\.0\)/);
  assert.match(cliReadme, /are \*\*not\*\* separate npm packages/i);
});

test("ROADMAP status mentions public-contract prep", () => {
  const roadmap = readFileSync(join(repoRoot, "docs/ROADMAP.md"), "utf8");
  assert.match(roadmap, /prepare-v1-public-contract/);
  assert.match(roadmap, /Paid npm|npm clarity/i);
  assert.match(roadmap, /do not.*tag.*1\.0\.0|1\.0\.0.*pilot/i);
});

test("ui package keeps static assets without CDN refs", () => {
  const uiDir = join(packagesDir, "ui");
  const pkg = JSON.parse(readFileSync(join(uiDir, "package.json"), "utf8")) as {
    files?: string[];
    dependencies?: Record<string, string>;
    private?: boolean;
  };
  assert.equal(pkg.private, true);
  assert.ok(pkg.files?.includes("static"), "ui files must include static");
  assert.ok(pkg.dependencies?.react, "ui depends on react");
  const index = join(uiDir, "static", "index.html");
  assert.ok(existsSync(index), "run vite build before test — missing static/index.html");
  const html = readFileSync(index, "utf8");
  assert.doesNotMatch(html, /cdn\.|unpkg\.com|jsdelivr/i);
});
