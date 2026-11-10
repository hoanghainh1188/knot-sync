import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { appendSystemLogSafe, withSystemLog } from "./system-log-run.js";
import { SystemLogger } from "@hoanghainh/knot-sync-core";

test("withSystemLog writes start and end lines", async () => {
  const root = await mkdtemp(join(tmpdir(), "syslog-run-"));
  try {
    const path = join(root, "system.jsonl");
    const stderr: string[] = [];
    const code = await withSystemLog(
      {
        command: "optimize",
        logging: { path, level: "info" },
        sourcePaths: [join(root, "share")],
        io: { err: (t) => stderr.push(t) },
      },
      async () => 0,
    );
    assert.equal(code, 0);
    const lines = (await readFile(path, "utf8")).trim().split("\n");
    assert.equal(lines.length, 2);
    const events = lines.map((l) => (JSON.parse(l) as { event: string }).event);
    assert.deepEqual(events, ["command.start", "command.end"]);
    assert.equal(stderr.length, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("appendSystemLogSafe reports write failure without throwing", async () => {
  const root = await mkdtemp(join(tmpdir(), "syslog-safe-"));
  try {
    await writeFile(join(root, "not-a-dir"), "x", "utf8");
    const log = new SystemLogger(join(root, "not-a-dir", "x.jsonl"));
    const stderr: string[] = [];
    await appendSystemLogSafe(log, { err: (t) => stderr.push(t) }, {
      level: "error",
      event: "command.error",
      error: "original boom",
    });
    assert.match(stderr.join("\n"), /System log write failed/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("withSystemLog preserves original thrown error", async () => {
  const root = await mkdtemp(join(tmpdir(), "syslog-throw-"));
  try {
    const stderr: string[] = [];
    await assert.rejects(
      () =>
        withSystemLog(
          {
            command: "run",
            logging: { path: join(root, "ok.jsonl"), level: "info" },
            sourcePaths: [join(root, "share")],
            io: { err: (t) => stderr.push(t) },
          },
          async () => {
            throw new Error("original boom");
          },
        ),
      /original boom/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
