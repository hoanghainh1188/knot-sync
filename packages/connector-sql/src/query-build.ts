import { quoteIdent, type SqlDialect } from "./quote.js";

export type QueryFilter =
  | { op: "eq"; column: string; value: string | number | boolean | null }
  | { op: "in"; column: string; values: Array<string | number | boolean> }
  | { op: "range"; column: string; min?: string | number; max?: string | number }
  | { op: "contains"; column: string; value: string }
  | { op: "starts_with"; column: string; value: string }
  | { op: "between_dates"; column: string; from: string; to: string }
  | { op: "is_null"; column: string; value: boolean };

export type SortDirection = "asc" | "desc";

export interface QueryOrderBy {
  column: string;
  dir?: SortDirection;
}

export type AggregateFunc = "count" | "sum" | "avg" | "min" | "max";

export interface QueryAggregation {
  func: AggregateFunc;
  column: string;
  as?: string;
}

export const DEFAULT_QUERY_LIMIT = 50;
export const MAX_QUERY_LIMIT = 200;

const ALIAS_RE = /^[A-Za-z_][A-Za-z0-9_]{0,62}$/;
const ALLOWED_AGG_FUNCS = new Set<AggregateFunc>(["count", "sum", "avg", "min", "max"]);

function deriveColumnAggAlias(func: AggregateFunc, column: string): string {
  const clean = column.replace(/[^A-Za-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
  const base = clean ? `${func}_${clean}` : `${func}_col`;
  return base.slice(0, 63);
}

/**
 * Validate aggregations & groupBy columns and resolve deterministic output aliases.
 * Rejects disallowed columns, wildcard on non-count aggregates, invalid ASCII aliases,
 * and duplicate output names across grouped columns and aggregate aliases.
 */
export function planAggregations(
  aggregations: QueryAggregation[],
  groupBy: string[] = [],
  options?: { allowedColumns?: Set<string>; table?: string },
): Array<{ agg: QueryAggregation; alias: string }> {
  const tableLabel = options?.table ?? "";
  const allowedColumns = options?.allowedColumns;
  const usedNames = new Set<string>();

  for (const col of groupBy) {
    if (allowedColumns && !allowedColumns.has(col)) {
      throw new Error(
        `Group-by column "${col}" is not allow-listed for table "${tableLabel}".`,
      );
    }
    if (usedNames.has(col)) {
      throw new Error(`Duplicate groupBy column "${col}" in SELECT projection.`);
    }
    usedNames.add(col);
  }

  for (const agg of aggregations) {
    if (!ALLOWED_AGG_FUNCS.has(agg.func)) {
      throw new Error(`Unsupported aggregation function: "${String(agg.func)}".`);
    }
    if (agg.column === "*") {
      if (agg.func !== "count") {
        throw new Error(
          `Wildcard "*" is only supported for "count" aggregations, not "${agg.func}".`,
        );
      }
    } else if (allowedColumns && !allowedColumns.has(agg.column)) {
      throw new Error(
        `Aggregation column "${agg.column}" is not allow-listed for table "${tableLabel}".`,
      );
    }
    if (agg.as !== undefined) {
      if (typeof agg.as !== "string" || !ALIAS_RE.test(agg.as)) {
        throw new Error(
          `Invalid aggregation alias "${String(agg.as)}". Expected an ASCII identifier matching /^[A-Za-z_][A-Za-z0-9_]{0,62}$/.`,
        );
      }
      if (usedNames.has(agg.as)) {
        throw new Error(`Duplicate output alias "${agg.as}" in SELECT projection.`);
      }
      usedNames.add(agg.as);
    }
  }

  return aggregations.map((agg) => {
    if (agg.as !== undefined) {
      return { agg, alias: agg.as };
    }
    const base =
      agg.column === "*" ? "count_all" : deriveColumnAggAlias(agg.func, agg.column);
    let candidate = base;
    let suffix = 1;
    while (usedNames.has(candidate)) {
      const tag = `_${suffix++}`;
      candidate = `${base.slice(0, 63 - tag.length)}${tag}`;
    }
    usedNames.add(candidate);
    return { agg, alias: candidate };
  });
}

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

function escapeLike(s: string, dialect: SqlDialect): string {
  // Backslash escape; callers must append ESCAPE '\' for non-MySQL dialects
  // that do not treat \ as default. Also escape '[' for mssql/access LIKE classes.
  if (dialect === "mssql" || dialect === "access") {
    return s.replace(/([\\%_[\]])/g, "\\$1");
  }
  return s.replace(/([\\%_])/g, "\\$1");
}

function likeClause(col: string, ph: string, dialect: SqlDialect): string {
  // MySQL treats \ as default escape; others need an explicit ESCAPE clause.
  if (dialect === "mysql") {
    return `${col} LIKE ${ph}`;
  }
  return `${col} LIKE ${ph} ESCAPE '\\'`;
}

/** Accept ISO date or datetime prefixes for between_dates bounds. */
function isIsoDateBound(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}([T ][\d:.+-Z]*)?$/.test(s);
}

function nextPlaceholder(dialect: SqlDialect, index: number): string {
  if (dialect === "postgres") return `$${index}`;
  if (dialect === "oracle") return `:${index}`;
  return "?";
}

function buildOrderByClauses(
  orderBy: QueryOrderBy[],
  isAggregateMode: boolean,
  groupBySet: Set<string>,
  aggAliasSet: Set<string>,
  allowedColumns: Set<string>,
  dialect: SqlDialect,
  table: string,
): string[] {
  const clauses: string[] = [];
  for (const o of orderBy) {
    const dir = o.dir ?? "asc";
    if (dir !== "asc" && dir !== "desc") {
      throw new Error(
        `Invalid orderBy direction "${String(o.dir)}". Expected "asc" or "desc".`,
      );
    }
    if (isAggregateMode) {
      if (!groupBySet.has(o.column) && !aggAliasSet.has(o.column)) {
        throw new Error(
          `Order-by column "${o.column}" must be a grouped column or aggregation alias for table "${table}".`,
        );
      }
    } else if (!allowedColumns.has(o.column)) {
      throw new Error(
        `Order-by column "${o.column}" is not allow-listed for table "${table}".`,
      );
    }
    clauses.push(`${quoteIdent(o.column, dialect)} ${dir === "desc" ? "DESC" : "ASC"}`);
  }
  return clauses;
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
  groupBy?: string[];
  aggregations?: QueryAggregation[];
  orderBy?: QueryOrderBy[];
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
  const groupBy = options.groupBy ?? [];
  const aggregations = options.aggregations ?? [];
  const orderBy = options.orderBy ?? [];
  const isAggregateMode = groupBy.length > 0 || aggregations.length > 0;

  const plannedAggs = planAggregations(aggregations, groupBy, {
    allowedColumns,
    table,
  });
  const orderByClauses = buildOrderByClauses(
    orderBy,
    isAggregateMode,
    new Set(groupBy),
    new Set(plannedAggs.map((p) => p.alias)),
    allowedColumns,
    dialect,
    table,
  );

  const limitRaw = options.limit ?? DEFAULT_QUERY_LIMIT;
  const limit = Math.max(1, Math.min(MAX_QUERY_LIMIT, Math.floor(limitRaw)));

  const colsSql = isAggregateMode
    ? [
        ...groupBy.map((c) => quoteIdent(c, dialect)),
        ...plannedAggs.map(({ agg, alias }) => {
          const funcSql = agg.func.toUpperCase();
          const argSql = agg.column === "*" ? "*" : quoteIdent(agg.column, dialect);
          return `${funcSql}(${argSql}) AS ${quoteIdent(alias, dialect)}`;
        }),
      ].join(", ")
    : selectColumns.map((c) => quoteIdent(c, dialect)).join(", ");
  const tableSql = quoteTableRef(table, dialect, options.schema);
  const values: unknown[] = [];
  const where: string[] = [];
  let p = 1;

  const ph = () => nextPlaceholder(dialect, p++);

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
        where.push(likeClause(col, ph(), dialect));
        values.push(`%${escapeLike(f.value, dialect)}%`);
        break;
      }
      case "starts_with": {
        if (typeof f.value !== "string" || f.value === "") {
          throw new Error(
            `starts_with filter on "${f.column}" requires a non-empty string value.`,
          );
        }
        where.push(likeClause(col, ph(), dialect));
        values.push(`${escapeLike(f.value, dialect)}%`);
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
  const groupBySql =
    groupBy.length > 0
      ? ` GROUP BY ${groupBy.map((c) => quoteIdent(c, dialect)).join(", ")}`
      : "";
  const orderBySql =
    orderByClauses.length > 0 ? ` ORDER BY ${orderByClauses.join(", ")}` : "";

  // MSSQL / Access: TOP with a clamped integer (safe; never from user SQL).
  if (dialect === "mssql" || dialect === "access") {
    const text =
      `SELECT TOP ${limit} ${colsSql} FROM ${tableSql}${whereSql}${groupBySql}${orderBySql}`;
    return { text, values, limit };
  }

  // Oracle: FETCH FIRST :n ROWS ONLY (12c+). AS400/Db2 i: literal only.
  if (dialect === "oracle") {
    const limitPh = ph();
    values.push(limit);
    const text =
      `SELECT ${colsSql} FROM ${tableSql}${whereSql}${groupBySql}${orderBySql} FETCH FIRST ${limitPh} ROWS ONLY`;
    return { text, values, limit };
  }
  if (dialect === "as400") {
    const text =
      `SELECT ${colsSql} FROM ${tableSql}${whereSql}${groupBySql}${orderBySql} FETCH FIRST ${limit} ROWS ONLY`;
    return { text, values, limit };
  }

  const limitPh = ph();
  values.push(limit);
  const text = `SELECT ${colsSql} FROM ${tableSql}${whereSql}${groupBySql}${orderBySql} LIMIT ${limitPh}`;
  return { text, values, limit };
}
