# housen-excel Specification

## Purpose

Provides opt-in, local layout-aware extraction for Japanese form-like /
方眼紙-style Excel workbooks so KnotSync Documents expose structured fields
instead of a flat first-row-as-header dump—without writing back to sources or
calling network services.

## Requirements

### Requirement: Opt-in housen Excel extractor plugin

The system SHALL provide an extractor plugin (not loaded as a default built-in)
that operators enable by listing it under config `plugins:`. When loaded and
licensed, it SHALL extract supported `.xlsx` workbooks that are classified as
form-like into a Document whose `content` is structured Markdown (sections and
label/value pairs or small tables as appropriate). Detection and extraction
SHALL run fully locally with no network calls.

#### Scenario: Japanese application form becomes structured fields

- **GIVEN** the housen plugin is listed in `plugins:` with a valid license
- **AND** the inventory contains `申請/休暇届.xlsx` whose sheet has labels such
  as `氏名` and `期間` beside value cells (not a plain data table)
- **WHEN** `knot-sync run` processes that file
- **THEN** a Document is stored whose content includes those labels with their
  adjacent values in a structured form (not only a single flat header row dump)
- **AND** the source file under the configured source root is unchanged

#### Scenario: Plugin omitted keeps office flat extract

- **GIVEN** config does not list the housen plugin
- **WHEN** `knot-sync run` processes a form-like `.xlsx`
- **THEN** extraction uses the built-in office path as today
- **AND** no housen-specific layout rewrite runs

### Requirement: License self-check

The housen plugin SHALL validate its own license (environment variable and/or
plugin settings) before performing layout-aware extraction. The KnotSync core
SHALL NOT implement that license check. Invalid or missing license SHALL fail
softly with guidance to set the documented license env/key, without aborting
the whole `run` for other files.

#### Scenario: Missing license blocks housen rewrite

- **GIVEN** the housen plugin is listed but no valid license is configured
- **WHEN** `knot-sync run` would rewrite `Hóa đơn nội bộ.xlsx` via housen
- **THEN** housen layout rewrite does not replace the office Document
- **AND** the issue/message names how to set the license (env or plugin key)

### Requirement: Timeouts and size bounds

Housen extraction SHALL honor documented timeout and max input size limits
(plugin settings and/or reuse of `extraction.*` bounds). Oversized or timed-out
extraction SHALL soft-fail without aborting the whole `run`.

#### Scenario: Housen timeout is soft-fail

- **GIVEN** housen is configured with a short timeout
- **WHEN** layout extraction does not finish before the timeout
- **THEN** that file is recorded as a failed/skipped housen issue (or falls
  back per design without crashing the run)
- **AND** other inventory files still process
