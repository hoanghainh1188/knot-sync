# Spec Delta

## MODIFIED Requirements

### Requirement: Detection rules

Registered built-in rules SHALL detect at least: instruction-like phrases in
English, Japanese, and Vietnamese; zero-width and bidi control characters;
hidden text when the document exposes it via extractor metadata; suspicious
Base64 payloads; markdown image or link exfiltration patterns; and dense
zero-width / control-character floods. Overlapping matches SHALL be resolved
deterministically (longest span, then earlier start).

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

#### Scenario: Suspicious Base64 payload

- **WHEN** content contains a long Base64-looking token (documented minimum length)
  that is not a short identifier
- **THEN** a finding with rule `base64-payload` is recorded for that span

#### Scenario: Markdown image exfiltration

- **WHEN** content contains `![x](https://evil.example/exfil)`
- **THEN** a finding with rule `md-exfil` is recorded covering the markdown image

#### Scenario: Control-character flood

- **WHEN** content contains many zero-width/control characters in a short window
  (at or above the documented flood threshold)
- **THEN** a finding with rule `controls-flood` is recorded
- **AND** document risk is elevated relative to a single isolated control hit

## ADDED Requirements

### Requirement: Markdown link exfiltration is detected

The `md-exfil` rule SHALL also match markdown links of the form
`[label](http://…)` / `[label](https://…)` when used as an exfiltration-style
signal (same rule id as image form). Findings MUST NOT trigger outbound network
requests; detection is pattern-only on local text.

#### Scenario: Markdown link exfiltration

- **WHEN** content contains `[click](https://attacker.example/collect?d=1)`
- **THEN** a finding with rule `md-exfil` is recorded
- **AND** no network request is made
