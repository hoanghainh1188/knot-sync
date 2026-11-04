import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_EXCLUDES, type FileEntry, type FsSourceConfig } from "@hoanghainh/knot-sync-core";
import { scanFs } from "./index.js";

async function collect(src: FsSourceConfig, hash = true): Promise<FileEntry[]> {
  const out: FileEntry[] = [];
  for await (const e of scanFs(src, { hash })) out.push(e);
  return out;
}

test("scanFs walks, filters and skips junk", async () => {
  const root = await mkdtemp(join(tmpdir(), "mcpn-fs-"));
  try {
    await mkdir(join(root, "経理", "2024"), { recursive: true });
    await mkdir(join(root, "node_modules"), { recursive: true });
    await writeFile(join(root, "経理", "2024", "請求書.xlsx"), "same-bytes");
    await writeFile(join(root, "経理", "請求書_コピー.xlsx"), "same-bytes");
    await writeFile(join(root, "Hóa đơn.PDF"), "pdf");
    await writeFile(join(root, "~$請求書.xlsx"), "lock");
    await writeFile(join(root, "notes.exe"), "x");
    await writeFile(join(root, "node_modules", "skip.xlsx"), "x");
    await symlink(join(root, "経理"), join(root, "link-to-keiri"));

    const src: FsSourceConfig = {
      id: "t",
      type: "fs",
      path: root,
      extensions: [".xlsx", ".pdf"],
      exclude: DEFAULT_EXCLUDES,
    };
    const files = await collect(src);
    const paths = files.map((f) => f.relPath).sort();
    assert.deepEqual(paths, ["Hóa đơn.PDF", "経理/2024/請求書.xlsx", "経理/請求書_コピー.xlsx"]);

    const pdf = files.find((f) => f.relPath === "Hóa đơn.PDF")!;
    assert.equal(pdf.ext, ".pdf");
    assert.equal(pdf.type, "pdf");

    const xlsx = files.filter((f) => f.type === "xlsx");
    assert.equal(xlsx[0]?.hash, xlsx[1]?.hash, "duplicates share a hash");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("scanFs without extension filter and without hashing", async () => {
  const root = await mkdtemp(join(tmpdir(), "mcpn-fs-"));
  try {
    await writeFile(join(root, "a.txt"), "a");
    await writeFile(join(root, "b.bin"), "b");
    const files = await collect(
      { id: "t", type: "fs", path: root, extensions: [], exclude: [] },
      false,
    );
    assert.equal(files.length, 2);
    assert.ok(files.every((f) => f.hash === null));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("scanFs rejects a missing root", async () => {
  await assert.rejects(
    collect({ id: "t", type: "fs", path: "/no/such/dir", extensions: [], exclude: [] }),
  );
});
