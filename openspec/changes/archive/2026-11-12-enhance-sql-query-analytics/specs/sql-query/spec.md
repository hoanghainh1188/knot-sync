## ADDED Requirements

### Requirement: Allow-listed sorting with orderBy

`query_table` SHALL accept an optional `orderBy` list of `{ column, dir }` entries (`dir` in `asc` or `desc`, defaulting to `asc`). Every sort column MUST resolve to an allow-listed column (or a grouped column / aggregate alias when aggregating) and be quoted safely per SQL dialect before `LIMIT` / `FETCH FIRST`.

#### Scenario: Sort Japanese orders descending by amount

- **GIVEN** an allow-listed table `受注` with columns `得意先名` and `金額`
- **WHEN** `query_table` is called with `orderBy: [{ column: "金額", dir: "desc" }]` and `limit: 5`
- **THEN** the generated SQL orders by `"金額" DESC` (or dialect quote equivalent) prior to the row limit
- **AND** all filter values remain bound parameters

#### Scenario: Reject disallowed sort column

- **WHEN** `query_table` receives `orderBy: [{ column: "SALARY", dir: "desc" }]` where `SALARY` is not allow-listed
- **THEN** the tool returns an error naming the disallowed column and executes no SQL

#### Scenario: Oracle and SQL Server limit placement with orderBy

- **GIVEN** an `oracle` or `mssql` source with allow-listed column `金額`
- **WHEN** `query_table` runs with `orderBy: [{ column: "金額", dir: "asc" }]` and `limit: 10`
- **THEN** Oracle emits `ORDER BY "金額" ASC FETCH FIRST :1 ROWS ONLY` and MSSQL emits `SELECT TOP 10 ... ORDER BY [金額] ASC`

### Requirement: Safe aggregations and GROUP BY

`query_table` SHALL accept optional `aggregations` (`func` in `count`, `sum`, `avg`, `min`, `max`; `column`; optional ASCII identifier `as`) and optional `groupBy` columns. Only `count` MAY use `column: "*"`; all other columns and `groupBy` targets MUST be allow-listed, and `SELECT` SHALL project only grouped columns and aggregates.

#### Scenario: Aggregate Vietnamese invoices grouped by status

- **GIVEN** an allow-listed table `hoa_don` with columns `trang_thai` and `so_tien`
- **WHEN** `query_table` is called with `groupBy: ["trang_thai"]`, `aggregations: [{ func: "count", column: "*", as: "total_count" }, { func: "sum", column: "so_tien", as: "total_amount" }]`, and `orderBy: [{ column: "total_amount", dir: "desc" }]`
- **THEN** the query projects only `"trang_thai"`, `COUNT(*) AS "total_count"`, and `SUM("so_tien") AS "total_amount"` with `GROUP BY "trang_thai"` and `ORDER BY "total_amount" DESC`
- **AND** returned rows are framed with `UNTRUSTED_DOCUMENT_CONTENT`

#### Scenario: Reject wildcard with sum or unsafe alias

- **WHEN** `query_table` receives `aggregations: [{ func: "sum", column: "*" }]` or `as: "x; DROP TABLE t"`
- **THEN** the tool rejects the call before executing SQL

#### Scenario: Reject ungrouped orderBy column during aggregation

- **GIVEN** `groupBy: ["trang_thai"]` and `aggregations: [{ func: "count", column: "*", as: "cnt" }]`
- **WHEN** `query_table` receives `orderBy: [{ column: "so_tien", dir: "desc" }]` where `so_tien` is neither in `groupBy` nor an aggregate alias
- **THEN** the tool rejects the call before executing SQL

### Requirement: Analytics parameters exposed and audited in MCP

The MCP `query_table` schema and description SHALL document `orderBy`, `groupBy`, and `aggregations` (and accept existing filter operators through the MCP server schema). Tool audit entries SHALL record counts for filters, `groupBy`, `aggregations`, and `orderBy` without logging connection secrets or row contents.

#### Scenario: MCP tool schema exposes analytics inputs and writes audit summary

- **WHEN** a client inspects `query_table` input properties or calls `query_table` through the MCP server with `groupBy` and `aggregations`
- **THEN** `orderBy`, `groupBy`, and `aggregations` validate cleanly without being stripped
- **AND** the JSONL audit record includes counts for the analytics clauses
