import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  loadPlugins,
  parseConfig,
  resolveConfig,
  type KnotSyncPlugin,
} from "@hoanghainh/knot-sync-core";
import fsPlugin from "@hoanghainh/knot-sync-connector-fs";
import officePlugin from "@hoanghainh/knot-sync-extractor-office";
import { Store } from "@hoanghainh/knot-sync-store-sqlite";
import { runInProcessSyncCycle, startPeriodicSync } from "./sync-cycle.js";

test("startPeriodicSync runs cycles sequentially without overlapping slow cycles", async () => {
  let active = 0;
  let maxConcurrent = 0;
  let completed = 0;
  const starts: number[] = [];
  const ends: number[] = [];

  let resolveEnough!: () => void;
  const enough = new Promise<void>((resolve) => {
    resolveEnough = resolve;
  });

  const handle = startPeriodicSync({
    intervalSeconds: 0.02,
    runCycle: async () => {
      active += 1;
      maxConcurrent = Math.max(maxConcurrent, active);
      starts.push(Date.now());
      // Intentionally slower than the 20ms interval to prove sequential scheduling.
      await new Promise((r) => setTimeout(r, 45));
      active -= 1;
      ends.push(Date.now());
      completed += 1;
      if (completed >= 2) resolveEnough();
      return {
        scanned: 0,
        extracted: 0,
        skipped: 0,
        pruned: 0,
        failed: 0,
        durationMs: 45,
        aborted: false,
      };
    },
  });

  await enough;
  await handle.stop();

  assert.equal(maxConcurrent, 1);
  assert.ok(completed >= 2);
  // Second cycle starts strictly after first cycle ended.
  assert.ok(starts[1]! >= ends[0]!);
});

test("startPeriodicSync stop() aborts active cycle and drains before resolving", async () => {
  let cycleEntered!: () => void;
  const enteredPromise = new Promise<void>((resolve) => {
    cycleEntered = resolve;
  });
  let releaseCycle!: () => void;
  const gate = new Promise<void>((resolve) => {
    releaseCycle = resolve;
  });

  let sawAbort = false;
  let cycleFinished = false;
  let cycleEndCalled = 0;

  const handle = startPeriodicSync({
    intervalSeconds: 0.01,
    runCycle: async (signal) => {
      cycleEntered();
      signal.addEventListener("abort", () => {
        sawAbort = true;
      });
      await gate;
      cycleFinished = true;
      return {
        scanned: 1,
        extracted: 0,
        skipped: 0,
        pruned: 0,
        failed: 0,
        durationMs: 5,
        aborted: signal.aborted,
      };
    },
    onCycleEnd: () => {
      cycleEndCalled += 1;
    },
  });

  await enteredPromise;
  assert.equal(handle.running, true);

  let stopResolved = false;
  const stopPromise = handle.stop().then(() => {
    stopResolved = true;
  });

  await new Promise((r) => setTimeout(r, 20));
  assert.equal(sawAbort, true);
  assert.equal(stopResolved, false, "stop() must wait for active cycle to drain");

  releaseCycle();
  await stopPromise;

  assert.equal(stopResolved, true);
  assert.equal(cycleFinished, true);
  assert.equal(handle.running, false);
  assert.equal(cycleEndCalled, 1);

  // Confirm no additional cycles run after stop().
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(cycleEndCalled, 1);
});

test("startPeriodicSync soft-fails errors via onCycleError and keeps running", async () => {
  let attempts = 0;
  let errorsCaught = 0;
  let successAfterError = 0;
  let resolveDone!: () => void;
  const done = new Promise<void>((resolve) => {
    resolveDone = resolve;
  });

  const handle = startPeriodicSync({
    intervalSeconds: 0.015,
    runCycle: async () => {
      attempts += 1;
      if (attempts === 1) {
        throw new Error("transient source offline");
      }
      successAfterError += 1;
      resolveDone();
      return {
        scanned: 2,
        extracted: 1,
        skipped: 1,
        pruned: 0,
        failed: 0,
        durationMs: 2,
        aborted: false,
      };
    },
    onCycleError: (err) => {
      assert.match((err as Error).message, /transient source offline/);
      errorsCaught += 1;
    },
  });

  await done;
  await handle.stop();

  assert.equal(errorsCaught, 1);
  assert.ok(successAfterError >= 1);
});

test("runInProcessSyncCycle invokes embed_documents silently and captures embed error cleanly", async () => {
  const root = await mkdtemp(join(tmpdir(), "knot-sync-cycle-"));
  const docsDir = join(root, "docs");
  try {
    const { mkdir } = await import("node:fs/promises");
    await mkdir(docsDir, { recursive: true });
    await writeFile(join(docsDir, "notes.txt"), "Báo cáo thử nghiệm\n", "utf8");

    let embedCalledOnRun = false;
    const fakeEmbedPlugin: KnotSyncPlugin = {
      name: "fake-embed",
      version: "0.1.0",
      apiVersion: 1,
      register(api) {
        api.registerMcpTool({
          id: "embed_documents",
          description: "fake embedder",
          inputSchema: { type: "object", properties: {} },
          handler: async (args) => {
            embedCalledOnRun =
              typeof args === "object" && args !== null && (args as { onRun?: unknown }).onRun === true;
            throw new Error("ollama offline");
          },
        });
      },
    };

    const structural = parseConfig(
      `sources:\n  - id: docs\n    type: fs\n    path: ${JSON.stringify(docsDir)}\n`,
      root,
    );
    const host = await loadPlugins({
      builtins: [fsPlugin, officePlugin, fakeEmbedPlugin],
      entries: [],
      baseDir: root,
    });
    const config = resolveConfig(structural, host);

    const store = new Store(config.store.path);
    const writes: string[] = [];
    const origWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: unknown) => {
      writes.push(String(chunk));
      return true;
    }) as typeof process.stdout.write;

    try {
      const summary = await runInProcessSyncCycle({
        config,
        host,
        store,
        signal: new AbortController().signal,
      });
      assert.equal(summary.scanned, 1);
      assert.equal(summary.extracted, 1);
      assert.equal(summary.pruned, 0);
      assert.equal(summary.failed, 0);
      assert.equal(embedCalledOnRun, true);
      assert.match(summary.embedError ?? "", /ollama offline/);
      assert.equal(writes.length, 0, "in-process cycle must never write to stdout");
    } finally {
      process.stdout.write = origWrite;
      store.close();
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
