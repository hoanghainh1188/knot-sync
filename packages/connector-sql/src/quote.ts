/** Dialect-aware SQL identifier quoting (allow-listed names only). */

export type SqlDialect =
  | "postgres"
  | "mysql"
  | "mssql"
  | "oracle"
  | "access"
  | "as400";

/** Quote an identifier that already passed allow-list exact match. */
export function quoteIdent(name: string, dialect: SqlDialect): string {
  if (dialect === "mysql") {
    return `\`${name.replace(/`/g, "``")}\``;
  }
  if (dialect === "mssql" || dialect === "access") {
    return `[${name.replace(/]/g, "]]")}]`;
  }
  // postgres, oracle, as400 — ANSI double quotes
  return `"${name.replace(/"/g, '""')}"`;
}
