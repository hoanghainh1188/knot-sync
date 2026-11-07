# bench Specification

## Purpose

Measures real before/after token estimates and retrieval/tool suite accuracy
on the operator’s local KnotSync store so effectiveness claims stay tied to
customer data, fully offline.

## Requirements

### Requirement: bench CLI command

`knot-sync bench` SHALL load the configured store (and catalog when present)
and print a before/after report. Help text SHALL list `bench`. Exit 0 on
success; exit 1 when the config is missing or the store cannot be read, with
an actionable message (e.g. run `init` / `scan` / `run` first).

#### Scenario: Help lists bench

- **WHEN** the user runs `knot-sync --help`
- **THEN** the help text includes the `bench` command

#### Scenario: Empty store guidance

- **WHEN** `knot-sync bench` finds no documents in the store
- **THEN** the process exits non-zero
- **AND** stderr tells the user to run `knot-sync scan` and `knot-sync run`

### Requirement: Token before/after report

The command SHALL report aggregate estimated token counts **before** and
**after** cleaning for documents that carry `tokensBefore` / `tokensAfter`
metadata (same estimation approach as the JA/VN cleaner). Output SHALL include
totals and a reduction percentage. Documents missing those fields SHALL be
counted separately or skipped with a clear note—not silently invent numbers.

#### Scenario: Japanese document tokens reduce or stay equal

- **GIVEN** a stored document whose content was cleaned from text containing
  `令和5年` / full-width digits with `tokensBefore` and `tokensAfter` set
- **WHEN** the user runs `knot-sync bench`
- **THEN** the report includes those before/after totals
- **AND** after ≤ before for that document’s contribution

### Requirement: Retrieval suite accuracy

When a bench suite file is present (default path beside the config, e.g.
`knot-sync.bench.yaml`, overridable by flag), `bench` SHALL run each
document-search case: a query plus expected match criteria (document id
and/or path/title substring). It SHALL report pass/fail counts. Japanese and
Vietnamese queries MUST be supported the same way as MCP search.

#### Scenario: Vietnamese search case passes

- **GIVEN** a suite case with query `hóa đơn` expecting a document titled
  like `Hóa đơn tháng 5`
- **AND** that document exists in the store
- **WHEN** `knot-sync bench` runs the suite
- **THEN** that case is counted as a pass

#### Scenario: Missing expected document fails the case

- **GIVEN** a suite case whose expected document is not in the store
- **WHEN** `knot-sync bench` runs
- **THEN** that case is counted as a fail
- **AND** the overall exit code remains 0 if the command itself succeeded
  (suite failures are reported in the results, not as a config error)

### Requirement: Catalog resolution cases (optional section)

The suite MAY include catalog column-resolution cases (source, table,
physical or business name). When a catalog file is loaded, `bench` SHALL
score whether the name resolves; when reporting **before/after catalog**,
before = resolve without catalog (physical names only / no business labels),
after = resolve with catalog. If no catalog file exists, catalog cases SHALL
be skipped with an explicit note.

#### Scenario: Business name resolves after catalog

- **GIVEN** catalog maps column `TKSK_CD` to label ja `得意先コード`
- **AND** a suite case asks to resolve `得意先コード` on that table
- **WHEN** bench runs with the catalog loaded
- **THEN** the after score counts the case as pass

### Requirement: Machine-readable JSON output

`knot-sync bench --json` SHALL emit a JSON object with stable English keys for
token totals, suite summary counts, and per-case results suitable for CI or
spreadsheets. Human mode remains the default.

#### Scenario: JSON keys are English

- **WHEN** the user runs `knot-sync bench --json` successfully
- **THEN** top-level keys such as `tokens` and `suite` are English
- **AND** `--lang ja` does not rename those keys

### Requirement: Offline and read-only toward sources

`bench` SHALL NOT open network connections, SHALL NOT write to configured
customer source folders or databases, and SHALL NOT modify the document store
except reading it. It MAY read the catalog and bench suite files.

#### Scenario: No source writes

- **GIVEN** a folder source with existing files
- **WHEN** `knot-sync bench` completes
- **THEN** no file under that source path is created, modified, or deleted
