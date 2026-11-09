# Spec Delta

## MODIFIED Requirements

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

## ADDED Requirements

### Requirement: New filter operators are documented in tool schema

The `query_table` input schema and operator docs SHALL list `starts_with`,
`between_dates`, and `is_null` alongside existing operators so MCP clients can
discover them without reading source code.

#### Scenario: Schema lists new operators

- **WHEN** a client inspects the `query_table` tool input schema or description
- **THEN** `starts_with`, `between_dates`, and `is_null` are described as
  supported filter ops
