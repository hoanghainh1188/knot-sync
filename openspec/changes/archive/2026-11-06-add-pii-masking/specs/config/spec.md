# Spec: config (delta)

## ADDED Requirements

### Requirement: Optional pii section

Config MAY include a `pii` object. Allowed keys:

- `mode` — string enum: `mask` | `hash` | `drop` (default `mask` when `pii` omitted or `mode` omitted)
- `saltPath` — optional string path (relative to config dir or absolute) for the
  hash salt file; when omitted, a default under the store directory SHALL be used

Unknown keys under `pii` SHALL fail config load with an actionable error listing
allowed keys. Invalid `mode` values SHALL fail similarly.

#### Scenario: Default mode

- **WHEN** config has no `pii` key
- **THEN** effective mode is `mask`

#### Scenario: Reject bad mode

- **WHEN** config contains `pii: { mode: redact }`
- **THEN** config load fails and the error lists allowed modes
