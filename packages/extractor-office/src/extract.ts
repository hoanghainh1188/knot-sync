import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import ExcelJS from "exceljs";
import mammoth from "mammoth";
import { extractText, getDocumentProxy } from "unpdf";
import {
  documentId,
  sha256,
  type Document,
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

async function extractXlsx(file: FileEntry, bytes: Buffer): Promise<ExtractResult> {
  const workbook = new ExcelJS.Workbook();
  // exceljs typings disagree with Node's Buffer; runtime accepts Node Buffer.
  await workbook.xlsx.load(bytes as never);
  const tables: TableData[] = [];
  const parts: string[] = [];
  const hiddenParts: string[] = [];

  for (const sheet of workbook.worksheets) {
    const rows: string[][] = [];
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
    if (rows.length === 0) continue;
    const headers = rows[0] ?? [];
    const body = rows.slice(1);
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
        `PDF "${file.relPath}" has no extractable text (scanned PDFs need OCR, which is out of scope).`,
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

function parseDelimited(text: string, delimiter: string): TableData {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.length > 0);
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

type Utf8Decode = { ok: true; text: string } | { ok: false; code: string; message: string };

function decodeUtf8(file: FileEntry, bytes: Buffer): Utf8Decode {
  try {
    return { ok: true, text: new TextDecoder("utf-8", { fatal: true }).decode(bytes) };
  } catch (err) {
    return {
      ok: false,
      code: "ENCODING",
      message: `Could not decode "${file.relPath}" as UTF-8: ${(err as Error).message}. Convert the file to UTF-8 and re-run.`,
    };
  }
}

async function extractDelimited(
  file: FileEntry,
  bytes: Buffer,
  delimiter: string,
): Promise<ExtractResult> {
  const decoded = decodeUtf8(file, bytes);
  if (!decoded.ok) return decoded;
  const table = parseDelimited(decoded.text, delimiter);
  if (table.headers.length === 0) {
    return fail("EMPTY", `Delimited file "${file.relPath}" is empty.`);
  }
  return {
    ok: true,
    document: toDocument(file, tableToMarkdown(table) + "\n", [table]),
  };
}

async function extractPlainText(file: FileEntry, bytes: Buffer): Promise<ExtractResult> {
  const decoded = decodeUtf8(file, bytes);
  if (!decoded.ok) return decoded;
  if (decoded.text.trim() === "") {
    return fail("EMPTY", `Text file "${file.relPath}" is empty.`);
  }
  return { ok: true, document: toDocument(file, decoded.text, []) };
}

export async function extractOfficeFile(file: FileEntry): Promise<ExtractResult> {
  if (!(OFFICE_EXTENSIONS as readonly string[]).includes(file.ext)) {
    return fail(
      "UNSUPPORTED",
      `No office extractor for extension "${file.ext}" (${file.relPath}).`,
    );
  }

  let bytes: Buffer;
  try {
    bytes = await readFile(file.absPath);
  } catch (err) {
    return fail(
      "READ",
      `Could not read "${file.relPath}": ${(err as Error).message}. Check permissions and re-run scan.`,
    );
  }

  try {
    switch (file.ext) {
      case ".xlsx":
        return await extractXlsx(file, bytes);
      case ".docx":
        return await extractDocx(file, bytes);
      case ".pdf":
        return await extractPdf(file, bytes);
      case ".csv":
        return await extractDelimited(file, bytes, ",");
      case ".tsv":
        return await extractDelimited(file, bytes, "\t");
      case ".txt":
      case ".md":
        return await extractPlainText(file, bytes);
      default:
        return fail(
          "UNSUPPORTED",
          `No office extractor for extension "${file.ext}" (${file.relPath}).`,
        );
    }
  } catch (err) {
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
