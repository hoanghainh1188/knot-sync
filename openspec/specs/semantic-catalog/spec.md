# semantic-catalog Specification

## Purpose

Produces and maintains a local `knot-sync.catalog.yaml` that maps cryptic SQL
table/column names to business labels (ja/vi/en), descriptions, types, and
valid values—preserving human-reviewed entries across re-runs.

## Requirements

### Requirement: catalog package

The system SHALL provide package `packages/catalog` published as
`@hoanghainh/knot-sync-catalog` that can load, merge, and write the catalog
YAML. Runtime third-party dependencies outside the workspace SHALL be limited
to `exceljs` (MIT) for optional Excel definition import.

#### Scenario: Package has exceljs only as Excel dep

- **WHEN** `packages/catalog/package.json` is inspected
- **THEN** its non-workspace runtime dependencies include `exceljs` and no
  GPL/AGPL packages

### Requirement: Catalog entry shape

For each SQL source covered by the catalog, the file SHALL record tables and
columns with at least: physical name, business label fields for ja/vi/en
(optional strings), description, type, valid values (list), pii tag, expose
flag, and reviewed flag.

#### Scenario: Japanese physical name preserved

- **GIVEN** a column physically named `得意先コード`
- **WHEN** it is written to the catalog
- **THEN** the entry retains that physical name and may include a ja business
  label

### Requirement: describe CLI command

`knot-sync describe` SHALL generate or update `knot-sync.catalog.yaml` (path
configurable, default beside the config) for configured SQL sources. Help text
SHALL list `describe` as available. Exit 0 on success; exit 1 on config/DB
errors with an actionable message.

#### Scenario: Describe creates catalog file

- **WHEN** the user runs `knot-sync describe -c <config>` with a valid SQL source
- **THEN** a catalog YAML file is written at the documented path
- **AND** the exit code is 0 on success

### Requirement: Inputs for generation

`describe` SHALL derive suggestions from: SQL introspection of allow-listed
tables/columns; bounded sampling of distinct values when safe; built-in romaji
and Vietnamese abbreviation dictionaries; optional customer dictionary file;
and optional テーブル定義書/項目定義書 Excel when configured. Sampling MUST be
read-only and MUST NOT persist raw sample rows into the catalog beyond distinct
value lists needed for enums.

#### Scenario: Romaji abbreviation

- **WHEN** a column named `TKSK_CD` is described with built-in dictionaries
- **THEN** the suggested ja label includes a 得意先-related expansion for `TKSK`
  and a コード-related expansion for `CD`

#### Scenario: Vietnamese abbreviation

- **WHEN** a column named `ma_kh` is described with built-in dictionaries
- **THEN** the suggested vi label relates to mã / khách hàng

### Requirement: Reviewed entries are preserved

When merging a new `describe` run into an existing catalog, entries with
`reviewed: true` SHALL keep their reviewed fields unchanged. Unreviewed entries
MAY be updated. New tables/columns MAY be added.

#### Scenario: Reviewed column not overwritten

- **GIVEN** catalog column `TKSK_CD` with `reviewed: true` and label ja `得意先コード`
- **WHEN** `describe` runs again with dictionaries that would suggest a different label
- **THEN** the ja label remains `得意先コード` and `reviewed` remains true

### Requirement: Human review via local UI

Operators MAY confirm or edit catalog entries through the local catalog
review UI (`knot-sync ui`) as well as by editing the YAML file directly.
Saving from the UI SHALL produce a catalog document that still satisfies the
catalog entry shape and SHALL set `reviewed` according to the operator’s
choice. Re-running `describe` MUST continue to preserve entries with
`reviewed: true` unchanged.

#### Scenario: UI-reviewed column survives describe

- **GIVEN** a column marked `reviewed: true` with label ja `得意先コード` via
  the review UI
- **WHEN** `knot-sync describe` runs again with dictionaries that would
  suggest a different label
- **THEN** the ja label remains `得意先コード`

### Requirement: Optional definition Excel

When a definition Excel path is configured, `describe` SHALL read mapped
columns (mapping configurable) to fill or suggest labels/descriptions for
matching physical names. Missing Excel SHALL not fail the whole command if the
path is optional; a configured but unreadable path SHALL fail clearly.

#### Scenario: Excel row enriches column

- **GIVEN** a definition sheet maps physical `ma_kh` to a Vietnamese business name
- **WHEN** `describe` runs with that Excel configured
- **THEN** the catalog suggestion for `ma_kh` includes that business name

### Requirement: Optional local-LLM fill for blank columns

When a licensed catalog-llm CatalogSource is registered, `describe` SHALL apply
it only to fill blank column labels (and empty descriptions) after free
dictionary and definition-Excel sources. LLM output MUST NOT mark columns
`reviewed: true`. When the plugin is absent, describe SHALL behave as today.

#### Scenario: Blank column after free sources may receive LLM draft

- **GIVEN** column `ma_xyz` with empty labels after dictionary/Excel
- **AND** catalog-llm is loaded and licensed with a working local endpoint
- **WHEN** `knot-sync describe` runs
- **THEN** the draft MAY include LLM-suggested label/description with
  `reviewed` false

#### Scenario: Non-blank free suggestion is kept

- **GIVEN** dictionary already filled ja for `TKSK_CD`
- **WHEN** describe runs with catalog-llm loaded
- **THEN** the free ja label is retained
- **AND** LLM does not overwrite it
