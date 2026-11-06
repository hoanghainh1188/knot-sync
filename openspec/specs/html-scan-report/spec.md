# html-scan-report Specification

## Purpose

Turns KnotSync scan health results into one self-contained HTML file that a
non-technical manager can open offline, with English, Japanese, and Vietnamese
labels and no external network assets.

## Requirements

### Requirement: report-html package

The system SHALL provide package `packages/report-html` published as
`@hoanghainh/knot-sync-report-html` that exports a pure function (or small API)
to render HTML from scan result data. The package SHALL have no third-party
runtime dependencies outside the workspace.

#### Scenario: Manifest check

- **WHEN** `packages/report-html/package.json` is inspected
- **THEN** it has no third-party runtime dependencies outside the workspace

### Requirement: Self-contained offline HTML

Generated HTML SHALL be a single file with inline CSS and any needed inline
script. It MUST NOT reference external stylesheets, fonts, images, or scripts
(no CDN, no relative asset folders). Opening the file offline SHALL display the
report without network access.

#### Scenario: No external URLs

- **WHEN** a report is generated for a sample scan
- **THEN** the HTML does not contain `http://` or `https://` resource links for
  styles, scripts, or fonts
- **AND** it includes an inline stylesheet

### Requirement: Light and dark mode

The report SHALL support light and dark presentation via CSS (for example
`prefers-color-scheme` and/or an in-page toggle) without external assets.

#### Scenario: Dark preference

- **WHEN** the HTML includes dark-mode styles
- **THEN** those styles are defined inline in the same file

### Requirement: Trilingual labels with in-page switch

Visible UI labels SHALL be available in English, Japanese, and Vietnamese. The
page SHALL provide a language switch that changes labels without regenerating
the file. Sample or path strings that come from the customer's data remain as
stored (not translated).

#### Scenario: Japanese labels selectable

- **WHEN** the user selects Japanese in the language switch
- **THEN** primary section headings and health labels appear in Japanese

#### Scenario: Vietnamese labels selectable

- **WHEN** the user selects Vietnamese in the language switch
- **THEN** primary section headings and health labels appear in Vietnamese

### Requirement: Health sections

For each source in the scan results, the HTML SHALL present at least: file
count and total size, breakdown by document type, duplicate copy summary with
top duplicate groups (paths as in the scan), counts of old files, empty files,
and unreadable/issue items. When a PII estimate is present on the scan result,
it SHALL be shown; when absent, the report SHALL NOT invent a number.

#### Scenario: Duplicates listed

- **GIVEN** scan results with a duplicate group containing Japanese paths such as
  `営業/見積書.xlsx`
- **WHEN** the HTML report is generated
- **THEN** that path appears in the duplicates section

#### Scenario: PII estimate optional

- **WHEN** scan results include `piiLikelyFiles` for a source
- **THEN** the report shows that estimate for the source
- **WHEN** scan results omit PII estimates
- **THEN** the report does not show a fabricated PII count
