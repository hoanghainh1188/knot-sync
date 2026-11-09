# Spec Delta

## MODIFIED Requirements

### Requirement: Reserved plugin config keys

Top-level config keys other than `sources`, `store`, `scan`, `plugins`,
`cleaning`, `pii`, `guard`, `server`, `catalog`, `prompts`, `cli`, and
`extraction` SHALL be treated as plugin-owned settings and left as opaque
objects for the matching plugin. The core config loader MUST NOT reject unknown
top-level keys that are valid YAML objects or omit them.

#### Scenario: Plugin settings preserved
- **GIVEN** a config with a top-level key `mask-company-id: { pattern: "ACME-.*" }`
- **WHEN** the config is loaded
- **THEN** that object is available to the plugin named `mask-company-id` after plugins load

#### Scenario: cli is not a plugin settings bag

- **GIVEN** a config with `cli: { locale: ja }`
- **WHEN** the config is loaded
- **THEN** `cli` is parsed as core CLI settings
- **AND** it is not exposed as plugin settings under the name `cli`

#### Scenario: extraction is not a plugin settings bag

- **GIVEN** a config with `extraction: { maxFileSizeMb: 10 }`
- **WHEN** the config is loaded
- **THEN** `extraction` is parsed as core extraction settings
- **AND** it is not exposed as plugin settings under the name `extraction`

## ADDED Requirements

### Requirement: Optional extraction section

Config MAY include an `extraction` object with positive numeric keys
`maxFileSizeMb` (default 50), `timeoutSeconds` (default 30), and
`maxTextChars` (documented default). Unknown keys or non-positive values SHALL
fail config load with an actionable error listing allowed keys.

#### Scenario: Defaults when extraction omitted

- **WHEN** a config has no `extraction` section
- **THEN** effective limits are `maxFileSizeMb` 50 and `timeoutSeconds` 30
  (and the documented `maxTextChars` default)

#### Scenario: Partial override

- **GIVEN** `extraction: { maxFileSizeMb: 10 }`
- **WHEN** the config is loaded
- **THEN** `maxFileSizeMb` is 10 and `timeoutSeconds` remains the default 30

#### Scenario: Unknown extraction key fails

- **GIVEN** `extraction: { foo: 1 }`
- **WHEN** the config is loaded
- **THEN** loading fails with a message that lists allowed `extraction` keys
