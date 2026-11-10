import ExcelJS from "exceljs";
import { basename } from "node:path";
import {
  documentId,
  sha256,
  type Document,
  type ExtractContext,
  type ExtractResult,
  type FileEntry,
} from "@hoanghainh/knot-sync-core";
import { HOUSEN_EXTRACTOR_ID, NOT_FORM_CODE } from "./constants.js";
import {
  scoreFormLikeness,
  workbookLooksLikeForm,
  worksheetToGrid,
  type SheetGrid,
} from "./detect.js";
import { emitFormDocumentParts } from "./emit.js";
import { checkHousenLicense } from "./license.js";
import type { HousenSettings } from "./settings.js";

function fail(code: string, message: string): ExtractResult {
  return { ok: false, code, message };
}

function titleFromPath(relPath: string): string {
  return basename(relPath) || relPath;
}

function toDocument(
  file: FileEntry,
  content: string,
  tables: Document["tables"],
): Document {
  const normalized = content.replace(/\r\n/g, "\n").trimEnd() + (content ? "\n" : "");
  return {
    id: documentId(file.sourceId, file.relPath),
    sourceId: file.sourceId,
    type: file.type,
    title: titleFromPath(file.relPath),
    content: normalized,
    tables,
    metadata: {
      relPath: file.relPath,
      sourceFileHash: file.hash,
      extractor: HOUSEN_EXTRACTOR_ID,
      housen: true,
    },
    pii: [],
    guard: [],
    hash: sha256(normalized),
  };
}

export interface ExtractHousenOptions {
  settings: HousenSettings;
  env?: NodeJS.ProcessEnv;
}

export async function loadSheetGrids(
  absPath: string,
  signal?: AbortSignal,
): Promise<SheetGrid[]> {
  if (signal?.aborted) {
    throw Object.assign(new Error("aborted"), { name: "AbortError" });
  }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(absPath);
  if (signal?.aborted) {
    throw Object.assign(new Error("aborted"), { name: "AbortError" });
  }
  const grids: SheetGrid[] = [];
  for (const sheet of wb.worksheets) {
    grids.push(worksheetToGrid(sheet));
  }
  return grids;
}

/**
 * Layout-aware extract for form-like .xlsx.
 * Returns NOT_FORM when below threshold (CLI keeps office Document).
 */
export async function extractHousenFile(
  file: FileEntry,
  ctx: ExtractContext | undefined,
  options: ExtractHousenOptions,
): Promise<ExtractResult> {
  const { settings } = options;
  const env = options.env ?? process.env;

  const licenseFail = checkHousenLicense(settings, file.relPath, env);
  if (licenseFail) return licenseFail;

  const maxFromSettings =
    settings.maxInputMb !== undefined
      ? Math.floor(settings.maxInputMb * 1024 * 1024)
      : undefined;
  const maxBytes = maxFromSettings ?? ctx?.maxFileSizeBytes;
  if (maxBytes !== undefined && file.size > maxBytes) {
    return fail(
      "SKIPPED_TOO_LARGE",
      `Skipped housen layout for "${file.relPath}" (${file.size} bytes) — over size limit (${maxBytes} bytes). ` +
        `Raise extractor-housen.maxInputMb or extraction.maxFileSizeMb, then retry "knot-sync run".`,
    );
  }

  if (ctx?.signal?.aborted) {
    return fail(
      "EXTRACT_TIMEOUT",
      `Housen layout timed out for "${file.relPath}". Raise extractor-housen.timeoutSeconds or extraction.timeoutSeconds, then retry "knot-sync run".`,
    );
  }

  const timeoutMs = Math.max(1, Math.floor(settings.timeoutSeconds * 1000));
  const pluginSignal = AbortSignal.timeout(timeoutMs);
  const signal =
    ctx?.signal !== undefined
      ? AbortSignal.any([ctx.signal, pluginSignal])
      : pluginSignal;

  try {
    const grids = await loadSheetGrids(file.absPath, signal);
    if (grids.length === 0 || grids.every((g) => g.rowCount === 0)) {
      return fail("EMPTY", `Housen found no cells in "${file.relPath}".`);
    }

    const { formLike, best } = workbookLooksLikeForm(grids, settings.formThreshold);
    if (!formLike) {
      return fail(
        NOT_FORM_CODE,
        `Spreadsheet "${file.relPath}" does not look form-like ` +
          `(score=${(best?.score ?? 0).toFixed(2)} < threshold=${settings.formThreshold}). ` +
          `Keeping the office table extract.`,
      );
    }

    const { markdown, tables } = emitFormDocumentParts(grids);
    if (!markdown.trim()) {
      return fail("EMPTY", `Housen produced no structured text for "${file.relPath}".`);
    }

    return { ok: true, document: toDocument(file, markdown, tables) };
  } catch (err) {
    const name = (err as { name?: string }).name ?? "";
    if (name === "TimeoutError" || name === "AbortError" || signal.aborted) {
      return fail(
        "EXTRACT_TIMEOUT",
        `Housen layout timed out for "${file.relPath}". Raise extractor-housen.timeoutSeconds or extraction.timeoutSeconds, then retry "knot-sync run".`,
      );
    }
    return fail(
      "PARSE",
      `Housen layout failed for "${file.relPath}" (${(err as Error).message || String(err)}). ` +
        `Check the workbook, then retry "knot-sync run".`,
    );
  }
}

export { scoreFormLikeness, worksheetToGrid };
