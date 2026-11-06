import ExcelJS from "exceljs";
import { CatalogError } from "./load.js";
import { emptyLabel, type CatalogLabel } from "./types.js";

export interface DefinitionMapping {
  /** Worksheet name; when omitted, use the first sheet. */
  sheet?: string;
  /** Header cell text for physical column name (required). */
  physical: string;
  label_ja?: string;
  label_vi?: string;
  label_en?: string;
  description?: string;
}

export const DEFAULT_DEFINITION_MAPPING: DefinitionMapping = {
  sheet: "項目",
  physical: "物理名",
  label_ja: "論理名",
  label_vi: "Tên nghiệp vụ",
  label_en: "Business name",
  description: "説明",
};

export interface DefinitionRow {
  physical: string;
  label: CatalogLabel;
  description: string;
}

/** Map physical name (and optional table.physical) → definition row. */
export type DefinitionIndex = Map<string, DefinitionRow>;

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value).trim();
  }
  if (typeof value === "object" && "text" in value && typeof value.text === "string") {
    return value.text.trim();
  }
  if (typeof value === "object" && "result" in value) {
    return cellText(value.result as ExcelJS.CellValue);
  }
  return String(value).trim();
}

function headerIndex(row: ExcelJS.Row): Map<string, number> {
  const map = new Map<string, number>();
  row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const text = cellText(cell.value);
    if (text) map.set(text, colNumber);
  });
  return map;
}

/**
 * Read a テーブル定義書 / 項目定義書 workbook into an index keyed by physical name.
 */
export async function loadDefinitionExcel(
  path: string,
  mapping: DefinitionMapping = DEFAULT_DEFINITION_MAPPING,
): Promise<DefinitionIndex> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.readFile(path);
  } catch (err) {
    throw new CatalogError(
      `Cannot read definition Excel at ${path}: ${(err as Error).message}. ` +
        `Fix catalog.definition_excel or remove it from config.`,
    );
  }

  const sheet =
    (mapping.sheet ? workbook.getWorksheet(mapping.sheet) : undefined) ??
    workbook.worksheets[0];
  if (!sheet) {
    throw new CatalogError(
      `Definition Excel ${path} has no worksheets. Provide a valid workbook.`,
    );
  }

  const headerRow = sheet.getRow(1);
  const headers = headerIndex(headerRow);
  const physicalCol = headers.get(mapping.physical);
  if (!physicalCol) {
    throw new CatalogError(
      `Definition Excel ${path} sheet "${sheet.name}" is missing header "${mapping.physical}". ` +
        `Adjust catalog.definition_mapping.`,
    );
  }
  const jaCol = mapping.label_ja ? headers.get(mapping.label_ja) : undefined;
  const viCol = mapping.label_vi ? headers.get(mapping.label_vi) : undefined;
  const enCol = mapping.label_en ? headers.get(mapping.label_en) : undefined;
  const descCol = mapping.description ? headers.get(mapping.description) : undefined;

  const index: DefinitionIndex = new Map();
  const rowCount = sheet.rowCount ?? 0;
  for (let r = 2; r <= rowCount; r++) {
    const row = sheet.getRow(r);
    const physical = cellText(row.getCell(physicalCol).value);
    if (!physical) continue;
    const label = emptyLabel();
    if (jaCol) label.ja = cellText(row.getCell(jaCol).value);
    if (viCol) label.vi = cellText(row.getCell(viCol).value);
    if (enCol) label.en = cellText(row.getCell(enCol).value);
    const description = descCol ? cellText(row.getCell(descCol).value) : "";
    const entry: DefinitionRow = { physical, label, description };
    index.set(physical, entry);
    index.set(physical.toLowerCase(), entry);
  }
  return index;
}

/** Build a minimal definition workbook buffer for tests/examples. */
export async function buildDefinitionFixture(
  rows: Array<{
    physical: string;
    label_ja?: string;
    label_vi?: string;
    label_en?: string;
    description?: string;
  }>,
  mapping: DefinitionMapping = DEFAULT_DEFINITION_MAPPING,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet(mapping.sheet ?? "項目");
  sheet.addRow([
    mapping.physical,
    mapping.label_ja ?? "",
    mapping.label_vi ?? "",
    mapping.label_en ?? "",
    mapping.description ?? "",
  ]);
  for (const row of rows) {
    sheet.addRow([
      row.physical,
      row.label_ja ?? "",
      row.label_vi ?? "",
      row.label_en ?? "",
      row.description ?? "",
    ]);
  }
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
