# Spec Delta

## MODIFIED Requirements

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

## ADDED Requirements

### Requirement: Name heuristics stay label-gated

The `person-name` rule SHALL require a nearby JP/VN name label (or equivalent
documented cue) before matching curated surname/given-name dictionary tokens.
Bare dictionary words without a label MUST NOT produce a finding, to limit false
positives on ordinary prose.

#### Scenario: Dictionary word without label ignored

- **WHEN** content contains `山田` alone with no name label nearby
- **THEN** no `person-name` finding is recorded for that token
