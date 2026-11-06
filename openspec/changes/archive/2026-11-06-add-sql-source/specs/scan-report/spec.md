# Spec: scan-report (delta)

## ADDED Requirements

### Requirement: SQL sources in scan inventory

When a configured source uses a SQL connector (`postgres` or `mysql`), `scan`
SHALL inventory that source through the connector and include it in text and
`--json` results alongside folder sources. Per-source stats SHALL reflect the
number of allow-listed tables found and incorporate row estimates as documented
in the sql-source capability (mapped into the existing stats fields or an
explicit extension field named in design).

#### Scenario: Mixed fs and postgres sources

- **GIVEN** config defines one `fs` source and one `postgres` source
- **WHEN** the user runs `knot-sync scan --json`
- **THEN** the `sources` array includes both source ids with non-error stats
  objects when both scans succeed
