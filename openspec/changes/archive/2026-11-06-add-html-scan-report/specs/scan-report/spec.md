# Spec: scan-report (delta)

## ADDED Requirements

### Requirement: Optional HTML report file

`knot-sync scan` SHALL accept `--report [file]`. When present, after a successful
scan the CLI SHALL write one HTML scan report (via the report-html capability)
to the given path, or to a documented default path when the file argument is
omitted. Writing the report MUST NOT create, modify, move, or delete anything
inside a configured source path. Text and `--json` stdout behavior remain as
specified elsewhere. Help text SHALL describe `--report` as available (not
“coming soon”).

#### Scenario: Default report path

- **WHEN** the user runs `knot-sync scan --report` without a path
- **THEN** an HTML file is written at the documented default location
- **AND** the command exits 0 on success

#### Scenario: Custom report path

- **WHEN** the user runs `knot-sync scan --report ./out/health.html`
- **THEN** that path receives a self-contained HTML report

#### Scenario: Sources stay read-only

- **WHEN** `scan --report` writes an HTML file
- **THEN** no file inside any configured source folder is created or changed by
  the report writer
