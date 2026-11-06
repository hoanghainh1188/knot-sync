import type { TableData } from "@hoanghainh/knot-sync-core";

/** Rough token estimate for future `bench` (not a vendor tokenizer). */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil([...text].length / 4);
}

export function flattenDocumentText(content: string, tables: TableData[]): string {
  const parts = [content];
  for (const table of tables) {
    if (table.name) parts.push(table.name);
    parts.push(...table.headers);
    for (const row of table.rows) parts.push(...row);
  }
  return parts.join("\n");
}
