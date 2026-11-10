import type {
  ExtractContext,
  ExtractResult,
  Extractor,
  FileEntry,
  PluginHost,
} from "@hoanghainh/knot-sync-core";

/** Must match packages/extractor-ocr OCR_EXTRACTOR_ID. */
export const OCR_EXTRACTOR_ID = "ocr-docling";

/**
 * Run primary extractor; on PDF EMPTY, fall through to OCR when loaded.
 * Text PDFs that succeed never invoke OCR.
 */
export async function extractWithOcrFallback(
  host: PluginHost,
  file: FileEntry,
  extractor: Extractor,
  ctx: ExtractContext,
): Promise<ExtractResult> {
  const result = await extractor.extract(file, ctx);
  if (!result.ok && result.code === "EMPTY" && file.ext === ".pdf") {
    const ocr = host.extractors.get(OCR_EXTRACTOR_ID);
    if (ocr && ocr.id !== extractor.id) {
      return ocr.extract(file, ctx);
    }
  }
  return result;
}
