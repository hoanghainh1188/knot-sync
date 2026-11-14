# Spec Delta

## ADDED Requirements

### Requirement: Pre-approved lookup join execution in query_table
`query_table` SHALL execute a single-hop `LEFT JOIN` in one parameterized read-only SQL query when the requested columns, `filters`, `groupBy`, `orderBy`, or `aggregations` reference an active lookup column from a `reviewed: true` `lookupJoins` entry on the base table. All table, alias, and column identifiers MUST be quoted via `quoteIdent` and all filter values MUST use bound parameters.

#### Scenario: Querying Japanese lookup column with filter and orderBy
- **WHEN** `juchu` has an active `reviewed: true` `lookupJoins` entry `tokuisaki` (`LEFT JOIN tokuisaki_mst ON juchu.TKSK_CD = tokuisaki_mst.TKSK_CD`) exposing `TKSK_NM` (`label: "得意先名"`), and `query_table` selects `["JUCHU_NO", "tokuisaki.TKSK_NM"]` with filter `tokuisaki.TKSK_NM contains "商事"` and `orderBy` on `tokuisaki.TKSK_NM`
- **THEN** `query_table` builds a single parameterized `SELECT ... FROM "juchu" LEFT JOIN "tokuisaki_mst" AS "tokuisaki" ON "juchu"."TKSK_CD" = "tokuisaki"."TKSK_CD"` query and returns the matching rows framed as untrusted content

#### Scenario: Unused lookup joins are not joined unnecessarily
- **WHEN** `query_table` is called on `juchu` selecting and filtering only base table columns
- **THEN** the generated SQL does not emit unnecessary `LEFT JOIN` clauses for unused `lookupJoins`

### Requirement: Dual gate enforcement for lookup joins
A `lookupJoins` entry SHALL be active ONLY when BOTH `reviewed: true` is set in `knot-sync.catalog.yaml` AND `source.allow` in `knot-sync.config.yaml` includes the base table, `localColumn`, `targetTable`, `targetColumn`, and every exposed lookup column referenced. Requests referencing unreviewed or non-allow-listed lookup joins or columns MUST be rejected without executing SQL.

#### Scenario: Unreviewed lookup join is rejected
- **WHEN** a `lookupJoins` entry on `juchu` has `reviewed: false` and `query_table` requests `tokuisaki.TKSK_NM`
- **THEN** `query_table` returns a clear validation error without executing any SQL query

#### Scenario: Lookup join referencing non-allow-listed target table or column is rejected
- **WHEN** `tokuisaki_mst` or `tokuisaki_mst.TKSK_NM` or `TKSK_CD` is missing from `source.allow` in `knot-sync.config.yaml` and `query_table` requests `tokuisaki.TKSK_NM`
- **THEN** `query_table` rejects the request with an allow-list error and executes no SQL

#### Scenario: Arbitrary JOIN syntax in MCP arguments is never accepted
- **WHEN** an MCP caller passes raw SQL `JOIN` syntax inside `table`, `columns`, `filters`, `groupBy`, or `orderBy`
- **THEN** `query_table` treats it as an invalid identifier or unknown column and rejects the request without executing SQL
