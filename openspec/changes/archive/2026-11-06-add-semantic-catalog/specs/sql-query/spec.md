# Spec: sql-query (delta)

## ADDED Requirements

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
