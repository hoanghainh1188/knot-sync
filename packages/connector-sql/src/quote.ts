/** Dialect-aware SQL identifier quoting (allow-listed names only). */

export type SqlDialect = "postgres" | "mysql";

/** Quote an identifier that already passed allow-list exact match. */
export function quoteIdent(name: string, dialect: SqlDialect): string {
  if (dialect === "postgres") {
    return `"${name.replace(/"/g, '""')}"`;
  }
  return `\`${name.replace(/`/g, "``")}\``;
}
