# injection-guard Specification

## Purpose

Detects indirect prompt-injection signals in document text, applies a configured
guard mode before persistence, and records risk plus span findings for later MCP
framing—without treating document content as instructions.

## Requirements

### Requirement: Built-in guard plugin

The system SHALL provide package `packages/guard` published as
`@hoanghainh/knot-sync-guard` that registers built-in `guard-rule` ids for the
rules in this capability. The plugin SHALL load by default without a `plugins:`
entry.

#### Scenario: Built-in listed

- **WHEN** the user runs `knot-sync plugins` with no extra plugins
- **THEN** output includes the guard plugin and at least one `guard-rule:` id

### Requirement: Detection rules

Registered built-in rules SHALL detect at least: instruction-like phrases in
English, Japanese, and Vietnamese; zero-width and bidi control characters; and
hidden text when the document exposes it via extractor metadata. Overlapping
matches SHALL be resolved deterministically (longest span, then earlier start).

#### Scenario: Japanese instruction phrase

- **WHEN** content contains `以前の指示を無視`
- **THEN** a finding for an instruction-phrase rule is recorded for that span

#### Scenario: Vietnamese instruction phrase

- **WHEN** content contains `bỏ qua hướng dẫn trước`
- **THEN** a finding for an instruction-phrase rule is recorded for that span

#### Scenario: Zero-width characters

- **WHEN** content contains a zero-width space (U+200B) between visible words
- **THEN** a finding for a control-character rule is recorded covering that character

#### Scenario: Hidden text from extractor metadata

- **WHEN** document metadata includes extractor-provided hidden text that contains
  an English phrase such as `ignore previous instructions`
- **THEN** a finding is recorded and the document risk is elevated accordingly

### Requirement: guard.mode application

Config `guard.mode` SHALL be `flag`, `strip`, or `block` (default `flag`). After
detection:

- `flag` — content and tables are left as-is; findings and risk are stored
- `strip` — matched spans and control characters in `content` and table cells
  SHALL be removed or replaced with a safe placeholder before upsert
- `block` — the document MUST NOT be upserted as ready content; the store receives
  an error/blocked document with empty (or neutralized) content, an actionable
  message, and findings/risk retained without promoting injected text as trusted

#### Scenario: Flag mode keeps text

- **WHEN** `guard.mode` is `flag` and content contains `ignore previous instructions`
- **THEN** stored `content` still contains that phrase
- **AND** `Document.guard` findings are non-empty and risk is not `none`

#### Scenario: Strip mode removes phrase

- **WHEN** `guard.mode` is `strip` and content contains `ignore previous instructions`
- **THEN** stored `content` does not contain that phrase

#### Scenario: Block mode refuses ready upsert

- **WHEN** `guard.mode` is `block` and content contains a matched instruction phrase
- **THEN** the stored document has status `error` (or equivalent blocked status)
- **AND** stored `content` does not present the unstripped injection as ready text

### Requirement: Findings and risk without treating text as instructions

`Document.guard` SHALL list each finding as `{ rule, start, end }` with offsets
into the **pre-transform** text for `content` (same pattern as `Document.pii`).
The document SHALL also carry a risk level (`none` | `low` | `medium` | `high`)
derived from findings. The store MUST NOT treat matched document text as host
instructions; findings are data about the document.

#### Scenario: Finding positions

- **WHEN** a document has one English injection phrase match
- **THEN** `guard` contains one entry with that rule id and `start`/`end` covering
  the span in the pre-transform text
- **AND** risk is greater than `none`

### Requirement: No new dependencies

`packages/guard` SHALL depend only on Node.js built-ins and workspace packages.

#### Scenario: Manifest check

- **WHEN** `packages/guard/package.json` is inspected
- **THEN** it has no third-party runtime dependencies outside the workspace
