## ADDED Requirements

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
