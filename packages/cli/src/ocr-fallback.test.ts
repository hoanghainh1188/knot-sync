import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createPluginHost,
  type ExtractResult,
  type Extractor,
  type FileEntry,
} from "@hoanghainh/knot-sync-core";
import { extractWithOcrFallback, OCR_EXTRACTOR_ID } from "./ocr-fallback.js";
import { t } from "./i18n/index.js";

function pdfEntry(rel = "scan.pdf"): FileEntry {
  return {
    sourceId: "s",
    absPath: `/tmp/${rel}`,
    relPath: rel,
    ext: ".pdf",
    type: "pdf",
    size: 10,
    mtimeMs: 1,
    hash: "h",
  };
}

test("PDF EMPTY falls through to OCR when plugin loaded", async () => {
  let officeCalls = 0;
  let ocrCalls = 0;
  const office: Extractor = {
    id: "office",
    extensions: [".pdf"],
    extract: async () => {
      officeCalls += 1;
      return {
        ok: false,
        code: "EMPTY",
        message: "no text",
      };
    },
  };
  const ocr: Extractor = {
    id: OCR_EXTRACTOR_ID,
    extensions: [".pdf", ".png"],
    extract: async () => {
      ocrCalls += 1;
      return {
        ok: true,
        document: {
          id: "d",
          sourceId: "s",
          type: "pdf",
          title: "scan.pdf",
          content: "請求書\n",
          tables: [],
          metadata: {},
          pii: [],
          guard: [],
          hash: "x",
        },
      };
    },
  };
  const host = createPluginHost();
  host.registerPlugin({
    name: "office-mock",
    version: "0",
    apiVersion: 1,
    register(api) {
      api.registerExtractor(office);
    },
  });
  host.registerPlugin({
    name: "extractor-ocr",
    version: "0",
    apiVersion: 1,
    register(api) {
      api.registerExtractor(ocr);
    },
  });

  const result = await extractWithOcrFallback(host, pdfEntry(), office, {});
  assert.equal(officeCalls, 1);
  assert.equal(ocrCalls, 1);
  assert.equal(result.ok, true);
  if (result.ok) assert.match(result.document.content, /請求書/);
});

test("text PDF success never calls OCR", async () => {
  let ocrCalls = 0;
  const office: Extractor = {
    id: "office",
    extensions: [".pdf"],
    extract: async (): Promise<ExtractResult> => ({
      ok: true,
      document: {
        id: "d",
        sourceId: "s",
        type: "pdf",
        title: "text.pdf",
        content: "請求書 from text layer\n",
        tables: [],
        metadata: {},
        pii: [],
        guard: [],
        hash: "x",
      },
    }),
  };
  const ocr: Extractor = {
    id: OCR_EXTRACTOR_ID,
    extensions: [".pdf"],
    extract: async () => {
      ocrCalls += 1;
      throw new Error("OCR must not run for text PDFs");
    },
  };
  const host = createPluginHost();
  host.registerPlugin({
    name: "office-mock",
    version: "0",
    apiVersion: 1,
    register(api) {
      api.registerExtractor(office);
    },
  });
  host.registerPlugin({
    name: "extractor-ocr",
    version: "0",
    apiVersion: 1,
    register(api) {
      api.registerExtractor(ocr);
    },
  });

  const result = await extractWithOcrFallback(host, pdfEntry("text.pdf"), office, {});
  assert.equal(ocrCalls, 0);
  assert.equal(result.ok, true);
  if (result.ok) assert.match(result.document.content, /text layer/);
});

test("EMPTY without OCR plugin stays EMPTY", async () => {
  const office: Extractor = {
    id: "office",
    extensions: [".pdf"],
    extract: async () => ({ ok: false, code: "EMPTY", message: "no text" }),
  };
  const host = createPluginHost();
  host.registerPlugin({
    name: "office-mock",
    version: "0",
    apiVersion: 1,
    register(api) {
      api.registerExtractor(office);
    },
  });
  const result = await extractWithOcrFallback(host, pdfEntry(), office, {});
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "EMPTY");
});

test("LICENSE and DOCKER issue strings exist in ja/vi", () => {
  assert.match(t("en", "run.issueLicense"), /KNOT_SYNC_OCR_LICENSE|license/i);
  assert.match(t("ja", "run.issueLicense"), /ライセンス|KNOT_SYNC_OCR_LICENSE/);
  assert.match(t("vi", "run.issueLicense"), /giấy phép|license|KNOT_SYNC_OCR_LICENSE/i);
  assert.match(t("en", "run.issueDocker"), /Docker|docling/i);
  assert.match(t("ja", "run.issueDocker"), /Docker/);
  assert.match(t("vi", "run.issueDocker"), /Docker/);
});
