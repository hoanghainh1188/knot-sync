import type {
  ExtractContext,
  ExtractResult,
  FileEntry,
  PluginHost,
} from "@hoanghainh/knot-sync-core";

/** Must match packages/extractor-housen HOUSEN_EXTRACTOR_ID. */
export const HOUSEN_EXTRACTOR_ID = "housen-xlsx";

export interface HousenRewriteOutcome {
  result: ExtractResult;
  /** Soft issues to record while still keeping a usable Document (e.g. LICENSE). */
  sideIssues: Array<{ code: string; message: string }>;
}

/**
 * After a successful office `.xlsx` extract, try housen layout rewrite when loaded.
 * NOT_FORM → keep office. LICENSE / timeout / size → keep office + side issue.
 * Form success → replace with housen Document.
 */
export async function maybeApplyHousenRewrite(
  host: PluginHost,
  file: FileEntry,
  officeResult: ExtractResult,
  ctx: ExtractContext,
): Promise<HousenRewriteOutcome> {
  if (!officeResult.ok || file.ext !== ".xlsx") {
    return { result: officeResult, sideIssues: [] };
  }

  const housen = host.extractors.get(HOUSEN_EXTRACTOR_ID);
  if (!housen) {
    return { result: officeResult, sideIssues: [] };
  }

  const hr = await housen.extract(file, ctx);
  if (hr.ok) {
    // Preserve office hidden-cell signal for the injection guard.
    const officeHidden = officeResult.document.metadata.guardHiddenText;
    if (officeHidden != null && officeHidden !== "") {
      hr.document.metadata = {
        ...hr.document.metadata,
        guardHiddenText: officeHidden,
      };
    }
    return { result: hr, sideIssues: [] };
  }

  if (hr.code === "NOT_FORM" || hr.code === "EMPTY" || hr.code === "PARSE") {
    // Not form-like / nothing useful — keep office quietly.
    return { result: officeResult, sideIssues: [] };
  }

  // LICENSE / timeout / size: keep office Document, surface the issue.
  return {
    result: officeResult,
    sideIssues: [{ code: hr.code, message: hr.message }],
  };
}
