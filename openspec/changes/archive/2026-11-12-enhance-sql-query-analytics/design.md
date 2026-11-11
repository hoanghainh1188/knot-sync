# Design

## Context

`packages/connector-sql` builds bounded, parameterized SQL queries for `postgres` and `mysql`, and `packages/connector-sql-enterprise` shares `buildSelectQuery` / `handleQueryTable` for `mssql`, `oracle`, `access`, and `as400`. `packages/mcp-server` wraps `query_table` with a Zod `queryTableInput` schema and JSONL audit logging. See `proposal.md` for motivation.

## Goals / Non-Goals

**Goals:**
- Support allow-listed `orderBy`, `groupBy`, and safe `COUNT`/`SUM`/`AVG`/`MIN`/`MAX` aggregations in `query-build.ts` across all 6 dialects (`postgres`, `mysql`, `mssql`, `oracle`, `access`, `as400`).
- Resolve physical names and unique Semantic Catalog labels (`ja`/`vi`/`en`) uniformly for `filters`, `groupBy`, `aggregations` (`column !== "*"`), and `orderBy`.
- Sync `packages/mcp-server`'s `queryTableInput` Zod schema so analytics arguments and existing `starts_with`/`between_dates`/`is_null` filters work end-to-end over MCP `stdio` and `--http`.

**Non-Goals:**
- Free SQL, `HAVING`, `JOIN`, subqueries, `OFFSET`, or window functions.
- Changing `resolveColumnName` to exclude unreviewed catalog labels (not done for `filters` today, keeping filter/group/sort resolution uniform per `catalog-mcp`).

## Decisions

### 1. Strict query composition & identifier safety

- **Column & alias validation**:
  - `aggregations[i].func` is restricted by enum (`count | sum | avg | min | max`). `column: "*"` is allowed only when `func === "count"`; otherwise `column` must be in `allowedColumns`.
  - `aggregations[i].as` (optional) is validated against `/^[A-Za-z_][A-Za-z0-9_]{0,62}$/`. When omitted, a safe deterministic alias is derived (`count_all` for `COUNT(*)`, otherwise sanitized `${func}_${col}` truncated to 63 chars, disambiguated with `_${index}` on collision) and quoted via `quoteIdent(alias, dialect)`.
  - Duplicate aggregate aliases are rejected cleanly so row JSON keys never collide silently.
- **SELECT projection in aggregate mode**:
  - When `aggregations` or `groupBy` is non-empty, `SELECT` projects only `[...groupByCols, ...aggregates]` rather than `allow.columns`, preventing invalid SQL `GROUP BY` errors on PostgreSQL, Oracle, MSSQL, and MySQL `ONLY_FULL_GROUP_BY`.
  - Wait-free safety: if `groupBy` is provided without `aggregations`, `SELECT` projects only the `groupBy` columns with `GROUP BY` (distinct grouping) cleanly.
- **`orderBy` target validation**:
  - Normal row mode: `orderBy[i].column` must be in `allowedColumns`.
  - Aggregate mode (`groupBy` or `aggregations` non-empty): `orderBy[i].column` must match either a resolved `groupBy` physical column OR a declared/generated aggregate alias (resolved in SQL by `quoteIdent(alias, dialect)`), ensuring cross-dialect SQL validity without exposing raw aggregate expressions in `ORDER BY`.
  - Note: in `handleQueryTable`, if `orderBy[i].column` matches an aggregate alias first, skip `resolveColumnName` for that entry; otherwise resolve via `resolveColumnName`.

### 2. Cross-dialect SQL clause ordering

- Clause order: `SELECT <projection> FROM <table> [WHERE ...] [GROUP BY ...] [ORDER BY ...]`.
- `mssql` / `access`: `SELECT TOP <limit> <projection> FROM ...` (since `TOP` precedes projection while `GROUP BY` / `ORDER BY` follow `WHERE`).
- `oracle`: `... FETCH FIRST :k ROWS ONLY` after `ORDER BY`.
- `as400`: `... FETCH FIRST <limit> ROWS ONLY` after `ORDER BY`.
- `postgres` / `mysql`: `... LIMIT $k` / `LIMIT ?` after `ORDER BY`.

### 3. Read-only & fully-local guarantees

- Every query still executes inside `driver.enableReadOnly()` (read-only transaction/session + configured `statementTimeoutMs`), uses parameterized `WHERE` / `LIMIT` bindings, performs zero network calls or telemetry, and wraps returned rows with `UNTRUSTED_SQL_BANNER`.
- Notice `packages/mcp-server/src/server.ts` defines `queryTableInput` statically and previously only listed `eq | in | range | contains`; updating it alongside `packages/connector-sql/src/mcp-tools.ts` ensures MCP schema validation passes `orderBy`, `groupBy`, `aggregations`, and all 7 filter ops cleanly.
- Audit log entries log only clause counts (`filterCount`, `groupByCount`, `aggregationCount`, `orderByCount`), never cell data or connection strings.

## Risks / Trade-offs

- **Unindexed `GROUP BY` / `ORDER BY` on large legacy tables** → Statement timeouts (`DEFAULT_STATEMENT_TIMEOUT_MS`) and row limits (`MAX_QUERY_LIMIT = 200`) bound DB execution and MCP payload size.
- **Aggregate alias collides with `groupBy` column name** → Reject duplicate output column/alias names before executing SQL with a clear error message.
