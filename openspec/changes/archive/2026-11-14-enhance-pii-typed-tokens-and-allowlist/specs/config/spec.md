# config Spec Delta

## MODIFIED Requirements

### Requirement: Optional pii section

Config MAY include a `pii` object with optional keys `mode` (`mask` | `hash` |
`drop`, default `mask`), `saltPath` (non-empty string path for the hash salt
file, defaulting under the store directory), `tokenFormat` (`legacy` | `typed`),
and `allowlist` (array of non-empty strings). Unknown keys under `pii` or
invalid values SHALL fail config load with an actionable `ConfigError` listing
allowed keys or values.

#### Scenario: Default mode

- **WHEN** config has no `pii` key
- **THEN** effective mode is `mask`

#### Scenario: Reject bad mode

- **WHEN** config contains `pii: { mode: redact }`
- **THEN** config load fails and the error lists allowed modes

#### Scenario: Valid tokenFormat and allowlist

- **WHEN** config contains `pii: { mode: mask, tokenFormat: typed, allowlist: ["佐藤工業株式会社", "ORD-"] }`
- **THEN** config load succeeds with `pii.tokenFormat === "typed"` and `pii.allowlist` containing those two entries

#### Scenario: Reject invalid tokenFormat or empty allowlist item

- **WHEN** config contains `pii: { tokenFormat: custom }` or `pii: { allowlist: [""] }`
- **THEN** config load fails with an actionable `ConfigError` naming the invalid `pii` field
