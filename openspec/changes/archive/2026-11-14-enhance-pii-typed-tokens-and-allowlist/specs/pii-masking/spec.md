# pii-masking Spec Delta

## MODIFIED Requirements

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

## ADDED Requirements

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
