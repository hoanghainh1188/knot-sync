# Spec: config (delta)

## ADDED Requirements

### Requirement: Optional guard section

Config MAY include a `guard` object. Allowed keys:

- `mode` — string enum: `flag` | `strip` | `block` (default `flag` when `guard`
  omitted or `mode` omitted)

Unknown keys under `guard` SHALL fail config load with an actionable error
listing allowed keys. Invalid `mode` values SHALL fail similarly.

#### Scenario: Default mode

- **WHEN** config has no `guard` key
- **THEN** effective mode is `flag`

#### Scenario: Reject bad mode

- **WHEN** config contains `guard: { mode: quarantine }`
- **THEN** config load fails and the error lists allowed modes
