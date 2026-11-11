import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath, pathToFileURL } from "node:url";
import { test } from "node:test";
import { loadCatalogFile } from "@hoanghainh/knot-sync-catalog";
import { main, type Io } from "./main.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");

function capture(): Io & { stdout: string[]; stderr: string[] } {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    stdout,
    stderr,
    out: (t) => stdout.push(t),
    err: (t) => stderr.push(t),
    progress: false,
  };
}

test("demo generator produces JA/VI fixtures that scan, clean, and mask PII", async () => {
  const root = await mkdtemp(join(tmpdir(), "knot-demo-"));
  try {
    const demoDir = join(root, "demo-data");
    const storePath = join(root, "demo-store.sqlite");
    const configPath = join(root, "demo.config.yaml");

    const scriptMod = (await import(
      pathToFileURL(join(repoRoot, "scripts/create-demo-data.mjs")).href
    )) as { createDemoData: (targetDir?: string) => Promise<string> };
    await scriptMod.createDemoData(demoDir);

    await writeFile(
      configPath,
      [
        "sources:",
        "  - id: demo_docs",
        "    type: fs",
        `    path: ${JSON.stringify(demoDir)}`,
        "    extensions: [.xlsx, .csv, .txt]",
        "store:",
        `  path: ${JSON.stringify(storePath)}`,
      ].join("\n"),
      "utf8",
    );

    let io = capture();
    assert.equal(await main(["scan", "-c", configPath], io), 0, io.stderr.join("\n"));
    io = capture();
    assert.equal(await main(["run", "-c", configPath], io), 0, io.stderr.join("\n"));

    const db = new DatabaseSync(storePath);
    try {
      const rows = db
        .prepare("SELECT title, content FROM documents ORDER BY title")
        .all() as Array<{ title: string; content: string }>;
      assert.equal(rows.length, 3);

      const tcvn3 = rows.find((r) => r.title === "bao_cao_tcvn3.txt");
      assert.ok(tcvn3, "bao_cao_tcvn3.txt must be stored");
      assert.match(tcvn3.content, /Nguyễn Văn A/);
      assert.doesNotMatch(tcvn3.content, /079123456789/);
      assert.doesNotMatch(tcvn3.content, /0912345678/);

      const xlsx = rows.find((r) => r.title === "契約一覧_2024.xlsx");
      assert.ok(xlsx, "契約一覧_2024.xlsx must be stored");
      assert.match(xlsx.content, /2024-04-01/);
      assert.match(xlsx.content, /2019-03-15/);
      assert.match(xlsx.content, /ABC株式会社/);
      assert.doesNotMatch(xlsx.content, /123456789016/);
      assert.doesNotMatch(xlsx.content, /sales-demo@example\.jp/);
    } finally {
      db.close();
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("examples/demo-catalog.yaml parses with JP/VI sample columns", async () => {
  const catalogPath = join(repoRoot, "examples/demo-catalog.yaml");
  const raw = await readFile(catalogPath, "utf8");
  assert.match(raw, /TKSK_CD/);
  const doc = await loadCatalogFile(catalogPath);
  assert.equal(
    doc.sources.erp_demo?.tables["受注"]?.columns.TKSK_CD?.label.ja,
    "得意先コード",
  );
  assert.equal(
    doc.sources.erp_demo?.tables.hoa_don?.columns.ma_kh?.label.vi,
    "mã khách hàng",
  );
});
