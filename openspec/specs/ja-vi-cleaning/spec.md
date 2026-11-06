# ja-vi-cleaning Specification

## Purpose

Normalizes Japanese and Vietnamese legacy text after extraction (NFKC, wareki,
ISO dates, TCVN3/VNI, token reduction) so agents receive cleaner, searchable
document content while originals and token estimates stay in the store.

## Requirements

### Requirement: Cleaner plugin package

The system SHALL provide package `packages/cleaner-ja-vi` published as
`@hoanghainh/knot-sync-cleaner-ja-vi` that exports a `Cleaner` (or factory)
registered as a built-in plugin under a stable id such as `cleaner-ja-vi`.

#### Scenario: Built-in registration

- **WHEN** the CLI loads default plugins
- **THEN** `cleaner-ja-vi` is registered without requiring config `plugins:`
  entries
- **AND** its `Cleaner.clean` is invoked for documents that completed
  extraction successfully

### Requirement: Config section cleaning

Config MAY include a top-level `cleaning` object. When omitted, all cleaning
steps SHALL default to enabled. Unknown keys under `cleaning` SHALL fail
config load with an actionable error.

Allowed keys (boolean, default `true` when `cleaning` is present but a key is
omitted):

- `nfkc`
- `wareki`
- `datesIso`
- `legacyVietnamese`
- `tokenReduce`

#### Scenario: Defaults when cleaning omitted

- **WHEN** config has no `cleaning` key
- **THEN** every cleaning step runs as if each toggle were `true`

#### Scenario: Partial override

- **WHEN** config sets `cleaning: { wareki: false }` and omits other keys
- **THEN** wareki conversion is skipped
- **AND** other steps remain enabled

### Requirement: NFKC normalization

When `cleaning.nfkc` is enabled, the cleaner SHALL apply Unicode NFKC to
document content and string cells in tables.

#### Scenario: Full-width digits become ASCII

- **WHEN** content contains `２０２４`
- **THEN** after cleaning the corresponding text contains `2024`

### Requirement: Wareki to Gregorian

When `cleaning.wareki` is enabled, the cleaner SHALL rewrite Japanese era dates
in content (and table string cells) to Gregorian calendar years/dates.

Supported eras SHALL include at least: 明治, 大正, 昭和, 平成, 令和.
`元年` SHALL mean year 1 of the era. Kanji numerals commonly used in era years
(e.g. 三十一) SHALL be accepted where practical for year/month/day fields.

#### Scenario: Reiwa year

- **WHEN** content contains `令和5年4月1日`
- **THEN** after cleaning the date is expressed as Gregorian `2023-04-01` (or
  an equivalent unambiguous Gregorian form that includes year 2023, month 4,
  day 1)

#### Scenario: Gannen

- **WHEN** content contains `令和元年`
- **THEN** after cleaning the year refers to Gregorian 2019

### Requirement: Dates to ISO 8601

When `cleaning.datesIso` is enabled, the cleaner SHALL normalize common
date-like substrings in content and table string cells to ISO 8601 forms
(`YYYY-MM-DD`, or `YYYY-MM` / `YYYY` when day/month are absent). Ambiguous
numeric triples SHALL be left unchanged.

#### Scenario: Slash date

- **WHEN** content contains `2024/1/5`
- **THEN** after cleaning it becomes `2024-01-05`

#### Scenario: Japanese calendar date

- **WHEN** content contains `2024年1月5日`
- **THEN** after cleaning it becomes `2024-01-05`

#### Scenario: Ambiguous day-month left alone

- **WHEN** content contains `01/02/2024` and day vs month cannot be resolved
- **THEN** after cleaning that substring is unchanged

### Requirement: Legacy Vietnamese encodings

When `cleaning.legacyVietnamese` is enabled, the cleaner SHALL detect TCVN3
and VNI legacy encodings in text that was already loaded as a Unicode string
(mis-decoded legacy bytes or legacy font glyph sequences as documented in
design) and convert them to proper Unicode Vietnamese.

When neither encoding is detected with sufficient confidence, text SHALL be
left unchanged for this step.

#### Scenario: TCVN3 sample converts

- **WHEN** content is a known TCVN3 fixture string that represents Vietnamese
  with diacritics under TCVN3 mapping
- **THEN** after cleaning the text contains correct Unicode Vietnamese
  characters for that fixture

### Requirement: Token reduction

When `cleaning.tokenReduce` is enabled, the cleaner SHALL collapse redundant
whitespace, drop wholly empty table rows (and wholly empty columns when safe),
and strip repeated header/footer lines using the heuristic in design.

#### Scenario: Whitespace collapse

- **WHEN** content contains multiple consecutive spaces or blank lines
- **THEN** after cleaning redundant whitespace is reduced

#### Scenario: Empty table row dropped

- **WHEN** a table has a row whose every cell is empty or whitespace
- **THEN** after cleaning that row is absent from the table

### Requirement: Original text retained

After cleaning, the store SHALL retain the pre-clean extracted text for
traceability. Cleaned text SHALL be what FTS and document `content` expose to
agents.

#### Scenario: Original available after run

- **WHEN** a document is cleaned and upserted
- **THEN** the stored document still exposes the original extracted string
  (e.g. via metadata key `originalContent`)
- **AND** `content` (and table cell strings) reflect the cleaned result

### Requirement: Token estimates

For each cleaned document the cleaner SHALL record estimated token counts
before and after cleaning (character-based heuristic documented in design,
not a vendor tokenizer). Values SHALL be stored on the document (e.g.
metadata `tokensBefore` / `tokensAfter`) as non-negative numbers.

#### Scenario: Counts recorded

- **WHEN** cleaning runs on non-empty content
- **THEN** `tokensBefore` and `tokensAfter` are present
- **AND** `tokensAfter` is less than or equal to `tokensBefore` when only
  reductive steps ran, or may differ when normalization expands some glyphs

### Requirement: No new dependencies

`packages/cleaner-ja-vi` SHALL use only Node.js built-ins and workspace
packages. It SHALL NOT add npm dependencies beyond the workspace.

#### Scenario: Package manifests

- **WHEN** `packages/cleaner-ja-vi/package.json` is inspected
- **THEN** it has no runtime dependency on third-party registries packages
  outside the monorepo workspace protocol
