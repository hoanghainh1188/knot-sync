import { quoteIdent, type SqlDialect } from "./quote.js";

export type QueryFilter =
  | { op: "eq"; column: string; value: string | number | boolean | null }
  | { op: "in"; column: string; values: Array<string | number | boolean> }
  | { op: "range"; column: string; min?: string | number; max?: string | number }
  | { op: "contains"; column: string; value: string }
  | { op: "starts_with"; column: string; value: string }
  | { op: "between_dates"; column: string; from: string; to: string }
  | { op: "is_null"; column: string; value: boolean };

export const DEFAULT_QUERY_LIMIT = 50;
export const MAX_QUERY_LIMIT = 200;

export interface BuiltQuery {
  text: string;
  values: unknown[];
  limit: number;
}

/** Quote a table reference, optionally schema-qualified (Postgres). */
export function quoteTableRef(
  table: string,
  dialect: SqlDialect,
  schema?: string,
): string {
  if (schema && schema.trim() !== "") {
    return `${quoteIdent(schema.trim(), dialect)}.${quoteIdent(table, dialect)}`;
  }
  return quoteIdent(table, dialect);
}

function escapeLike(s: string): string {
  return s.replace(/([\\%_])/g, "\\$1");
}

/** Accept ISO date or datetime prefixes for between_dates bounds. */
function isIsoDateBound(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}([T ][\d:.+-Z]*)?$/.test(s);
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
  /** Postgres schema for FROM qualification. */
  schema?: string;
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
  const tableSql = quoteTableRef(table, dialect, options.schema);
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
    switch (f.op) {
      case "eq": {
        if (f.value === null) {
          where.push(`${col} IS NULL`);
        } else {
          where.push(`${col} = ${ph()}`);
          values.push(f.value);
        }
        break;
      }
      case "in": {
        if (f.values.length === 0) {
          where.push("1 = 0");
        } else {
          const placeholders = f.values.map(() => ph());
          where.push(`${col} IN (${placeholders.join(", ")})`);
          values.push(...f.values);
        }
        break;
      }
      case "range": {
        if (f.min !== undefined) {
          where.push(`${col} >= ${ph()}`);
          values.push(f.min);
        }
        if (f.max !== undefined) {
          where.push(`${col} <= ${ph()}`);
          values.push(f.max);
        }
        break;
      }
      case "contains": {
        where.push(`${col} LIKE ${ph()}`);
        values.push(`%${escapeLike(f.value)}%`);
        break;
      }
      case "starts_with": {
        if (typeof f.value !== "string" || f.value === "") {
          throw new Error(
            `starts_with filter on "${f.column}" requires a non-empty string value.`,
          );
        }
        where.push(`${col} LIKE ${ph()}`);
        values.push(`${escapeLike(f.value)}%`);
        break;
      }
      case "between_dates": {
        const from = typeof f.from === "string" ? f.from.trim() : "";
        const to = typeof f.to === "string" ? f.to.trim() : "";
        if (!isIsoDateBound(from) || !isIsoDateBound(to)) {
          throw new Error(
            `between_dates filter on "${f.column}" requires ISO date/datetime strings ` +
              `(YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS...) for both "from" and "to".`,
          );
        }
        if (from > to) {
          throw new Error(
            `between_dates filter on "${f.column}" requires "from" <= "to" (got ${from} > ${to}).`,
          );
        }
        where.push(`${col} >= ${ph()}`);
        values.push(from);
        where.push(`${col} <= ${ph()}`);
        values.push(to);
        break;
      }
      case "is_null": {
        // `value` is boolean on QueryFilter; coerce for MCP payloads that bypass typing.
        const isNull = Boolean(f.value);
        where.push(isNull ? `${col} IS NULL` : `${col} IS NOT NULL`);
        break;
      }
      default: {
        const _exhaustive: never = f;
        throw new Error(`Unsupported filter op: ${JSON.stringify(_exhaustive)}`);
      }
    }
  }

  const whereSql = where.length > 0 ? ` WHERE ${where.join(" AND ")}` : "";
  const limitPh = ph();
  values.push(limit);
  const text = `SELECT ${colsSql} FROM ${tableSql}${whereSql} LIMIT ${limitPh}`;
  return { text, values, limit };
}
