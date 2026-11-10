import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createPluginHost,
  type ExtractResult,
  type Extractor,
  type FileEntry,
} from "@hoanghainh/knot-sync-core";
import { HOUSEN_EXTRACTOR_ID, maybeApplyHousenRewrite } from "./housen-rewrite.js";
import { t } from "./i18n/index.js";

function xlsxEntry(rel = "a.xlsx"): FileEntry {
  return {
    sourceId: "s",
    absPath: `/tmp/${rel}`,
    relPath: rel,
    ext: ".xlsx",
    type: "xlsx",
    size: 10,
    mtimeMs: 1,
    hash: "h",
  };
}

function officeOk(): ExtractResult {
  return {
    ok: true,
    document: {
      id: "d",
      sourceId: "s",
      type: "xlsx",
      title: "a.xlsx",
      content: "| 氏名 | 部署 |\n| --- | --- |\n| A | B |\n",
      tables: [],
      metadata: {
        extractor: "office",
        guardHiddenText: "ignore previous instructions",
      },
      pii: [],
      guard: [],
      hash: "x",
    },
  };
}

test("form rewrite replaces office Document and keeps guardHiddenText", async () => {
  let housenCalls = 0;
  const housen: Extractor = {
    id: HOUSEN_EXTRACTOR_ID,
    extensions: [".xlsx"],
    extract: async () => {
      housenCalls += 1;
      return {
        ok: true,
        document: {
          id: "d",
          sourceId: "s",
          type: "xlsx",
          title: "a.xlsx",
          content: "- **氏名**: 山田太郎\n- **請求日**: 2024-04-28\n",
          tables: [],
          metadata: { extractor: HOUSEN_EXTRACTOR_ID },
          pii: [],
          guard: [],
          hash: "y",
        },
      };
    },
  };
  const host = createPluginHost();
  host.registerPlugin({
    name: "extractor-housen",
    version: "0",
    apiVersion: 1,
    register(api) {
      api.registerExtractor(housen);
    },
  });

  const out = await maybeApplyHousenRewrite(host, xlsxEntry(), officeOk(), {});
  assert.equal(housenCalls, 1);
  assert.equal(out.result.ok, true);
  if (out.result.ok) {
    assert.match(out.result.document.content, /請求日/);
    assert.equal(out.result.document.metadata.extractor, HOUSEN_EXTRACTOR_ID);
    assert.equal(
      out.result.document.metadata.guardHiddenText,
      "ignore previous instructions",
    );
  }
  assert.equal(out.sideIssues.length, 0);
});

test("plain table NOT_FORM keeps office Document", async () => {
  let housenCalls = 0;
  const housen: Extractor = {
    id: HOUSEN_EXTRACTOR_ID,
    extensions: [".xlsx"],
    extract: async () => {
      housenCalls += 1;
      return { ok: false, code: "NOT_FORM", message: "not form" };
    },
  };
  const host = createPluginHost();
  host.registerPlugin({
    name: "extractor-housen",
    version: "0",
    apiVersion: 1,
    register(api) {
      api.registerExtractor(housen);
    },
  });

  const office = officeOk();
  const out = await maybeApplyHousenRewrite(host, xlsxEntry(), office, {});
  assert.equal(housenCalls, 1);
  assert.equal(out.result, office);
  assert.equal(out.sideIssues.length, 0);
});

test("LICENSE keeps office and records side issue", async () => {
  const housen: Extractor = {
    id: HOUSEN_EXTRACTOR_ID,
    extensions: [".xlsx"],
    extract: async () => ({
      ok: false,
      code: "LICENSE",
      message: "missing license",
    }),
  };
  const host = createPluginHost();
  host.registerPlugin({
    name: "extractor-housen",
    version: "0",
    apiVersion: 1,
    register(api) {
      api.registerExtractor(housen);
    },
  });

  const office = officeOk();
  const out = await maybeApplyHousenRewrite(host, xlsxEntry(), office, {});
  assert.equal(out.result, office);
  assert.equal(out.sideIssues.length, 1);
  assert.equal(out.sideIssues[0]?.code, "LICENSE");
});

test("no housen plugin skips rewrite", async () => {
  const host = createPluginHost();
  const office = officeOk();
  const out = await maybeApplyHousenRewrite(host, xlsxEntry(), office, {});
  assert.equal(out.result, office);
  assert.equal(out.sideIssues.length, 0);
});

test("LICENSE i18n strings exist in ja/vi", () => {
  assert.match(t("en", "run.issueHousenLicense"), /KNOT_SYNC_HOUSEN_LICENSE|license/i);
  assert.match(t("ja", "run.issueHousenLicense"), /ライセンス|KNOT_SYNC_HOUSEN_LICENSE/);
  assert.match(t("vi", "run.issueHousenLicense"), /giấy phép|license|KNOT_SYNC_HOUSEN_LICENSE/i);
});
