# Spec: pii-masking

## Purpose

Detects personal data in extracted documents, applies a configured masking mode
before persistence, and optionally estimates PII prevalence during `scan`
without storing match text.

## ADDED Requirements

### Requirement: Built-in pii-basic plugin

The system SHALL provide package `packages/pii-basic` published as
`@hoanghainh/knot-sync-pii-basic` that registers built-in `pii-rule` ids for the
rules in this capability. The plugin SHALL load by default without a `plugins:`
entry.

#### Scenario: Built-in listed

- **WHEN** the user runs `knot-sync plugins` with no extra plugins
- **THEN** output includes the pii-basic plugin and at least one `pii-rule:` id

### Requirement: Detection rules

Registered built-in rules SHALL detect at least: `email`, `phone-jp`,
`phone-vn`, `cccd`, `my-number` (check digit required), and `credit-card`
(Luhn). Overlapping matches SHALL be resolved deterministically (longest span,
then earlier start).

#### Scenario: Japanese My Number with valid check digit

- **WHEN** content contains a 12-digit My Number that passes the check digit
- **THEN** a finding with rule `my-number` is recorded for that span

#### Scenario: Invalid My Number ignored

- **WHEN** content contains 12 digits that fail the My Number check digit
- **THEN** no `my-number` finding is recorded for that span

#### Scenario: Vietnamese CCCD

- **WHEN** content contains a 12-digit CCCD such as `079123456789`
- **THEN** a finding with rule `cccd` is recorded

#### Scenario: Japanese phone

- **WHEN** content contains `03-1234-5678`
- **THEN** a finding with rule `phone-jp` is recorded

### Requirement: pii.mode application

Config `pii.mode` SHALL be `mask`, `hash`, or `drop` (default `mask`). After
detection, each matched span in `content` and table cell strings SHALL be
transformed per mode (redaction token, stable salted hash, or removal) as
documented in design, before upsert.

#### Scenario: Mask mode

- **WHEN** `pii.mode` is `mask` and content contains `user@example.com`
- **THEN** stored `content` does not contain `user@example.com`
- **AND** a redaction token appears in its place

#### Scenario: Hash stability

- **WHEN** `pii.mode` is `hash` and the same email appears in two documents
- **THEN** both get the same replacement token for that email on this install

#### Scenario: Drop mode

- **WHEN** `pii.mode` is `drop` and content contains an email
- **THEN** stored `content` contains neither the email nor a hash token for it

### Requirement: Findings without raw values

`Document.pii` SHALL list each finding as `{ rule, start, end }` with offsets
into the **pre-mask** text (as already defined on `PiiFinding`). The store MUST
NOT persist the matched substring or any other copy of the unmasked PII in
metadata, content, tables, or logs from this step.

#### Scenario: Finding positions

- **WHEN** a document has one email match
- **THEN** `pii` contains one entry with `rule` `email` and `start`/`end` covering that span in the pre-mask text
- **AND** neither content nor metadata contains the original email string

### Requirement: Salt for hash mode

For `hash` mode the installation SHALL use a secret salt stored only on the
local machine (path documented in design, created on first use). The salt MUST
NOT be embedded in the repo or transmitted over the network.

#### Scenario: Salt created locally

- **WHEN** `run` first needs hash mode and no salt file exists
- **THEN** a new random salt is written under the local data/store area
- **AND** subsequent runs reuse it

### Requirement: scan --pii estimate

`knot-sync scan --pii` SHALL, during or after inventory, sample readable text
from supported text-like files (design: which extensions / byte caps) and count
how many files have at least one detection hit. The estimate SHALL appear in
text and `--json` output. Match text MUST NOT be written to the store or printed.

#### Scenario: Estimate without storing matches

- **WHEN** the user runs `knot-sync scan --pii` on a folder with one `.txt` containing an email
- **THEN** the output includes a positive PII file estimate for that source
- **AND** the store has no document rows created by this scan
- **AND** stdout/stderr do not print the email address

#### Scenario: Flag off by default

- **WHEN** the user runs `knot-sync scan` without `--pii`
- **THEN** no PII sampling runs and no PII estimate field is required

### Requirement: No new dependencies

`packages/pii-basic` SHALL depend only on Node.js built-ins and workspace
packages.

#### Scenario: Manifest check

- **WHEN** `packages/pii-basic/package.json` is inspected
- **THEN** it has no third-party runtime dependencies outside the workspace
