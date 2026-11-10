/**
 * Convert `?` positional placeholders to driver-specific bind names.
 * Leaves `:n` / `$n` untouched when already present.
 */
export function rewriteQuestionMarks(
  text: string,
  style: "at" | "colon",
): { text: string; names: string[] } {
  const names: string[] = [];
  let i = 0;
  const rewritten = text.replace(/\?/g, () => {
    i += 1;
    const name = style === "at" ? `p${i}` : String(i);
    names.push(name);
    return style === "at" ? `@${name}` : `:${name}`;
  });
  return { text: rewritten, names };
}
