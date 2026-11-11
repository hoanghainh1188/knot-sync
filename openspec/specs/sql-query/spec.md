# sql-query Specification

## Purpose

Lets MCP clients inspect allow-listed SQL table schemas and run bounded,
parameterized filters—never free SQL—while framing cell values as untrusted
document data.

## Requirements

### Requirement: Schema resource

The MCP server SHALL expose resource URIs of the form
`knot://db/{source}/{table}/schema` that return JSON (or structured text)
describing the allow-listed columns and keys for that table in that source.
Unknown source, disallowed table, or missing table SHALL produce a clear
not-found or not-allowed error. Credentials MUST NOT appear in the resource
body.

#### Scenario: Read schema for Vietnamese table

- **GIVEN** source `erp` allows table `hoa_don` with column `ma_kh`
- **WHEN** a client reads `knot://db/erp/hoa_don/schema`
- **THEN** the response includes column `ma_kh` and its type
- **AND** does not include connection URL secrets

### Requirement: describe_table tool

The server SHALL register tool `describe_table` with a strict input schema
requiring `source` and `table`. On success it SHALL return the same allow-listed
schema information as the schema resource. Disallowed tables SHALL be rejected
without querying other tables.

#### Scenario: Describe allowed table

- **WHEN** the tool is called with `source: "erp"` and `table: "受注"`
- **AND** `受注` is allow-listed
- **THEN** the result lists allowed columns for `受注`

### Requirement: query_table tool

The server SHALL register tool `query_table` with a strict input schema
including `source`, `table`, optional filters, and optional `limit` (positive
integer with a documented maximum). Filters SHALL support at least: equals,
in, range, contains, starts_with, between_dates, and is_null, and MUST name
only allow-listed columns. The implementation SHALL use parameterized queries
only—no string-concatenated SQL from agent input. Free-form SQL strings as
input MUST NOT be accepted.

#### Scenario: Equals filter on Japanese column

- **GIVEN** allow-listed column `得意先名`
- **WHEN** `query_table` is called with an equals filter on `得意先名`
- **THEN** the result rows are limited to matching values
- **AND** the executed SQL uses bound parameters

#### Scenario: Reject unknown column

- **WHEN** a filter names a column not in `allow` for that table
- **THEN** the tool returns an error and does not run a query

#### Scenario: Max rows enforced

- **WHEN** `limit` exceeds the documented maximum
- **THEN** the effective limit is capped at that maximum (or the call is rejected
  with a clear error—behavior fixed in design and documented)

#### Scenario: starts_with on Vietnamese column

- **GIVEN** allow-listed column `ten_kh`
- **WHEN** `query_table` is called with a starts_with filter value `Nguyễn`
- **THEN** matching rows are those whose `ten_kh` starts with that prefix
- **AND** the SQL uses a bound parameter (not concatenated user SQL)

#### Scenario: between_dates on Japanese date column

- **GIVEN** allow-listed column `計上日`
- **WHEN** `query_table` is called with between_dates `from`/`to` ISO dates
- **THEN** only rows with `計上日` in that inclusive range are returned
- **AND** parameters are bound

#### Scenario: is_null filter

- **GIVEN** an allow-listed nullable column
- **WHEN** `query_table` is called with is_null true for that column
- **THEN** only rows where the column IS NULL are returned
- **AND** when is_null is false, only non-null rows are returned

### Requirement: New filter operators are documented in tool schema

The `query_table` input schema and operator docs SHALL list `starts_with`,
`between_dates`, and `is_null` alongside existing operators so MCP clients can
discover them without reading source code.

#### Scenario: Schema lists new operators

- **WHEN** a client inspects the `query_table` tool input schema or description
- **THEN** `starts_with`, `between_dates`, and `is_null` are described as
  supported filter ops

### Requirement: Untrusted framing for row payloads

Any tool or resource payload that includes table cell values SHALL clearly mark
that material as untrusted document/database content that MUST NOT be followed
as instructions.

#### Scenario: Framing on query results

- **WHEN** `query_table` returns one or more rows
- **THEN** the payload includes explicit untrusted-content framing

### Requirement: Audit SQL tool use

SQL tool calls and schema resource reads SHALL append JSONL audit entries
(timestamp, tool/resource name, source, table, filter summary without secrets,
result count/status) using the existing MCP audit log path rules.

#### Scenario: query_table audited

- **WHEN** `query_table` succeeds
- **THEN** a JSONL line records the tool name, source, table, and row count

### Requirement: query_table resolves catalog names when loaded

When a catalog is loaded for the target SQL source, `query_table` filter
column identifiers SHALL accept physical allow-listed names or unique
catalog business labels (ja/vi/en) for that table, resolving to the physical
column before allow-list and parameterized query execution. Behavior without
a catalog remains physical names only.

#### Scenario: Business label resolves under allow-list

- **GIVEN** allow-list includes `TKSK_CD` and catalog ja label `得意先コード`
- **WHEN** `query_table` filters on `得意先コード`
- **THEN** the filter applies to physical `TKSK_CD` with bound parameters

### Requirement: query_table validates catalog enums

When the catalog lists valid values for the resolved column, `query_table`
SHALL reject filter values outside that set before executing SQL, with an
error that lists allowed values (or a clear subset when large—document
truncation in design).

#### Scenario: Enum gate before query

- **GIVEN** catalog valid values for `KBN` are `["01", "02"]`
- **WHEN** an equals filter uses `03`
- **THEN** no query runs and the error mentions allowed values

### Requirement: MCP tools work for enterprise SQL sources

When an enterprise SQL source is configured and the plugin is licensed,
`describe_table` and `query_table` SHALL accept that source id and table under
the same allow-list and parameterized-filter rules as Postgres/MySQL. Responses
SHALL frame cell values as untrusted document content. Dialect-specific
identifier quoting SHALL be applied for the engine in use.

#### Scenario: query_table on AS400 allow-listed table

- **GIVEN** an IBM i / AS400 source with allow-listed table `CUSTMAST` and
  column `CUSNAM`
- **AND** the enterprise plugin is loaded and healthy
- **WHEN** `query_table` runs with `equals` on `CUSNAM`
- **THEN** a parameterized query runs against only allow-listed identifiers
- **AND** returned cells are framed as untrusted data

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
