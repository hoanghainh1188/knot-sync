import type { TableData } from "@hoanghainh/knot-sync-core";
import { looksLikeLabel, type SheetGrid } from "./detect.js";

function normalizeLabel(text: string): string {
  return text.replace(/[：:\s]+$/u, "").trim();
}

/**
 * Build structured Markdown + key/value table from a form-like sheet grid.
 */
export function emitFormDocumentParts(grids: SheetGrid[]): {
  markdown: string;
  tables: TableData[];
} {
  const parts: string[] = [];
  const tables: TableData[] = [];

  for (const grid of grids) {
    const pairs: Array<{ label: string; value: string }> = [];
    const used = new Set<string>();

    for (const [r, rowMap] of [...grid.cells.entries()].sort((a, b) => a[0] - b[0])) {
      for (const [c, text] of [...rowMap.entries()].sort((a, b) => a[0] - b[0])) {
        if (!looksLikeLabel(text)) continue;
        const label = normalizeLabel(text);
        const right = rowMap.get(c + 1);
        const below = grid.cells.get(r + 1)?.get(c);
        let value = "";
        if (right !== undefined && right !== "" && !looksLikeLabel(right)) {
          value = right;
          used.add(`${r}:${c + 1}`);
        } else if (
          (right === undefined || right === "") &&
          below !== undefined &&
          below !== "" &&
          !looksLikeLabel(below)
        ) {
          value = below;
          used.add(`${r + 1}:${c}`);
        } else {
          continue;
        }
        used.add(`${r}:${c}`);
        pairs.push({ label, value });
      }
    }

    // Title: merged row-1 banner (same text across cols) or first non-label cell
    let title = grid.name;
    const row1 = grid.cells.get(1);
    if (row1 && row1.size >= 1) {
      const uniq = [...new Set(row1.values())];
      if (uniq.length === 1 && uniq[0]) {
        title = uniq[0]!;
      } else {
        const first = uniq.find((t) => t && !looksLikeLabel(t));
        if (first) title = first;
      }
    }

    parts.push(`## ${title}\n`);
    if (pairs.length === 0) {
      // Fallback: dump remaining filled cells as bullet lines
      for (const [r, rowMap] of [...grid.cells.entries()].sort((a, b) => a[0] - b[0])) {
        for (const [c, text] of [...rowMap.entries()].sort((a, b) => a[0] - b[0])) {
          if (used.has(`${r}:${c}`)) continue;
          parts.push(`- ${text}`);
        }
      }
      parts.push("");
      continue;
    }

    for (const p of pairs) {
      parts.push(`- **${p.label}**: ${p.value}`);
    }
    parts.push("");

    tables.push({
      name: title,
      headers: ["項目", "値"],
      rows: pairs.map((p) => [p.label, p.value]),
    });
  }

  return { markdown: parts.join("\n").trimEnd() + "\n", tables };
}
