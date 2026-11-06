import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve, sep } from "node:path";
import { ConfigError } from "@hoanghainh/knot-sync-core";
import {
  DEFAULT_REPORT_PATH,
  assertReportPathOutsideSources,
  normalizeReportArgv,
} from "./report.js";

test("normalizeReportArgv fills default for bare --report", () => {
  assert.deepEqual(normalizeReportArgv(["scan", "--report"]), [
    "scan",
    "--report",
    DEFAULT_REPORT_PATH,
  ]);
  assert.deepEqual(normalizeReportArgv(["scan", "--report", "--json"]), [
    "scan",
    "--report",
    DEFAULT_REPORT_PATH,
    "--json",
  ]);
  assert.deepEqual(normalizeReportArgv(["scan", "--report", "out.html"]), [
    "scan",
    "--report",
    "out.html",
  ]);
  assert.deepEqual(normalizeReportArgv(["scan", "--report="]), [
    "scan",
    "--report",
    DEFAULT_REPORT_PATH,
  ]);
});

test("assertReportPathOutsideSources blocks source subtree", () => {
  const root = resolve("/tmp/share-root");
  assert.throws(
    () => assertReportPathOutsideSources(resolve(root, "report.html"), [root]),
    ConfigError,
  );
  const ok = assertReportPathOutsideSources(resolve("/tmp/other/report.html"), [root]);
  assert.ok(ok.includes(`${sep}other${sep}`) || ok.endsWith(`${sep}report.html`));
});
