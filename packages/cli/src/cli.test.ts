import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { main, type Io } from "./main.js";

const repoRoot = resolveRepoRoot();

function resolveRepoRoot(): string {
  // packages/cli/src -> repo root
  return join(dirname(fileURLToPath(import.meta.url)), "../../..");
}

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

test("init then scan a folder end to end", async () => {
  const root = await mkdtemp(join(tmpdir(), "mcpn-cli-"));
  try {
    const share = join(root, "share");
    await mkdir(join(share, "営業"), { recursive: true });
    await writeFile(join(share, "営業", "見積書.xlsx"), "dup");
    await writeFile(join(share, "見積書 (1).xlsx"), "dup");
    await writeFile(join(share, "Báo cáo.docx"), "docx");
    await writeFile(join(share, "app.exe"), "skip by extension filter");

    const config = join(root, "cfg.yaml");
    let io = capture();
    assert.equal(await main(["init", "-c", config, "--path", "./share"], io), 0);
    assert.match(await readFile(config, "utf8"), /path: \.\/share/);

    io = capture();
    assert.equal(await main(["init", "-c", config], io), 1, "refuses to overwrite");

    io = capture();
    assert.equal(await main(["scan", "-c", config, "--json"], io), 0);
    const result = JSON.parse(io.stdout.join("\n"));
    const stats = result.sources[0].stats;
    assert.equal(stats.fileCount, 3);
    assert.equal(stats.duplicateFiles, 1);

    io = capture();
    assert.equal(await main(["scan", "-c", config], io), 0);
    const text = io.stdout.join("\n");
    assert.match(text, /Source "shared-folder": 3 files/);
    assert.match(text, /Duplicate copies/);
    assert.match(text, /営業\/見積書\.xlsx/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("plugins lists built-in fs connector", async () => {
  const root = await mkdtemp(join(tmpdir(), "mcpn-cli-"));
  try {
    const config = join(root, "cfg.yaml");
    let io = capture();
    assert.equal(await main(["init", "-c", config, "--path", "./share"], io), 0);
    await mkdir(join(root, "share"), { recursive: true });

    io = capture();
    assert.equal(await main(["plugins", "-c", config], io), 0);
    const text = io.stdout.join("\n");
    assert.match(text, /full trust/);
    assert.match(text, /fs@/);
    assert.match(text, /connector:fs/);
    assert.match(text, /extractor-office@/);
    assert.match(text, /extractor:office/);
    assert.match(text, /cleaner-ja-vi@/);
    assert.match(text, /cleaner:cleaner-ja-vi/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("run extracts documents and skips unchanged hashes", async () => {
  const { buildXlsx } = await import("@hoanghainh/knot-sync-extractor-office/fixtures");
  const { Store } = await import("@hoanghainh/knot-sync-store-sqlite");
  const root = await mkdtemp(join(tmpdir(), "mcpn-cli-run-"));
  try {
    const share = join(root, "share");
    await mkdir(share, { recursive: true });
    await writeFile(join(share, "請求.xlsx"), await buildXlsx([["品名"], ["ねじ"]]));
    await writeFile(join(share, "note.txt"), "Hóa đơn 001\n", "utf8");
    await writeFile(join(share, "bad.docx"), "not-docx", "utf8");

    const config = join(root, "cfg.yaml");
    let io = capture();
    assert.equal(await main(["init", "-c", config, "--path", "./share"], io), 0);

    io = capture();
    assert.equal(await main(["run", "-c", config], io), 1, "run without scan fails");
    assert.match(io.stderr.join("\n"), /scan/);

    io = capture();
    assert.equal(await main(["scan", "-c", config], io), 0);

    io = capture();
    assert.equal(await main(["run", "-c", config], io), 0);
    assert.match(io.stdout.join("\n"), /extracted/);

    // Second run should skip unchanged files.
    io = capture();
    assert.equal(await main(["run", "-c", config], io), 0);
    assert.match(io.stdout.join("\n"), /unchanged/);

    const store = new Store(join(root, ".data/store.sqlite"));
    assert.ok(store.search("ねじ").length >= 1, "extracted xlsx is searchable");
    assert.ok(store.search("Hóa đơn").length >= 1, "extracted txt is searchable");
    store.close();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("plugins loads example mask-company-id plugin", async () => {
  const root = await mkdtemp(join(tmpdir(), "mcpn-cli-"));
  try {
    const examplePlugin = join(repoRoot, "examples/plugins/mask-company-id.mjs");
    const share = join(root, "share");
    await mkdir(share, { recursive: true });
    const config = join(root, "cfg.yaml");
    await writeFile(
      config,
      [
        "sources:",
        "  - id: s",
        "    type: fs",
        "    path: ./share",
        "plugins:",
        `  - ${examplePlugin}`,
        "mask-company-id:",
        "  pattern: ACME-.*",
        "store:",
        "  path: ./.data/store.sqlite",
        "",
      ].join("\n"),
      "utf8",
    );

    const io = capture();
    assert.equal(await main(["plugins", "-c", config], io), 0);
    const text = io.stdout.join("\n");
    assert.match(text, /mask-company-id@/);
    assert.match(text, /pii-rule:mask-company-id/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("run cleans JP/VN text and retains original plus tokens", async () => {
  const { Store } = await import("@hoanghainh/knot-sync-store-sqlite");
  const root = await mkdtemp(join(tmpdir(), "mcpn-cli-clean-"));
  try {
    const share = join(root, "share");
    await mkdir(share, { recursive: true });
    await writeFile(
      join(share, "note.txt"),
      "契約 令和5年4月1日 金額２０２４円\n",
      "utf8",
    );

    const config = join(root, "cfg.yaml");
    let io = capture();
    assert.equal(await main(["init", "-c", config, "--path", "./share"], io), 0);
    io = capture();
    assert.equal(await main(["scan", "-c", config], io), 0);
    io = capture();
    assert.equal(await main(["run", "-c", config], io), 0);

    const store = new Store(join(root, ".data/store.sqlite"));
    const hits = store.search("2023-04-01");
    assert.ok(hits.length >= 1, "cleaned ISO date is searchable");
    const doc = store.getDocument(hits[0]!.id);
    assert.ok(doc);
    assert.match(doc!.content, /2023-04-01/);
    assert.match(doc!.content, /2024/);
    assert.match(String(doc!.metadata.originalContent), /令和5年4月1日/);
    assert.match(String(doc!.metadata.originalContent), /２０２４/);
    assert.equal(typeof doc!.metadata.tokensBefore, "number");
    assert.equal(typeof doc!.metadata.tokensAfter, "number");
    store.close();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("cleaning.wareki false skips era conversion", async () => {
  const { Store } = await import("@hoanghainh/knot-sync-store-sqlite");
  const root = await mkdtemp(join(tmpdir(), "mcpn-cli-wareki-off-"));
  try {
    const share = join(root, "share");
    await mkdir(share, { recursive: true });
    await writeFile(join(share, "note.txt"), "契約 令和5年4月1日\n", "utf8");
    const config = join(root, "cfg.yaml");
    await writeFile(
      config,
      [
        "sources:",
        "  - id: shared-folder",
        "    type: fs",
        "    path: ./share",
        "    extensions: [.txt]",
        "store:",
        "  path: ./.data/store.sqlite",
        "cleaning:",
        "  wareki: false",
        "",
      ].join("\n"),
      "utf8",
    );

    let io = capture();
    assert.equal(await main(["scan", "-c", config], io), 0);
    io = capture();
    assert.equal(await main(["run", "-c", config], io), 0);

    const store = new Store(join(root, ".data/store.sqlite"));
    const hits = store.search("令和");
    assert.ok(hits.length >= 1);
    const doc = store.getDocument(hits[0]!.id);
    assert.ok(doc);
    assert.match(doc!.content, /令和5年4月1日|令和5年4月1/);
    assert.doesNotMatch(doc!.content, /2023-04-01/);
    store.close();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("unknown source type fails clearly", async () => {
  const root = await mkdtemp(join(tmpdir(), "mcpn-cli-"));
  try {
    const config = join(root, "cfg.yaml");
    await writeFile(
      config,
      "sources:\n  - id: a\n    type: oracle\n    path: ./share\n",
      "utf8",
    );
    const io = capture();
    assert.equal(await main(["scan", "-c", config], io), 1);
    assert.match(io.stderr.join("\n"), /Registered connector types: fs/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("helpful errors", async () => {
  let io = capture();
  assert.equal(await main(["scan", "-c", "/no/such/config.yaml"], io), 1);
  assert.match(io.stderr.join("\n"), /Config file not found/);

  io = capture();
  assert.equal(await main(["nope"], io), 2);
  assert.match(io.stderr.join("\n"), /Unknown command/);

  io = capture();
  assert.equal(await main(["serve"], io), 2);
  assert.match(io.stderr.join("\n"), /not available yet/);

  io = capture();
  assert.equal(await main(["--version"], io), 0);
  assert.match(io.stdout[0] ?? "", /^\d+\.\d+\.\d+$/);

  io = capture();
  assert.equal(await main(["plugins", "--help"], io), 0);
  assert.match(io.stdout.join("\n"), /full trust/);
});
