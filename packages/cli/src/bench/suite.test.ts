import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  BenchSuiteError,
  defaultSuitePath,
  loadBenchSuite,
  loadBenchSuiteIfPresent,
} from "./suite.js";

test("loadBenchSuite parses JP/VN search and catalog cases", async () => {
  const root = await mkdtemp(join(tmpdir(), "knot-bench-suite-"));
  try {
    const path = join(root, "knot-sync.bench.yaml");
    await writeFile(
      path,
      [
        "version: 1",
        "search:",
        "  - id: invoice-ja",
        "    query: 請求書",
        "    expect:",
        "      titleContains: 請求書",
        "  - id: invoice-vi",
        "    query: hóa đơn",
        "    expect:",
        "      titleContains: Hóa đơn",
        "catalog:",
        "  - id: tksk",
        "    source: erp",
        "    table: 受注",
        "    name: 得意先コード",
        "    expectResolved: true",
        "",
      ].join("\n"),
      "utf8",
    );

    const suite = await loadBenchSuite(path);
    assert.equal(suite.version, 1);
    assert.equal(suite.search.length, 2);
    assert.equal(suite.search[0]?.query, "請求書");
    assert.equal(suite.search[1]?.query, "hóa đơn");
    assert.equal(suite.catalog[0]?.name, "得意先コード");
    assert.equal(suite.catalog[0]?.expectResolved, true);
    assert.equal(defaultSuitePath(join(root, "cfg.yaml")), path);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("loadBenchSuite rejects bad YAML and missing expect", async () => {
  const root = await mkdtemp(join(tmpdir(), "knot-bench-bad-"));
  try {
    const badYaml = join(root, "bad.yaml");
    await writeFile(badYaml, "version: [\n", "utf8");
    await assert.rejects(() => loadBenchSuite(badYaml), (err: unknown) => {
      assert.ok(err instanceof BenchSuiteError);
      assert.match(err.message, /Invalid YAML|Fix the suite/);
      return true;
    });

    const missingExpect = join(root, "missing.yaml");
    await writeFile(
      missingExpect,
      ["version: 1", "search:", "  - id: x", "    query: y", "    expect: {}", ""].join("\n"),
      "utf8",
    );
    await assert.rejects(() => loadBenchSuite(missingExpect), /titleContains|documentId|pathContains/);

    assert.equal(await loadBenchSuiteIfPresent(join(root, "nope.yaml")), null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
