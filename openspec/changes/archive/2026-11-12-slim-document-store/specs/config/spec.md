## MODIFIED Requirements

### Requirement: Optional cleaning section

Config MAY include a `cleaning` object. Valid boolean keys are: `nfkc`,
`wareki`, `datesIso`, `legacyVietnamese`, `tokenReduce`, and
`keepOriginalText`. Additional unknown keys under `cleaning` SHALL cause
config load to fail with a message that lists allowed keys.

When `cleaning` is absent, loaders SHALL treat transformation steps (`nfkc`,
`wareki`, `datesIso`, `legacyVietnamese`, `tokenReduce`) as `true` and
`keepOriginalText` as `false`.

#### Scenario: Reject unknown cleaning key

- **WHEN** config contains `cleaning: { foo: true }`
- **THEN** config load fails
- **AND** the error mentions that `foo` is not allowed under `cleaning`

#### Scenario: Type check

- **WHEN** config contains `cleaning: { nfkc: "yes" }`
- **THEN** config load fails
- **AND** the error states that boolean values are required

#### Scenario: keepOriginalText defaults to false and accepts opt-in true

- **WHEN** config omits `cleaning` or omits `cleaning.keepOriginalText`
- **THEN** `cleaning.keepOriginalText` defaults to `false`
- **WHEN** config sets `cleaning: { keepOriginalText: true }`
- **THEN** `cleaning.keepOriginalText` is `true` and non-boolean values fail validation
