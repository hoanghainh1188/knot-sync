# Spec Delta

## ADDED Requirements

### Requirement: Pre-approved lookup joins on catalog tables
A `CatalogTable` SHALL accept an optional `lookupJoins` array defining pre-approved single-hop `LEFT JOIN` relationships to another table or view. Each entry MUST specify `name`, `targetTable`, `localColumn`, `targetColumn`, `columns` (map of exposed target column names to `CatalogColumn` metadata), and `reviewed` (`boolean`, defaulting to `false`).

#### Scenario: Japanese lookup join entry parsed from catalog YAML
- **WHEN** `knot-sync.catalog.yaml` defines `lookupJoins` on `juchu` with `name: "tokuisaki"`, `targetTable: "tokuisaki_mst"`, `localColumn: "TKSK_CD"`, `targetColumn: "TKSK_CD"`, `columns: { TKSK_NM: { label: "得意先名" } }`, and `reviewed: true`
- **THEN** loading the catalog preserves the `lookupJoins` entry with `reviewed: true` and its exposed `TKSK_NM` column metadata

#### Scenario: Lookup join without explicit reviewed flag defaults to false
- **WHEN** a `lookupJoins` entry omits `reviewed`
- **THEN** the catalog loader sets `reviewed: false` on that entry

#### Scenario: Invalid lookup join entry is rejected at catalog load
- **WHEN** a `lookupJoins` entry is missing `name`, `targetTable`, `localColumn`, `targetColumn`, or `columns`, or contains an unknown field
- **THEN** catalog loading fails with a structured validation error identifying the invalid `lookupJoins` entry

### Requirement: Reviewed lookup joins are preserved across catalog merges
Merging a newly introspected catalog into an existing catalog SHALL preserve every `lookupJoins` entry on a table whose `reviewed` flag is `true`, and SHALL NOT automatically mark any `lookupJoins` entry as `reviewed: true`.

#### Scenario: Reviewed lookup join survives catalog merge
- **WHEN** an existing catalog has a `reviewed: true` `lookupJoins` entry on `orders` and `mergeCatalog` runs with a fresh introspection snapshot
- **THEN** the resulting `orders` table retains the `reviewed: true` `lookupJoins` entry unchanged

#### Scenario: Unreviewed lookup join is not auto-approved on merge
- **WHEN** an existing catalog has a `reviewed: false` `lookupJoins` entry
- **THEN** `mergeCatalog` keeps `reviewed: false` and never promotes it to `reviewed: true`
