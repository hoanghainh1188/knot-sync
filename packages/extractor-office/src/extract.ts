import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import ExcelJS from "exceljs";
import mammoth from "mammoth";
import { extractText, getDocumentProxy } from "unpdf";
import {
  DEFAULT_EXTRACTION_CONFIG,
  documentId,
  sha256,
  type Document,
  type ExtractContext,
  type ExtractResult,
  type FileEntry,
  type TableData,
} from "@hoanghainh/knot-sync-core";

function fail(code: string, message: string): ExtractResult {
  return { ok: false, code, message };
}

function titleFromPath(relPath: string): string {
  return basename(relPath) || relPath;
}

function toDocument(
  file: FileEntry,
  content: string,
  tables: TableData[],
  extraMeta: Record<string, string | number | boolean | null> = {},
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
      ...extraMeta,
    },
    pii: [],
    guard: [],
    hash: sha256(normalized),
  };
}

function cellToString(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    const v = value as Record<string, unknown>;
    if ("richText" in v && Array.isArray(v.richText)) {
      return (v.richText as { text?: string }[]).map((p) => p.text ?? "").join("");
    }
    if ("text" in v && typeof v.text === "string") return v.text;
    if ("result" in v) return cellToString(v.result);
    if ("hyperlink" in v && "text" in v) return String(v.text ?? v.hyperlink ?? "");
    if ("formula" in v) return cellToString(v.result);
  }
  return String(value);
}

function escapeMdCell(s: string): string {
  return s.replace(/\r?\n/g, " ").replace(/\|/g, "\\|");
}

function argbNearWhite(argb: unknown): boolean {
  if (typeof argb !== "string" || argb.length < 6) return false;
  const hex = argb.replace(/^#/, "").slice(-6);
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return false;
  const r = Number.parseInt(hex.slice(0, 2), 16);
  const g = Number.parseInt(hex.slice(2, 4), 16);
  const b = Number.parseInt(hex.slice(4, 6), 16);
  return r >= 250 && g >= 250 && b >= 250;
}

/** Best-effort: font.hidden or white-on-white cells for the injection guard. */
function isLikelyHiddenCell(cell: ExcelJS.Cell): boolean {
  const font = cell.font as { hidden?: boolean; color?: { argb?: string } } | undefined;
  if (font?.hidden === true) return true;
  const fill = cell.fill as
    | { type?: string; fgColor?: { argb?: string }; bgColor?: { argb?: string } }
    | undefined;
  const fontWhite = argbNearWhite(font?.color?.argb);
  const fillWhite =
    argbNearWhite(fill?.fgColor?.argb) || argbNearWhite(fill?.bgColor?.argb);
  return fontWhite && fillWhite;
}

function aborted(signal?: AbortSignal): boolean {
  return signal?.aborted === true;
}

function timeoutFail(file: FileEntry): ExtractResult {
  return fail(
    "EXTRACT_TIMEOUT",
    `Extraction timed out for "${file.relPath}". Raise extraction.timeoutSeconds or exclude the file, then retry "knot-sync run".`,
  );
}

function sheetsToDocument(
  file: FileEntry,
  sheets: Array<{ name: string; rows: string[][]; hiddenParts: string[] }>,
): ExtractResult {
  const tables: TableData[] = [];
  const parts: string[] = [];
  const hiddenParts: string[] = [];
  for (const sheet of sheets) {
    hiddenParts.push(...sheet.hiddenParts);
    if (sheet.rows.length === 0) continue;
    const headers = sheet.rows[0] ?? [];
    const body = sheet.rows.slice(1);
    tables.push({ name: sheet.name, headers, rows: body });
    parts.push(`## ${sheet.name}\n`);
    parts.push(`| ${headers.map(escapeMdCell).join(" | ")} |`);
    parts.push(`| ${headers.map(() => "---").join(" | ")} |`);
    for (const r of body) {
      parts.push(`| ${headers.map((_, i) => escapeMdCell(r[i] ?? "")).join(" | ")} |`);
    }
    parts.push("");
  }
  if (tables.length === 0 && parts.length === 0) {
    return fail("EMPTY", `Spreadsheet "${file.relPath}" has no rows.`);
  }
  const extra: Record<string, string | number | boolean | null> = {};
  if (hiddenParts.length > 0) {
    extra.guardHiddenText = hiddenParts.join("\n");
  }
  return { ok: true, document: toDocument(file, parts.join("\n"), tables, extra) };
}

/** Prefer streaming reader; fall back to buffer load when ExcelJS stream path fails. */
async function extractXlsx(file: FileEntry, ctx?: ExtractContext): Promise<ExtractResult> {
  const streamed = await extractXlsxStreaming(file, ctx);
  if (streamed.ok || streamed.code === "EMPTY" || streamed.code === "EXTRACT_TIMEOUT") {
    return streamed;
  }
  // ExcelJS 4.4 WorkbookReader can throw when workbook model is not ready; buffer path
  // remains bounded by extraction.maxFileSizeMb.
  return extractXlsxBuffered(file, ctx);
}

async function extractXlsxStreaming(
  file: FileEntry,
  ctx?: ExtractContext,
): Promise<ExtractResult> {
  const workbookReader = new ExcelJS.stream.xlsx.WorkbookReader(file.absPath, {
    entries: "emit",
    sharedStrings: "cache",
    hyperlinks: "cache",
    styles: "cache",
    worksheets: "emit",
  });

  const sheets: Array<{ name: string; rows: string[][]; hiddenParts: string[] }> = [];

  try {
    for await (const worksheetReader of workbookReader) {
      if (aborted(ctx?.signal)) return timeoutFail(file);
      const sheetMeta = worksheetReader as unknown as { name?: string; id?: number };
      const sheetName =
        typeof sheetMeta.name === "string" && sheetMeta.name
          ? sheetMeta.name
          : `Sheet${sheetMeta.id ?? "?"}`;

      const rows: string[][] = [];
      const hiddenParts: string[] = [];
      let maxCol = 0;

      for await (const rowOrBatch of worksheetReader) {
        if (aborted(ctx?.signal)) return timeoutFail(file);
        const batch = Array.isArray(rowOrBatch) ? rowOrBatch : [rowOrBatch];
        for (const row of batch) {
          maxCol = Math.max(maxCol, row.cellCount);
          const cells: string[] = [];
          for (let c = 1; c <= row.cellCount; c++) {
            const cell = row.getCell(c);
            const text = cellToString(cell.value);
            cells.push(text);
            if (text && isLikelyHiddenCell(cell)) hiddenParts.push(text);
          }
          rows.push(cells);
        }
      }

      for (const r of rows) {
        while (r.length < maxCol) r.push("");
      }
      sheets.push({ name: sheetName, rows, hiddenParts });
    }
  } catch (err) {
    if (aborted(ctx?.signal)) return timeoutFail(file);
    return fail(
      "PARSE",
      `Failed to extract "${file.relPath}": ${(err as Error).message}`,
    );
  }

  return sheetsToDocument(file, sheets);
}

async function extractXlsxBuffered(
  file: FileEntry,
  ctx?: ExtractContext,
): Promise<ExtractResult> {
  if (aborted(ctx?.signal)) return timeoutFail(file);
  let bytes: Buffer;
  try {
    bytes = await readFile(file.absPath);
  } catch (err) {
    return fail(
      "READ",
      `Could not read "${file.relPath}": ${(err as Error).message}. Check permissions and re-run scan.`,
    );
  }
  if (aborted(ctx?.signal)) return timeoutFail(file);

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(bytes as never);
  } catch (err) {
    return fail(
      "PARSE",
      `Failed to extract "${file.relPath}": ${(err as Error).message}`,
    );
  }

  const sheets: Array<{ name: string; rows: string[][]; hiddenParts: string[] }> = [];
  for (const sheet of workbook.worksheets) {
    if (aborted(ctx?.signal)) return timeoutFail(file);
    const rows: string[][] = [];
    const hiddenParts: string[] = [];
    let maxCol = 0;
    sheet.eachRow({ includeEmpty: false }, (row) => {
      maxCol = Math.max(maxCol, row.cellCount);
    });
    if (maxCol === 0) continue;
    sheet.eachRow({ includeEmpty: false }, (row) => {
      const cells: string[] = [];
      for (let c = 1; c <= maxCol; c++) {
        const cell = row.getCell(c);
        const text = cellToString(cell.value);
        cells.push(text);
        if (text && isLikelyHiddenCell(cell)) hiddenParts.push(text);
      }
      rows.push(cells);
    });
    sheets.push({ name: sheet.name, rows, hiddenParts });
  }
  return sheetsToDocument(file, sheets);
}

async function extractDocx(file: FileEntry, bytes: Buffer): Promise<ExtractResult> {
  // mammoth's convertToMarkdown exists at runtime; typings only list convertToHtml.
  const convertToMarkdown = (
    mammoth as unknown as {
      convertToMarkdown: (input: { buffer: Buffer }) => Promise<{ value: string }>;
    }
  ).convertToMarkdown;
  const result = await convertToMarkdown({ buffer: bytes });
  const content = result.value?.trim() ?? "";
  if (!content) {
    return fail("EMPTY", `Word document "${file.relPath}" has no extractable text.`);
  }
  return { ok: true, document: toDocument(file, content, []) };
}

async function extractPdf(file: FileEntry, bytes: Buffer): Promise<ExtractResult> {
  let pdf: Awaited<ReturnType<typeof getDocumentProxy>> | undefined;
  try {
    pdf = await getDocumentProxy(new Uint8Array(bytes));
    const { text } = await extractText(pdf, { mergePages: true });
    const content = String(text).trim();
    if (!content) {
      return fail(
        "EMPTY",
        `PDF "${file.relPath}" has no extractable text (scanned PDF). ` +
          `Enable the OCR plugin (extractor-ocr under plugins:) with Docker Docling, then retry "knot-sync run".`,
      );
    }
    return { ok: true, document: toDocument(file, content, []) };
  } catch (err) {
    return fail("PARSE", `PDF "${file.relPath}" could not be read: ${(err as Error).message}`);
  } finally {
    try {
      await (pdf as { destroy?: () => Promise<void> } | undefined)?.destroy?.();
    } catch {
      // ignore cleanup errors
    }
  }
}

function parseDelimitedLines(lines: string[], delimiter: string): TableData {
  if (lines.length === 0) return { headers: [], rows: [] };
  const split = (line: string) => line.split(delimiter).map((c) => c.trim());
  const headers = split(lines[0]!);
  const rows = lines.slice(1).map(split);
  return { headers, rows };
}

function tableToMarkdown(table: TableData): string {
  if (table.headers.length === 0) return "";
  const lines = [
    `| ${table.headers.map(escapeMdCell).join(" | ")} |`,
    `| ${table.headers.map(() => "---").join(" | ")} |`,
  ];
  for (const r of table.rows) {
    lines.push(
      `| ${table.headers.map((_, i) => escapeMdCell(r[i] ?? "")).join(" | ")} |`,
    );
  }
  return lines.join("\n");
}

async function readTextBounded(
  file: FileEntry,
  maxTextChars: number,
  signal?: AbortSignal,
): Promise<
  | { ok: true; text: string; truncated: boolean }
  | { ok: false; code: string; message: string }
> {
  // Binary stream + fatal UTF-8 decode (preserve ENCODING soft-fail for legacy encodings).
  const stream = createReadStream(file.absPath);
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let text = "";
  let truncated = false;

  const onAbort = () => {
    stream.destroy();
  };
  signal?.addEventListener("abort", onAbort, { once: true });

  try {
    for await (const chunk of stream) {
      if (aborted(signal)) {
        return {
          ok: false,
          code: "EXTRACT_TIMEOUT",
          message: `Extraction timed out for "${file.relPath}". Raise extraction.timeoutSeconds or exclude the file, then retry "knot-sync run".`,
        };
      }
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      let piece: string;
      try {
        piece = decoder.decode(buf, { stream: true });
      } catch (err) {
        return {
          ok: false,
          code: "ENCODING",
          message: `Could not decode "${file.relPath}" as UTF-8: ${(err as Error).message}. Convert the file to UTF-8 and re-run.`,
        };
      }
      if (piece.length === 0) continue;
      if (text.length + piece.length > maxTextChars) {
        text += piece.slice(0, Math.max(0, maxTextChars - text.length));
        truncated = true;
        break;
      }
      text += piece;
    }
    if (!truncated) {
      try {
        text += decoder.decode();
      } catch (err) {
        return {
          ok: false,
          code: "ENCODING",
          message: `Could not decode "${file.relPath}" as UTF-8: ${(err as Error).message}. Convert the file to UTF-8 and re-run.`,
        };
      }
    }
  } catch (err) {
    if (aborted(signal)) {
      return {
        ok: false,
        code: "EXTRACT_TIMEOUT",
        message: `Extraction timed out for "${file.relPath}". Raise extraction.timeoutSeconds or exclude the file, then retry "knot-sync run".`,
      };
    }
    return {
      ok: false,
      code: "READ",
      message: `Could not read "${file.relPath}": ${(err as Error).message || String(err)}. Check permissions and re-run scan.`,
    };
  } finally {
    signal?.removeEventListener("abort", onAbort);
    stream.destroy();
  }

  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  return { ok: true, text, truncated };
}

async function extractDelimited(
  file: FileEntry,
  delimiter: string,
  ctx?: ExtractContext,
): Promise<ExtractResult> {
  const maxTextChars = ctx?.maxTextChars ?? DEFAULT_EXTRACTION_CONFIG.maxTextChars;
  const read = await readTextBounded(file, maxTextChars, ctx?.signal);
  if (!read.ok) return read;
  const lines = read.text.split(/\r?\n/).filter((l) => l.length > 0);
  const table = parseDelimitedLines(lines, delimiter);
  if (table.headers.length === 0) {
    return fail("EMPTY", `Delimited file "${file.relPath}" is empty.`);
  }
  const extra: Record<string, string | number | boolean | null> = {};
  if (read.truncated) {
    extra.truncated = true;
    extra.truncationNote = `Content truncated at extraction.maxTextChars=${maxTextChars}.`;
  }
  return {
    ok: true,
    document: toDocument(file, tableToMarkdown(table) + "\n", [table], extra),
  };
}

async function extractPlainText(file: FileEntry, ctx?: ExtractContext): Promise<ExtractResult> {
  const maxTextChars = ctx?.maxTextChars ?? DEFAULT_EXTRACTION_CONFIG.maxTextChars;
  const read = await readTextBounded(file, maxTextChars, ctx?.signal);
  if (!read.ok) return read;
  if (read.text.trim() === "") {
    return fail("EMPTY", `Text file "${file.relPath}" is empty.`);
  }
  const extra: Record<string, string | number | boolean | null> = {};
  if (read.truncated) {
    extra.truncated = true;
    extra.truncationNote = `Content truncated at extraction.maxTextChars=${maxTextChars}.`;
  }
  return { ok: true, document: toDocument(file, read.text, [], extra) };
}

export async function extractOfficeFile(
  file: FileEntry,
  ctx?: ExtractContext,
): Promise<ExtractResult> {
  if (!(OFFICE_EXTENSIONS as readonly string[]).includes(file.ext)) {
    return fail(
      "UNSUPPORTED",
      `No office extractor for extension "${file.ext}" (${file.relPath}).`,
    );
  }

  const maxBytes = ctx?.maxFileSizeBytes;
  if (typeof maxBytes === "number" && maxBytes > 0 && file.size > maxBytes) {
    const mb = Math.round((maxBytes / (1024 * 1024)) * 10) / 10;
    return fail(
      "SKIPPED_TOO_LARGE",
      `Skipped "${file.relPath}" (${file.size} bytes) — over extraction.maxFileSizeMb=${mb}. Raise the limit or exclude the file, then retry "knot-sync run".`,
    );
  }

  if (aborted(ctx?.signal)) return timeoutFail(file);

  // Stream path for xlsx — no full buffer load.
  if (file.ext === ".xlsx") {
    try {
      return await extractXlsx(file, ctx);
    } catch (err) {
      if (aborted(ctx?.signal)) return timeoutFail(file);
      return fail(
        "PARSE",
        `Failed to extract "${file.relPath}": ${(err as Error).message}`,
      );
    }
  }

  // Delimited / plain — stream with maxTextChars.
  if (file.ext === ".csv") return extractDelimited(file, ",", ctx);
  if (file.ext === ".tsv") return extractDelimited(file, "\t", ctx);
  if (file.ext === ".txt" || file.ext === ".md") return extractPlainText(file, ctx);

  // docx / pdf still need a buffer (bounded by maxFileSizeMb).
  let bytes: Buffer;
  try {
    bytes = await readFile(file.absPath);
  } catch (err) {
    return fail(
      "READ",
      `Could not read "${file.relPath}": ${(err as Error).message}. Check permissions and re-run scan.`,
    );
  }

  if (aborted(ctx?.signal)) return timeoutFail(file);

  try {
    switch (file.ext) {
      case ".docx":
        return await extractDocx(file, bytes);
      case ".pdf":
        return await extractPdf(file, bytes);
      default:
        return fail(
          "UNSUPPORTED",
          `No office extractor for extension "${file.ext}" (${file.relPath}).`,
        );
    }
  } catch (err) {
    if (aborted(ctx?.signal)) return timeoutFail(file);
    return fail(
      "PARSE",
      `Failed to extract "${file.relPath}": ${(err as Error).message}`,
    );
  }
}

export const OFFICE_EXTENSIONS = [
  ".xlsx",
  ".docx",
  ".pdf",
  ".csv",
  ".tsv",
  ".txt",
  ".md",
] as const;
