const UNITS = ["B", "KB", "MB", "GB", "TB"];

export function formatBytes(bytes: number): string {
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${unit === 0 ? value : value.toFixed(1)} ${UNITS[unit]}`;
}

export function formatCount(n: number): string {
  return n.toLocaleString("en-US");
}

/** Simple left/right aligned text table. Column 0 left, others right. */
export function table(rows: string[][], indent = "  "): string {
  const widths: number[] = [];
  for (const row of rows) {
    row.forEach((cell, i) => {
      widths[i] = Math.max(widths[i] ?? 0, [...cell].length);
    });
  }
  return rows
    .map(
      (row) =>
        indent +
        row
          .map((cell, i) => {
            const pad = " ".repeat((widths[i] ?? 0) - [...cell].length);
            return i === 0 ? cell + pad : pad + cell;
          })
          .join("   "),
    )
    .join("\n");
}
