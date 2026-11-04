import type { DocumentType } from "./types.js";

const EXT_TO_TYPE: Record<string, DocumentType> = {
  ".xlsx": "xlsx",
  ".xlsm": "xlsx",
  ".xls": "xls",
  ".docx": "docx",
  ".doc": "doc",
  ".pdf": "pdf",
  ".csv": "csv",
  ".tsv": "csv",
  ".txt": "txt",
  ".md": "md",
  ".pptx": "pptx",
  ".png": "image",
  ".jpg": "image",
  ".jpeg": "image",
  ".tif": "image",
  ".tiff": "image",
  ".bmp": "image",
};

/** Lower-case extension with the dot, or "" when there is none. */
export function extOf(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() ?? fileName;
  const dot = base.lastIndexOf(".");
  if (dot <= 0) return "";
  return base.slice(dot).toLowerCase();
}

export function typeFromExt(ext: string): DocumentType {
  return EXT_TO_TYPE[ext.toLowerCase()] ?? "other";
}

/**
 * Office lock / temp files that should never be read:
 * "~$Book1.xlsx" (Office lock), "._foo" (macOS), "Thumbs.db", "desktop.ini".
 */
export function isJunkFile(fileName: string): boolean {
  if (fileName.startsWith("~$")) return true;
  if (fileName.startsWith("._")) return true;
  const lower = fileName.toLowerCase();
  return lower === "thumbs.db" || lower === "desktop.ini" || lower === ".ds_store";
}
