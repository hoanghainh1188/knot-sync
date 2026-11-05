# Spec: config (delta)

## ADDED Requirements

### Requirement: Optional cleaning section

Config MAY include a `cleaning` object. Valid boolean keys are: `nfkc`,
`wareki`, `datesIso`, `legacyVietnamese`, `tokenReduce`. Additional unknown
keys under `cleaning` SHALL cause config load to fail with a message that
lists allowed keys.

When `cleaning` is absent, loaders SHALL treat all steps as enabled (`true`).

#### Scenario: Reject unknown cleaning key

- **WHEN** config contains `cleaning: { foo: true }`
- **THEN** config load fails
- **AND** the error mentions that `foo` is not allowed under `cleaning`

#### Scenario: Type check

- **WHEN** config contains `cleaning: { nfkc: "yes" }`
- **THEN** config load fails
- **AND** the error states that boolean values are required
