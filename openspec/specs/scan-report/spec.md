# scan-report Specification

## Purpose

The `knot-sync scan` command inventories every configured source, saves the inventory locally and reports the health of the data: types, size, duplicates, old, empty and unreadable files.

## Requirements

### Requirement: Inventory is replaced on each scan
Each scan SHALL replace the stored inventory and issues of every scanned source with the new results, in the local store file.

#### Scenario: Rescan after files were removed
- **WHEN** a source is scanned again after files were removed from it
- **THEN** the stored inventory contains only the files found in the latest scan

### Requirement: Health summary per source
For each source the scan SHALL report file count, total size, counts and sizes by document type, duplicate copies with the bytes they waste, files older than `scan.old_file_years`, empty files and unreadable items.

#### Scenario: Duplicate estimates
- **GIVEN** `営業/見積書.xlsx`, `営業/見積書 (1).xlsx` and `営業/見積書_最新_本当に最新.xlsx` with identical bytes
- **WHEN** the folder is scanned
- **THEN** the report shows 2 duplicate copies and lists the three paths in the biggest-duplicates section

#### Scenario: Old file
- **WHEN** a file was last modified more than `scan.old_file_years` years ago
- **THEN** it is counted as old

### Requirement: Empty files are not duplicates
Files of size 0 SHALL be counted as empty files and SHALL NOT be counted as duplicates of each other.

#### Scenario: Two empty files
- **WHEN** a source has two empty files
- **THEN** the report shows 2 empty files and 0 duplicate copies

### Requirement: JSON output
`knot-sync scan --json` SHALL print the same results as one JSON document on standard output, including the version, the store path and per-source stats, issues and top duplicate groups.

#### Scenario: Machine-readable scan
- **WHEN** the user runs `knot-sync scan --json`
- **THEN** standard output is valid JSON with a `sources` array

### Requirement: Clean exit when output is piped
When standard output is closed early by the reader (for example `knot-sync scan | head`), the command SHALL exit quietly with code 0 instead of crashing.

#### Scenario: Piped into head
- **WHEN** the user runs `knot-sync scan | head -2`
- **THEN** no stack trace is printed and the exit code is 0

### Requirement: Unknown commands

Unknown commands SHALL exit with code 2 and show help. Implemented commands
including `run` and `serve` MUST NOT use a “not available yet” path.

#### Scenario: Unknown command

- **WHEN** the user runs `knot-sync nope`
- **THEN** the exit code is 2 and help is shown

#### Scenario: Serve is available

- **WHEN** the user runs `knot-sync serve -c <valid-config>`
- **THEN** the process does not exit solely because the command is unimplemented
- **AND** it does not print that `serve` is not available yet

### Requirement: Optional PII prevalence estimate

`knot-sync scan` SHALL accept `--pii`. When set, the scan output (text and
`--json`) SHALL include per-source an estimate of how many inventoried files
appear to contain personal data under the built-in PII rules, without storing
documents or match strings. When `--pii` is absent, behavior is unchanged from
prior requirements.

#### Scenario: JSON includes estimate

- **WHEN** the user runs `knot-sync scan --json --pii`
- **THEN** each source object includes a numeric PII estimate field (name per design)
- **AND** no matched PII substrings appear in the JSON

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
