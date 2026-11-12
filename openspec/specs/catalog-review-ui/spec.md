# catalog-review-ui Specification

## Purpose

Provides a local loopback web UI so operators can review and confirm Semantic
Catalog entries without hand-editing YAML, while never writing to customer
sources.

## Requirements

### Requirement: ui CLI command

`knot-sync ui` SHALL start a local web server that serves the bundled catalog
review UI. Help text SHALL list `ui` as available. The process SHALL exit
non-zero with an actionable message when the config or catalog path cannot be
used.

#### Scenario: Help lists ui

- **WHEN** the user runs `knot-sync --help`
- **THEN** the help text includes the `ui` command

#### Scenario: Missing config fails clearly

- **WHEN** the user runs `knot-sync ui -c /no/such/config.yaml`
- **THEN** the process exits with code 1
- **AND** stderr tells the user to run `knot-sync init` or fix `--config`

### Requirement: Loopback-only bind

The UI server SHALL listen on `127.0.0.1` (IPv4 loopback) by default. It MUST
NOT bind to `0.0.0.0` or other non-loopback interfaces in this change. A port
MAY be configurable; when the chosen port is busy, the command SHALL fail with
an actionable error (do not silently pick another host).

#### Scenario: Default listen address is loopback

- **WHEN** `knot-sync ui` starts successfully with defaults
- **THEN** the server accepts connections on `127.0.0.1`
- **AND** stderr or stdout prints a local URL using `127.0.0.1`

### Requirement: Bundled assets with no CDN

The published npm package SHALL include the built UI static assets. At runtime
the UI MUST load scripts/styles only from the local server (no external CDN
or network fetches for UI chrome).

#### Scenario: HTML references local assets only

- **WHEN** the UI index HTML is inspected in the published/built output
- **THEN** script and stylesheet URLs are relative or same-origin paths
- **AND** they do not point at third-party CDNs

### Requirement: Catalog review screen

The UI SHALL let an operator browse catalog sources, tables, and columns;
edit label fields `ja` / `vi` / `en`, description, `values`, `pii`, `expose`,
and `reviewed`; and save changes to the configured catalog YAML path.

#### Scenario: Japanese column label editable

- **GIVEN** a catalog with source `erp`, table `受注`, column `TKSK_CD`
- **WHEN** the operator sets label ja to `得意先コード` and saves
- **THEN** the catalog file on disk stores that ja label for that column

#### Scenario: Mark reviewed persists

- **WHEN** the operator sets `reviewed: true` on a column and saves
- **THEN** a subsequent load of the catalog file shows `reviewed: true` for
  that column

#### Scenario: Filter unreviewed columns

- **WHEN** the catalog has both reviewed and unreviewed columns
- **THEN** the UI offers a way to focus on unreviewed entries

### Requirement: Writes stay off customer sources

The UI and its local API SHALL write only the KnotSync catalog file (and MAY
touch other KnotSync-owned paths under the store/config directory if needed
for UI state). They MUST NOT create, modify, move, or delete files inside
configured source folders, and MUST NOT run write SQL against customer
databases.

#### Scenario: Save does not alter source folder

- **GIVEN** a folder source with existing files
- **WHEN** the operator saves catalog edits via the UI
- **THEN** no file under that source path is created, modified, or deleted

### Requirement: UI chrome locale

UI chrome (labels, buttons, empty states) SHALL follow the same locale
resolution as the CLI (`--lang`, then `cli.locale`, then env heuristic, else
`en`) for `en`, `ja`, and `vi`. Catalog physical names and stored label field
values remain as stored data (not auto-translated).

#### Scenario: Japanese UI chrome

- **WHEN** the user runs `knot-sync ui --lang ja`
- **THEN** primary UI chrome is Japanese
- **AND** physical column names such as `TKSK_CD` remain unchanged

### Requirement: Purpose and boundary explainer in UI

The Catalog Review UI SHALL display a concise localized (`en`, `ja`, `vi`) explainer stating that the screen is for adding human-readable business meanings to cryptic database columns (for accurate AI queries) and that edits save only to `knot-sync.catalog.yaml` without modifying source databases.

#### Scenario: Vietnamese explainer banner in UI chrome

- **WHEN** the UI chrome dictionary is queried for locale `vi` (or opened with `?lang=vi`)
- **THEN** it includes a Vietnamese explainer mentioning labeling database columns for AI and that source databases are not modified

#### Scenario: Japanese explainer banner in UI chrome

- **WHEN** the UI chrome dictionary is queried for locale `ja` (or opened with `?lang=ja`)
- **THEN** it includes a Japanese explainer mentioning labeling database columns for AI and that source databases are not modified

### Requirement: Read-only Documents & Health tab

`knot-sync ui` SHALL provide a top-level **Documents & Health** view alongside **Catalog Review**, allowing operators to inspect indexed document titles, source IDs, document types, PII/guard badges, and sanitized snippets strictly read-only. No UI control or API endpoint SHALL modify documents or customer sources.

#### Scenario: Tab navigation switches between Catalog Review and Documents & Health

- **GIVEN** the operator opens `knot-sync ui` in a browser
- **WHEN** the operator switches to the **Documents & Health** tab
- **THEN** indexed documents, badges, and source health metrics render in read-only mode
- **AND** customer source files and databases remain untouched

### Requirement: Never expose unmasked PII in Document Explorer

Document Explorer API responses and UI views MUST ONLY return stored sanitized snippets, finding counts, and category/risk summaries (`piiSummary`, `guardRisk`, `guardSummary`). They MUST omit `metadata.originalContent`, `metadata.originalTables`, and raw unmasked PII substrings.

#### Scenario: Document detail omits originalContent and raw PII

- **GIVEN** an indexed document with masked PII (`[PII:cccd]`) and `metadata.originalContent` present in SQLite
- **WHEN** `GET /api/documents` returns that document
- **THEN** the response includes the masked snippet and PII count/type summary
- **AND** `originalContent` and raw unmasked PII do not appear in the JSON payload

### Requirement: Document search and risk filtering

The UI and `GET /api/documents` endpoint SHALL support filtering documents by keyword (`q`, matching Japanese, Vietnamese, and ASCII terms), `sourceId`, `type`, and guard risk (`low` | `medium` | `high`) with bounded pagination.

#### Scenario: Japanese keyword and Vietnamese path filter documents

- **GIVEN** SQLite contains a document titled `"令和6年度 請求書一覧"` and `"Hóa đơn tháng 5"`
- **WHEN** the operator queries `GET /api/documents?q=請求書`
- **THEN** `"令和6年度 請求書一覧"` is returned while unrelated documents are excluded

### Requirement: Scan and run issue visibility

The UI and `GET /api/health-summary` endpoint SHALL display per-source inventory health metrics (file count, document count, duplicates, old/empty files) and recorded `scan` / `run` issues (`sourceId`, `path`, `code`, `message`). When no SQLite store file exists yet, the API SHALL return an empty-store indicator without creating an empty database file.

#### Scenario: Missing SQLite store returns clean empty state

- **GIVEN** `knot-sync ui` starts with a configured `storePath` that has not been created yet
- **WHEN** the client requests `GET /api/documents` or `GET /api/health-summary`
- **THEN** the server responds `200` with `storeExists: false` and empty lists
- **AND** no SQLite file is created on disk

### Requirement: Localized Documents & Health chrome

All Documents & Health labels, tabs, filter controls, risk badges, and empty states SHALL support `en`, `ja`, and `vi` locales using the same locale resolution as Catalog Review, while preserving stored document titles and paths verbatim.

#### Scenario: Vietnamese locale renders Documents & Health labels

- **WHEN** the UI chrome dictionary is queried for `vi` (or opened with `?lang=vi`)
- **THEN** tab labels, search placeholder, risk badges, and health section headings appear in Vietnamese
- **AND** stored document titles remain unmodified
