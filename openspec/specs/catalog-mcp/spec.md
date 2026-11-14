# catalog-mcp Specification

## Purpose

Defines how the MCP server consumes `knot-sync.catalog.yaml` to enrich tool
and resource descriptions, accept business-name parameters, and validate enum
filters—without writing to customer databases.

## Requirements

### Requirement: Catalog loaded at serve

When a catalog file exists at the configured path, `serve` SHALL load it at
startup (or before the first SQL tool/resource use) and apply it to SQL MCP
surfaces. A missing optional catalog SHALL not fail `serve`. A present but
invalid catalog SHALL fail startup with an actionable parse error.

#### Scenario: Serve starts without catalog file

- **WHEN** no catalog file exists and catalog is optional
- **THEN** `serve` starts successfully
- **AND** SQL tools still operate with physical allow-listed names only

### Requirement: Enriched tool descriptions

When a catalog entry exists for a table or column, `describe_table` /
`query_table` descriptions (and schema resource text where applicable) SHALL
include business labels (preferring available ja/vi/en) and optional
foreign-key `references` (`"<table>.<column>"`) alongside physical names so
agents can interpret cryptic columns and discover master-detail relations.

#### Scenario: Japanese label in describe_table

- **GIVEN** catalog maps column `TKSK_CD` to ja label `得意先コード` and `references: "tokuisaki_mst.TKSK_CD"`
- **WHEN** `describe_table` is called for that table
- **THEN** the result mentions `TKSK_CD`, `得意先コード`, and `tokuisaki_mst.TKSK_CD`

### Requirement: Business-name parameters

`query_table` SHALL accept filter column names that match either the physical
column or a catalog business label for that table (exact match on any of
ja/vi/en labels when present). Resolution MUST map to a single allow-listed
physical column; ambiguous labels SHALL be rejected with a clear error.

#### Scenario: Filter by Vietnamese business name

- **GIVEN** catalog maps `ma_kh` to vi label `mã khách hàng`
- **WHEN** `query_table` is called with an equals filter on `mã khách hàng`
- **THEN** the query runs against physical column `ma_kh`

#### Scenario: Ambiguous business name rejected

- **GIVEN** two columns share the same vi label in the catalog
- **WHEN** `query_table` filters by that label
- **THEN** the tool returns an error naming the conflict and does not query

### Requirement: Enum validation from valid values

When a column’s catalog entry lists non-empty valid values and a filter targets
that column, values outside the list SHALL be rejected before querying (unless
design documents an explicit bypass that remains off by default). Empty valid
values mean no enum check.

#### Scenario: Invalid enum rejected

- **GIVEN** column `KBN` has valid values `["A", "B"]`
- **WHEN** `query_table` equals-filters `KBN` to `Z`
- **THEN** the tool returns an error listing allowed values
- **AND** no SQL is executed

### Requirement: Untrusted framing unchanged

Catalog enrichment MUST NOT remove or weaken untrusted-content framing on row
payloads. Catalog labels are metadata, not instructions for the agent to obey
as system policy.

#### Scenario: Framing still present with catalog

- **WHEN** `query_table` returns rows while a catalog is loaded
- **THEN** the payload still includes explicit untrusted-content framing

### Requirement: Business-name resolution in orderBy, groupBy, and aggregations

When a Semantic Catalog is loaded for the target SQL source, `query_table` SHALL resolve `groupBy`, `orderBy`, and non-`*` `aggregations` column names across both physical allow-listed names and unique catalog business labels (`ja`/`vi`/`en`), matching the resolution semantics used for `filters`. Ambiguous labels MUST be rejected before executing SQL.

#### Scenario: Group, aggregate, and sort using Japanese and Vietnamese business labels

- **GIVEN** catalog maps `TKSK_CD` to ja label `得意先コード` and `KIN` to vi label `Tổng tiền`
- **WHEN** `query_table` runs with `groupBy: ["得意先コード"]`, `aggregations: [{ func: "sum", column: "Tổng tiền", as: "sum_kin" }]`, and `orderBy: [{ column: "得意先コード", dir: "asc" }]`
- **THEN** `groupBy` and `orderBy` resolve to physical `"TKSK_CD"` and `SUM` resolves to `"KIN"`

#### Scenario: Ambiguous business label rejected in groupBy or orderBy

- **GIVEN** two allow-listed columns share the same business label in the catalog
- **WHEN** `query_table` passes that ambiguous label in `groupBy`, `aggregations`, or `orderBy`
- **THEN** the tool returns a clear conflict error and executes no SQL
