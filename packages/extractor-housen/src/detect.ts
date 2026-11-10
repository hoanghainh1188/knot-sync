import type ExcelJS from "exceljs";

/** Common Japanese form / ops-sheet labels. */
export const JP_FORM_LABELS = [
  "氏名",
  "名前",
  "日付",
  "期間",
  "金額",
  "所属",
  "申請",
  "請求",
  "請求日",
  "住所",
  "電話",
  "部署",
  "社員",
  "理由",
  "備考",
  "承認",
  "休暇",
] as const;

export interface SheetGrid {
  name: string;
  /** Sparse map row → col → text */
  cells: Map<number, Map<number, string>>;
  rowCount: number;
  colCount: number;
  mergedCount: number;
}

export interface FormScore {
  score: number;
  sparsity: number;
  mergeRatio: number;
  labelValuePairs: number;
  lexiconHits: number;
  filled: number;
}

function cellText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    const v = value as Record<string, unknown>;
    if ("richText" in v && Array.isArray(v.richText)) {
      return (v.richText as { text?: string }[]).map((p) => p.text ?? "").join("").trim();
    }
    if ("text" in v && typeof v.text === "string") return v.text.trim();
    if ("result" in v) return cellText(v.result);
  }
  return String(value).trim();
}

export function worksheetToGrid(sheet: ExcelJS.Worksheet): SheetGrid {
  const cells = new Map<number, Map<number, string>>();
  let maxRow = 0;
  let maxCol = 0;
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const text = cellText(cell.value);
      if (!text) return;
      let rowMap = cells.get(rowNumber);
      if (!rowMap) {
        rowMap = new Map();
        cells.set(rowNumber, rowMap);
      }
      rowMap.set(colNumber, text);
      if (rowNumber > maxRow) maxRow = rowNumber;
      if (colNumber > maxCol) maxCol = colNumber;
    });
  });

  const merges = sheet.model?.merges;
  const mergedCount = Array.isArray(merges) ? merges.length : 0;

  return {
    name: sheet.name || "Sheet",
    cells,
    rowCount: maxRow,
    colCount: maxCol,
    mergedCount,
  };
}

export function looksLikeLabel(text: string): boolean {
  const raw = text.trim();
  if (!raw) return false;
  // Trailing full-width/half-width colon is a strong form-label signal.
  if (/[：:]\s*$/u.test(raw)) return true;
  const t = raw.replace(/[：:\s]+$/u, "").trim();
  if (!t) return false;
  // Lexicon: exact match or label is a short prefix of a known form word.
  if (JP_FORM_LABELS.some((l) => t === l || (t.length <= 6 && l.startsWith(t)))) {
    return true;
  }
  if (JP_FORM_LABELS.some((l) => t.includes(l) && t.length <= l.length + 2)) {
    return true;
  }
  return false;
}

/**
 * Score how form-like a sheet is. Higher = more 方眼紙 / application-form layout.
 * Dense rectangular tables score low.
 */
export function scoreFormLikeness(grid: SheetGrid): FormScore {
  const { rowCount, colCount, cells, mergedCount } = grid;
  if (rowCount === 0 || colCount === 0) {
    return {
      score: 0,
      sparsity: 0,
      mergeRatio: 0,
      labelValuePairs: 0,
      lexiconHits: 0,
      filled: 0,
    };
  }

  let filled = 0;
  for (const row of cells.values()) filled += row.size;
  const capacity = Math.max(1, rowCount * colCount);
  const sparsity = 1 - filled / capacity;

  const mergeRatio = Math.min(1, mergedCount / Math.max(1, filled));

  let labelValuePairs = 0;
  let lexiconHits = 0;
  for (const [r, rowMap] of cells) {
    for (const [c, text] of rowMap) {
      if (JP_FORM_LABELS.some((l) => text.includes(l))) lexiconHits += 1;
      if (!looksLikeLabel(text)) continue;
      const right = rowMap.get(c + 1);
      const below = cells.get(r + 1)?.get(c);
      // Label with value to the right (common JP form) or empty right + value below
      if (right !== undefined && right !== "" && !looksLikeLabel(right)) {
        labelValuePairs += 1;
      } else if (
        (right === undefined || right === "") &&
        below !== undefined &&
        below !== "" &&
        !looksLikeLabel(below)
      ) {
        labelValuePairs += 1;
      }
    }
  }

  const pairRatio = Math.min(1, labelValuePairs / Math.max(1, filled * 0.35));
  const lexiconRatio = Math.min(1, lexiconHits / Math.max(1, filled * 0.25));

  // Dense tables: low sparsity, few merges, few label/value pairs → low score
  const score =
    0.35 * sparsity + 0.2 * mergeRatio + 0.3 * pairRatio + 0.15 * lexiconRatio;

  return {
    score: Math.min(1, score),
    sparsity,
    mergeRatio,
    labelValuePairs,
    lexiconHits,
    filled,
  };
}

/** True when any sheet scores at or above threshold. */
export function workbookLooksLikeForm(
  grids: SheetGrid[],
  threshold: number,
): { formLike: boolean; best: FormScore | undefined } {
  let best: FormScore | undefined;
  for (const g of grids) {
    const s = scoreFormLikeness(g);
    if (!best || s.score > best.score) best = s;
  }
  return {
    formLike: best !== undefined && best.score >= threshold,
    best,
  };
}
