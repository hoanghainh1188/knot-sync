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
in, range, and contains, and MUST name only allow-listed columns. The
implementation SHALL use parameterized queries only—no string-concatenated SQL
from agent input. Free-form SQL strings as input MUST NOT be accepted.

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
