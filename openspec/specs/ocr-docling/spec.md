# ocr-docling Specification

## Purpose

Provides opt-in, local OCR for scanned PDFs and images via a Docling Docker
sidecar so KnotSync can turn paper-derived files into Documents without cloud
OCR or writing back to customer sources.

## Requirements

### Requirement: Opt-in OCR extractor plugin

The system SHALL provide an extractor plugin (not loaded as a default built-in)
that operators enable by listing it under config `plugins:`. When loaded and
licensed, it SHALL OCR supported image types and eligible scanned PDFs into a
Document whose `content` is Markdown. OCR SHALL run through a **local Docker**
Docling (or Docling-compatible) container—not a cloud OCR HTTP API.

#### Scenario: Japanese scan image becomes a document

- **GIVEN** the OCR plugin is listed in `plugins:` with a valid license
- **AND** Docker and the configured Docling image are available locally
- **AND** the inventory contains `経理/請求書.png` whose pixels depict the text
  `請求書`
- **WHEN** `knot-sync run` processes that file
- **THEN** a Document is stored whose content includes `請求書` (OCR permitting)
- **AND** the source file under the configured source root is unchanged

#### Scenario: Plugin omitted keeps images unsupported

- **GIVEN** config does not list the OCR plugin
- **WHEN** `knot-sync run` processes an inventory entry for `scan.png`
- **THEN** the file is reported as unsupported or without an OCR document
- **AND** the run does not invoke Docker for that file

### Requirement: Local Docker only (no cloud OCR)

While OCR is running, the plugin SHALL NOT call third-party cloud OCR endpoints.
Operators MAY pull the Docling image during setup; that pull is outside the
`run` success path and MUST be documented as a setup step.

#### Scenario: Missing Docker fails softly

- **GIVEN** the OCR plugin is loaded
- **AND** the `docker` CLI is missing or the daemon is unreachable
- **WHEN** OCR is required for a file
- **THEN** the extractor returns a failed result with an actionable code/message
  telling the operator to install/start Docker and pull the documented image
- **AND** `run` continues with other files

### Requirement: License self-check

The OCR plugin SHALL validate its own license (environment variable and/or
plugin settings) before performing OCR. The KnotSync core SHALL NOT implement
that license check. Invalid or missing license SHALL fail softly with guidance
to set the documented license env/key.

#### Scenario: Missing license blocks OCR

- **GIVEN** the OCR plugin is listed but no valid license is configured
- **WHEN** `knot-sync run` would OCR `Hóa đơn.jpg`
- **THEN** OCR does not run
- **AND** the issue/message names how to set the license (env or plugin key)

### Requirement: Timeouts and size bounds

OCR SHALL honor documented timeout and max input size limits (plugin settings
and/or reuse of `extraction.*` bounds). Oversized or timed-out OCR SHALL soft-fail
without aborting the whole `run`.

#### Scenario: OCR timeout is soft-fail

- **GIVEN** OCR is configured with a short timeout
- **WHEN** Docling does not finish before the timeout
- **THEN** that file is recorded as a failed/skipped OCR issue
- **AND** other inventory files still process
