/**
 * Smoke test for the load script (small count; run via node --test after build).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

test("store-load-stress smoke with small count", () => {
  const script = join(process.cwd(), "scripts/store-load-stress.mjs");
  const result = spawnSync(
    process.execPath,
    [script, "--count", "120", "--chunk", "40"],
    { encoding: "utf8", cwd: process.cwd() },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.count, 120);
  assert.ok(report.hitCount >= 1);
  assert.ok(typeof report.searchMs === "number");
});
