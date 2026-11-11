## ADDED Requirements

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
