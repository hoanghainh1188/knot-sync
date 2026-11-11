# Tasks

## 1. Query Builder Analytics Support (`connector-sql`)

- [x] 1.1 Define `QueryOrderBy` (`column`, `dir?: "asc" | "desc"`) and `QueryAggregation` (`func: "count" | "sum" | "avg" | "min" | "max"`, `column`, optional `as`) types and extend `buildSelectQuery` options (`orderBy`, `groupBy`, `aggregations`) in `packages/connector-sql/src/query-build.ts`.
- [x] 1.2 Implement validation and projection in `buildSelectQuery`: allowlist-validate `orderBy`, `groupBy`, and `aggregations` columns (`COUNT(*)` only allowed for `count`), validate `dir` (`asc`/`desc`, default `asc`), support `groupBy` with optional `aggregations` (projecting `[...groupBy, ...aggregations]`), validate `as` against `/^[A-Za-z_][A-Za-z0-9_]{0,62}$/` and reject duplicate output aliases/columns, generate deterministic default aliases (`<func>_<column>` or `count_all`), and require aggregate-mode `orderBy.column` to match either a `groupBy` column or a declared/default aggregation alias.
- [x] 1.3 Emit dialect-safe `SELECT`, `GROUP BY`, `ORDER BY`, and `LIMIT`/`TOP`/`FETCH FIRST` clauses across all six dialects (`postgres`, `mysql`, `mssql`, `oracle`, `access`, `as400`) in `packages/connector-sql/src/query-build.ts`, ensuring MSSQL (`TOP`) and Access (`TOP`) emit `ORDER BY` after `GROUP BY` and `Oracle`/`AS400` emit `FETCH FIRST` after `ORDER BY`.
- [x] 1.4 Add `node:test` unit tests in `packages/connector-sql/src/connector-sql.test.ts` and `packages/connector-sql-enterprise/src/connector-sql-enterprise.test.ts` verifying SQL generation, parameter binding order, and validation errors for `orderBy`, `groupBy`, and `aggregations` across `postgres`, `mysql`, `mssql`, `oracle`, `access`, and `as400`.

## 2. MCP Tool Handler & Semantic Catalog Resolution (`connector-sql`)

- [x] 2.1 Extend `handleQueryTable` in `packages/connector-sql/src/mcp-tools.ts` to parse `orderBy`, `groupBy`, and `aggregations`, resolve business/logical column names (JA/VI/EN) via `resolveColumnName` for `groupBy`, non-`*` `aggregations.column`, non-aggregate `orderBy.column`, and `groupBy`-targeting `orderBy.column` while leaving aggregate aliases intact.
- [x] 2.2 Ensure catalog rejection behavior (ambiguous labels, disallowed columns, missing reviewed catalog when required) matches `filters` uniformly for `orderBy`, `groupBy`, and non-`*` `aggregations`, and document the new parameters in `query_table` tool description and JSON `inputSchema` in `packages/connector-sql/src/mcp-tools.ts`.
- [x] 2.3 Add `node:test` tests in `packages/connector-sql/src/connector-sql.test.ts` covering JA/VI catalog label resolution inside `groupBy`, `aggregations`, and `orderBy`, aggregate alias sorting, distinct `groupBy` without `aggregations`, rejection of ambiguous/disallowed columns or ungrouped `orderBy`, and updated `query_table` schema/description.

## 3. MCP Server Schema Sync & Audit Logging (`mcp-server`)

- [x] 3.1 Update `queryTableInput` Zod schema in `packages/mcp-server/src/server.ts` to accept `orderBy`, `groupBy`, and `aggregations` alongside existing fields, and add missing `starts_with`, `between_dates`, and `is_null` filter operators so `mcp-server` and `connector-sql` inputs stay aligned.
- [x] 3.2 Extend `auditSafe` metadata for `query_table` in `packages/mcp-server/src/server.ts` to record `filterCount`, `groupByCount`, `aggregationCount`, and `orderByCount` without logging raw literal values or query rows.
- [x] 3.3 Add `node:test` tests in `packages/mcp-server/src/mcp-server.test.ts` verifying Zod validation of `query_table` analytics inputs (including `starts_with`/`between_dates`/`is_null`), `UNTRUSTED_DOCUMENT_CONTENT` framing on aggregated/sorted responses, and JSONL audit log counts.

## 4. Documentation & Full Verification

- [x] 4.1 Update `README.md`, `packages/cli/README.md`, and `packages/connector-sql/README.md` with `query_table` analytics examples (`orderBy`, `groupBy`, `aggregations`), and update `enhance-sql-query-analytics` status to `✅ done` in `docs/ROADMAP.md`.
- [x] 4.2 Run workspace build and full `node:test` suite (`pnpm build && pnpm test`) and verify all tests pass with zero failures.

## Workflow follow-up

- After implementation and verification complete, run `/opsx-archive` to archive `enhance-sql-query-analytics` and sync the spec deltas into `openspec/specs/sql-query/spec.md` and `openspec/specs/catalog-mcp/spec.md`.
