# Spec Delta

## ADDED Requirements

### Requirement: Active lookup columns are surfaced in describe_table
When `describe_table` inspects a table that has active `lookupJoins` (where `reviewed: true` and all referenced base/target tables and columns are in `source.allow`), it SHALL include the exposed lookup columns (with qualified name `<joinName>.<column>`, `label`, and join relationship metadata) in its output, and SHALL omit unreviewed or non-allow-listed lookup joins.

#### Scenario: describe_table lists active Vietnamese lookup columns and hides unreviewed ones
- **WHEN** `hoa_don` has one `reviewed: true` allow-listed lookup join `khach_hang` exposing `ten_kh` (`label: "Tên khách hàng"`) and one `reviewed: false` lookup join `nhan_vien`
- **THEN** `describe_table("hoa_don")` lists `khach_hang.ten_kh` with label `"Tên khách hàng"` and does not expose `nhan_vien`

### Requirement: Business-name resolution for active lookup columns in query_table
`query_table` SHALL resolve both qualified lookup column names (`<joinName>.<column>`) and unique business `label` values of active lookup columns across `columns`, `filters`, `groupBy`, `orderBy`, and `aggregations`.

#### Scenario: Filtering and grouping by Japanese lookup column label
- **WHEN** `juchu` has active lookup column `tokuisaki.TKSK_NM` with `label: "得意先名"` and `query_table` passes `groupBy: ["得意先名"]`, `aggregations: [{ fn: "sum", column: "KINGAKU", alias: "合計" }]`, and `orderBy: [{ column: "得意先名", dir: "asc" }]`
- **THEN** `query_table` resolves `"得意先名"` to `"tokuisaki"."TKSK_NM"` and executes the grouped `LEFT JOIN` query successfully
