import { quoteIdent, type SqlDialect } from "./quote.js";

export type QueryFilter =
  | { op: "eq"; column: string; value: string | number | boolean | null }
  | { op: "in"; column: string; values: Array<string | number | boolean> }
  | { op: "range"; column: string; min?: string | number; max?: string | number }
  | { op: "contains"; column: string; value: string };

export const DEFAULT_QUERY_LIMIT = 50;
export const MAX_QUERY_LIMIT = 200;

export interface BuiltQuery {
  text: string;
  values: unknown[];
  limit: number;
}

/**
 * Build a parameterized SELECT for an allow-listed table/columns.
 * `allowedColumns` must be the exact allow-list for the table.
 */
export function buildSelectQuery(options: {
  dialect: SqlDialect;
  table: string;
  selectColumns: string[];
  allowedColumns: Set<string>;
  filters?: QueryFilter[];
  limit?: number;
}): BuiltQuery {
  const { dialect, table, selectColumns, allowedColumns } = options;
  for (const col of selectColumns) {
    if (!allowedColumns.has(col)) {
      throw new Error(`Column "${col}" is not allow-listed for table "${table}".`);
    }
  }
  const limitRaw = options.limit ?? DEFAULT_QUERY_LIMIT;
  const limit = Math.max(1, Math.min(MAX_QUERY_LIMIT, Math.floor(limitRaw)));

  const colsSql = selectColumns.map((c) => quoteIdent(c, dialect)).join(", ");
  const tableSql = quoteIdent(table, dialect);
  const values: unknown[] = [];
  const where: string[] = [];
  let p = 1;

  const ph = () => (dialect === "postgres" ? `$${p++}` : "?");

  for (const f of options.filters ?? []) {
    if (!allowedColumns.has(f.column)) {
      throw new Error(
        `Filter column "${f.column}" is not allow-listed for table "${table}".`,
      );
    }
    const col = quoteIdent(f.column, dialect);
    if (f.op === "eq") {
      if (f.value === null) {
        where.push(`${col} IS NULL`);
      } else {
        where.push(`${col} = ${ph()}`);
        values.push(f.value);
      }
    } else if (f.op === "in") {
      if (f.values.length === 0) {
        where.push("1 = 0");
      } else {
        const placeholders = f.values.map(() => ph());
        where.push(`${col} IN (${placeholders.join(", ")})`);
        values.push(...f.values);
      }
    } else if (f.op === "range") {
      if (f.min !== undefined) {
        where.push(`${col} >= ${ph()}`);
        values.push(f.min);
      }
      if (f.max !== undefined) {
        where.push(`${col} <= ${ph()}`);
        values.push(f.max);
      }
    } else if (f.op === "contains") {
      where.push(`${col} LIKE ${ph()}`);
      values.push(`%${escapeLike(f.value)}%`);
    }
  }

  const whereSql = where.length > 0 ? ` WHERE ${where.join(" AND ")}` : "";
  const limitPh = ph();
  values.push(limit);
  const text = `SELECT ${colsSql} FROM ${tableSql}${whereSql} LIMIT ${limitPh}`;
  return { text, values, limit };
}

function escapeLike(s: string): string {
  return s.replace(/([\\%_])/g, "\\$1");
}
