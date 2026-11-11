# Proposal

## Why

Business users and PMs routinely ask AI assistants analytical questions over legacy SQL tables—such as "top 10 customers by total order amount", "monthly invoice totals by status", or "latest 20 orders". Currently, `query_table` in `packages/connector-sql` (and `queryTableInput` in `packages/mcp-server`) only supports unaggregated row selection without `ORDER BY`, forcing MCP agents either to read an unsorted, `LIMIT`-truncated subset or give incomplete answers.

## What Changes

- **Allow-listed sorting (`orderBy`) in `packages/connector-sql`**:
  - Add optional `orderBy?: Array<{ column: string; dir?: "asc" | "desc" }>` (default `dir: "asc"`) to `buildSelectQuery` and `query_table`.
  - Validate every `orderBy` target strictly against allow-listed physical columns (or active `groupBy` columns / declared aggregation aliases when aggregating), quote identifiers per dialect (`postgres`, `mysql`, `mssql`, `oracle`, `access`, `as400`), and reject invalid directions or unallow-listed columns before executing SQL.
- **Safe aggregations and `GROUP BY` in `packages/connector-sql`**:
  - Add optional `aggregations?: Array<{ func: "count" | "sum" | "avg" | "min" | "max"; column: string; as?: string }>` and optional `groupBy?: string[]` to `buildSelectQuery` and `query_table`.
  - Allow `column: "*"` strictly for `func: "count"`; require allow-listed physical columns for `sum`, `avg`, `min`, `max`, `count(<col>)`, and all `groupBy` items.
  - Validate optional `as` aliases with a strict ASCII identifier pattern (quoted via `quoteIdent`) and assign safe deterministic aliases when omitted so outputs remain valid JSON row objects without free-form SQL injection.
  - When `aggregations` or `groupBy` are supplied, project only the `groupBy` columns plus aggregate expressions in `SELECT`, preserving dialect-specific `LIMIT` / `TOP` / `FETCH FIRST` placement.
- **Catalog label resolution & MCP Zod schema sync (`packages/connector-sql`, `packages/mcp-server`)**:
  - Resolve column identifiers in `orderBy`, `groupBy`, and `aggregations` (when `column !== "*"`) through `resolveColumnName` so unique Semantic Catalog business labels (`ja`/`vi`/`en`) and physical names work uniformly across `filters`, `groupBy`, `aggregations`, and `orderBy`.
  - Update `queryTableInput` in `packages/mcp-server/src/server.ts` so `orderBy`, `groupBy`, `aggregations` (as well as existing `connector-sql` filter operators `starts_with`, `between_dates`, `is_null`) pass Zod validation over MCP `stdio`/`--http`, and record analytics argument counts (`groupByCount`, `aggregationCount`, `orderByCount`) in audit logs.

**Out of scope**

- Free-form SQL strings, arbitrary expressions, `JOIN` across tables, `HAVING`, `OFFSET` pagination, window functions, or `DISTINCT` aggregates.
- Write / DML / stored-procedure tools in MCP (deferred after v1.0).
- New third-party dependencies (none; uses existing `zod`, `pg`, `mysql2`, and Node.js built-ins).
- Restricting catalog label resolution only to `reviewed: true` entries differently from `filters` (both follow the existing `catalog-mcp` rule in `resolveColumnName`).

## Capabilities

### Modified Capabilities

- `sql-query`: Add allow-listed `orderBy`, safe aggregations (`COUNT`, `SUM`, `AVG`, `MIN`, `MAX`), and optional `groupBy` to `query_table` and `buildSelectQuery` across core and enterprise SQL dialects, keeping `mcp-server` schemas, parameterized queries, read-only enforcement, and untrusted framing intact.
- `catalog-mcp`: Accept unique Semantic Catalog business labels (`ja`/`vi`/`en`) alongside physical column names in `query_table` `orderBy`, `groupBy`, and non-`*` `aggregations`.

## Impact

- Code: `packages/connector-sql/src/query-build.ts`, `packages/connector-sql/src/mcp-tools.ts`, `packages/mcp-server/src/server.ts` (note: `packages/connector-sql-enterprise` delegates `query_table` to `packages/connector-sql`, so dialect support in `query-build.ts` covers all 6 dialects automatically).
- Docs: `README.md`, `packages/cli/README.md`, `packages/connector-sql/README.md` (if needed), and `docs/ROADMAP.md` (`v0.4` status for `enhance-sql-query-analytics`).
- Tests: `packages/connector-sql/src/connector-sql.test.ts`, `packages/connector-sql-enterprise/src/connector-sql-enterprise.test.ts`, `packages/mcp-server/src/mcp-server.test.ts`.
- Dependencies: None.
- Runtime / Security: Strictly read-only transactions and statement timeouts preserved; zero free SQL; returned rows remain framed as `UNTRUSTED_DOCUMENT_CONTENT`.
