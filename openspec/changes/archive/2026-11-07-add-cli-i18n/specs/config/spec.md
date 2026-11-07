## ADDED Requirements

### Requirement: Optional cli section

Config MAY include a `cli` object. Allowed keys:
- `locale` — string enum: `en` | `ja` | `vi`

When `cli` is absent, the CLI SHALL treat locale as unset in config (flag and
environment resolution still apply). Unknown keys under `cli` or an invalid
`locale` value SHALL fail config load with an actionable error listing allowed
values.

#### Scenario: Valid Japanese locale in config

- **WHEN** config contains `cli: { locale: ja }`
- **THEN** config load succeeds and the resolved CLI locale from config is `ja`

#### Scenario: Reject unknown cli key

- **WHEN** config contains `cli: { theme: dark }`
- **THEN** config load fails
- **AND** the error mentions that `theme` is not allowed under `cli`

#### Scenario: Reject invalid locale

- **WHEN** config contains `cli: { locale: fr }`
- **THEN** config load fails
- **AND** the error lists allowed locales `en`, `ja`, and `vi`

### Requirement: Starter config mentions cli.locale

The starter config written by `knot-sync init` SHALL include a commented
example of optional `cli.locale` so operators discover ja/vi without reading
external docs.

#### Scenario: Init starter mentions locale

- **WHEN** the user runs `knot-sync init` and a new config is written
- **THEN** the file contains a commented `cli` / `locale` example referencing
  `en`, `ja`, or `vi`

## MODIFIED Requirements

### Requirement: Reserved plugin config keys

Top-level config keys other than `sources`, `store`, `scan`, `plugins`,
`cleaning`, `pii`, `guard`, `server`, `catalog`, `prompts`, and `cli` SHALL be
treated as plugin-owned settings and left as opaque objects for the matching
plugin. The core config loader MUST NOT reject unknown top-level keys that are
valid YAML objects or omit them.

#### Scenario: Plugin settings preserved

- **GIVEN** a config with a top-level key `mask-company-id: { pattern: "ACME-.*" }`
- **WHEN** the config is loaded
- **THEN** that object is available to the plugin named `mask-company-id` after plugins load

#### Scenario: cli is not a plugin settings bag

- **GIVEN** a config with `cli: { locale: ja }`
- **WHEN** the config is loaded
- **THEN** `cli` is parsed as core CLI settings
- **AND** it is not exposed as plugin settings under the name `cli`
