import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { main, type Io } from "./main.js";

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

test("helpful errors", async () => {
  let io = capture();
  assert.equal(await main(["scan", "-c", "/no/such/config.yaml"], io), 1);
  assert.match(io.stderr.join("\n"), /Config file not found/);

  io = capture();
  assert.equal(await main(["nope"], io), 2);
  assert.match(io.stderr.join("\n"), /Unknown command/);

  io = capture();
  assert.equal(await main(["serve"], io), 2);

  io = capture();
  assert.equal(await main(["--version"], io), 0);
  assert.match(io.stdout[0] ?? "", /^\d+\.\d+\.\d+$/);
});
