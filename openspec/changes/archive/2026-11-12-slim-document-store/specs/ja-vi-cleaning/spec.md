## MODIFIED Requirements

### Requirement: Config section cleaning

Config MAY include a top-level `cleaning` object. When omitted, transformation
steps SHALL default to enabled (`true`) and `keepOriginalText` SHALL default to
`false`. Unknown keys under `cleaning` SHALL fail config load with an
actionable error.

Allowed keys:

- `nfkc` (boolean, default `true`)
- `wareki` (boolean, default `true`)
- `datesIso` (boolean, default `true`)
- `legacyVietnamese` (boolean, default `true`)
- `tokenReduce` (boolean, default `true`)
- `keepOriginalText` (boolean, default `false`)

#### Scenario: Defaults when cleaning omitted

- **WHEN** config has no `cleaning` key
- **THEN** transformation steps (`nfkc`, `wareki`, `datesIso`, `legacyVietnamese`, `tokenReduce`) run as `true` and `keepOriginalText` defaults to `false`

#### Scenario: Partial override

- **WHEN** config sets `cleaning: { wareki: false }` and omits other keys
- **THEN** wareki conversion is skipped
- **AND** other transformation steps remain `true` while `keepOriginalText` remains `false`

### Requirement: Original text retained

When `cleaning.keepOriginalText` is `false` (default), the cleaner and store
SHALL omit pre-clean `originalContent` and `originalTables` copies from
persisted document metadata while continuing to record `tokensBefore`,
`tokensAfter`, and cleaned `content` / `tables`. When
`cleaning.keepOriginalText` is `true`, the cleaner and store SHALL retain
pre-clean `originalContent` (and `originalTables` when tables changed) in
metadata, still subject to PII masking and prompt-injection stripping before
persistence.

#### Scenario: Original available after run

- **GIVEN** config sets `cleaning: { keepOriginalText: true }`
- **WHEN** a Japanese or Vietnamese document is cleaned and upserted
- **THEN** the stored document exposes the PII-masked pre-clean text and tables
  (via metadata keys `originalContent` and `originalTables` when modified)
- **AND** `content` (and table cell strings) reflect the cleaned result

#### Scenario: Default mode omits original copies for Japanese text

- **GIVEN** default config (`cleaning.keepOriginalText` omitted or `false`)
- **WHEN** a Japanese document containing `契約 令和5年4月1日 金額２０２４円` is cleaned and stored
- **THEN** `content` reflects the cleaned text and `metadata.tokensBefore` / `metadata.tokensAfter` are recorded
- **AND** `metadata.originalContent` and `metadata.originalTables` are omitted from the stored document
