import type { TableData } from "@hoanghainh/knot-sync-core";

/**
 * Collapse redundant horizontal whitespace inside lines (preserve Markdown indent).
 * Collapse 3+ blank lines to one blank line.
 */
export function reduceWhitespace(text: string): string {
  return text
    .replace(/[^\S\n]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^\n+/, "")
    .replace(/\n+$/, "\n");
}

function isBlankRow(row: string[]): boolean {
  return row.every((c) => c.trim() === "");
}

/** Drop wholly empty rows; drop trailing wholly empty columns. */
export function reduceTables(tables: TableData[]): TableData[] {
  return tables.map((table) => {
    const rows = table.rows.filter((r) => !isBlankRow(r));
    if (rows.length === 0 && table.headers.every((h) => h.trim() === "")) {
      return { ...table, headers: [], rows: [] };
    }
    let width = Math.max(table.headers.length, ...rows.map((r) => r.length), 0);
    while (width > 0) {
      const col = width - 1;
      const headerEmpty = (table.headers[col] ?? "").trim() === "";
      const rowsEmpty = rows.every((r) => (r[col] ?? "").trim() === "");
      if (!headerEmpty || !rowsEmpty) break;
      width -= 1;
    }
    return {
      ...table,
      headers: table.headers.slice(0, width),
      rows: rows.map((r) => r.slice(0, width)),
    };
  });
}

/**
 * Strip header/footer lines repeated across page-like segments.
 * Segments split on form-feed, ---/___ markers, or triple newlines.
 */
export function stripRepeatedHeadersFooters(text: string): string {
  const parts = text.split(/\f|(?:\r?\n)(?:---+|___+)(?:\r?\n)|(?:\r?\n){3,}/);
  if (parts.length < 3) return text;

  const firstLines = parts.map((p) => (p.split(/\r?\n/).find((l) => l.trim() !== "") ?? "").trim());
  const lastLines = parts.map((p) => {
    const lines = p.split(/\r?\n/).filter((l) => l.trim() !== "");
    return (lines[lines.length - 1] ?? "").trim();
  });

  const header = firstLines[0]!;
  const footer = lastLines[0]!;
  const headerRepeated = header !== "" && firstLines.every((l) => l === header);
  const footerRepeated = footer !== "" && lastLines.every((l) => l === footer);

  if (!headerRepeated && !footerRepeated) return text;

  return parts
    .map((part, idx) => {
      let lines = part.split(/\r?\n/);
      if (headerRepeated) {
        const hi = lines.findIndex((l) => l.trim() !== "");
        if (hi >= 0 && lines[hi]!.trim() === header && idx > 0) {
          lines = [...lines.slice(0, hi), ...lines.slice(hi + 1)];
        }
      }
      if (footerRepeated) {
        for (let i = lines.length - 1; i >= 0; i--) {
          if (lines[i]!.trim() === "") continue;
          if (lines[i]!.trim() === footer && idx > 0) {
            lines = [...lines.slice(0, i), ...lines.slice(i + 1)];
          }
          break;
        }
      }
      return lines.join("\n");
    })
    .join("\n\n");
}

export function tokenReduceContent(text: string): string {
  return reduceWhitespace(stripRepeatedHeadersFooters(text));
}
