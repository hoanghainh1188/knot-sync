# pii-masking Specification

## Purpose

Detects personal data in extracted documents, applies a configured masking mode
before persistence, and optionally estimates PII prevalence during `scan`
without storing match text.

## Requirements

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
`phone-vn`, `cccd`, `my-number` (check digit required), `credit-card` (Luhn),
`mst-vn` (Vietnamese tax code), `bank-account` (label/prefix-aided digit runs),
and `person-name` (JP/VN name heuristics). Overlapping matches SHALL be resolved
deterministically (longest span, then earlier start). Prefer stronger validators
when spans collide (e.g. valid `my-number` over `cccd`; `mst-vn` over bare
digit runs claimed as bank account when both match the same digits).

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

#### Scenario: Vietnamese enterprise MST

- **WHEN** content contains a 10-digit MST such as `MST: 0312345678`
- **THEN** a finding with rule `mst-vn` is recorded for the digit span

#### Scenario: Vietnamese branch MST

- **WHEN** content contains a 13-digit branch MST such as `0312345678-001`
- **THEN** a finding with rule `mst-vn` is recorded covering the full tax id

#### Scenario: Bank account near label

- **WHEN** content contains `Số tài khoản: 0123456789` (or JP `口座番号` / `口座`)
- **THEN** a finding with rule `bank-account` is recorded for the account digits

#### Scenario: Japanese surname heuristic with label

- **WHEN** content contains `氏名: 山田 太郎`
- **THEN** a finding with rule `person-name` is recorded for the name span

#### Scenario: Vietnamese name heuristic with label

- **WHEN** content contains `Họ tên: Nguyễn Văn An`
- **THEN** a finding with rule `person-name` is recorded for the name span

### Requirement: Name heuristics stay label-gated

The `person-name` rule SHALL require a nearby JP/VN name label (or equivalent
documented cue) before matching curated surname/given-name dictionary tokens.
Bare dictionary words without a label MUST NOT produce a finding, to limit false
positives on ordinary prose.

#### Scenario: Dictionary word without label ignored

- **WHEN** content contains `山田` alone with no name label nearby
- **THEN** no `person-name` finding is recorded for that token

### Requirement: pii.mode application

Config `pii.mode` SHALL be `mask`, `hash`, or `drop` (default `mask`). Matched
spans in `content`, tables, and retained metadata SHALL be transformed before
upsert. In `mask` mode, `tokenFormat: typed` SHALL emit `[PII:<RULE_UPPER>]`
(keeping `****-****-****-<last4>` for `credit-card`) while default/`legacy`
emits `***`. In `hash` mode, default/`typed` SHALL emit
`pii_<rule>_<16-char-hmac>` while `legacy` emits `pii_<16-char-hmac>`.

#### Scenario: Mask mode

- **WHEN** `pii.mode` is `mask` and content contains `user@example.com`
- **THEN** stored `content` does not contain `user@example.com`
- **AND** a redaction token appears in its place

#### Scenario: Typed mask mode with Japanese and Vietnamese entities

- **WHEN** `pii.mode` is `mask` with `pii.tokenFormat: typed` and content contains `氏名: 山田 太郎` and `CCCD: 079123456789`
- **THEN** stored `content` replaces the name with `[PII:PERSON_NAME]` and the ID with `[PII:CCCD]`

#### Scenario: Hash stability

- **WHEN** `pii.mode` is `hash` and the same email appears in two documents
- **THEN** both get the same replacement token `pii_email_<16-char-hmac>` on this install (or `pii_<16-char-hmac>` when `tokenFormat` is `legacy`)

#### Scenario: Drop mode

- **WHEN** `pii.mode` is `drop` and content contains an email
- **THEN** stored `content` contains neither the email nor a hash token for it

### Requirement: PII allowlist suppression

When `pii.allowlist` lists non-empty strings, detection during `run` and
`scan --pii` SHALL suppress any candidate PII span that falls within an
allowlisted phrase occurrence in the text or immediately follows an allowlisted
prefix (compared case-insensitively). Suppressed spans MUST NOT be masked or
recorded in `Document.pii`.

#### Scenario: Japanese company name with surname not masked

- **WHEN** `pii.allowlist` includes `"佐藤工業株式会社"` and content contains `"取引先 / 氏名: 佐藤工業株式会社"`
- **THEN** no `person-name` finding is recorded and `"佐藤工業株式会社"` remains unmasked in `content`

#### Scenario: Vietnamese order code prefix not masked as CCCD

- **WHEN** `pii.allowlist` includes `"ORD-"` and content contains `"Mã đơn hàng: ORD-079123456789"`
- **THEN** no `cccd` finding is recorded and `"ORD-079123456789"` remains intact

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

### Requirement: Rule-based PII remains default; model findings optional

Deterministic PII rules and `pii.mode` SHALL continue to work without the
guard-llm plugin and WITHOUT requiring a local LLM. When the guard-llm
enricher appends PII findings, those findings MUST use the same `Document.pii`
shape and MUST be processed under the configured `pii.mode`.

#### Scenario: PII works with model plugin unloaded

- **GIVEN** no guard-llm plugin under `plugins:`
- **WHEN** `run` processes text matching a Vietnamese phone rule
- **THEN** PII findings are applied under `pii.mode` as today
