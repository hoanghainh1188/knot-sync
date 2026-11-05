# Spec Delta

## ADDED Requirements

### Requirement: Plugins list in config
The config MAY include a `plugins:` list of strings. Each entry SHALL be either
an npm package name or a path relative to the config file. When omitted, only
built-in default plugins SHALL load. Duplicate entries SHALL fail config
loading with a message naming the duplicate.

#### Scenario: Relative plugin path
- **GIVEN** a config at `/work/knot-sync.config.yaml` with `plugins: [./plugins/demo.mjs]`
- **WHEN** the config is loaded
- **THEN** the plugin path resolves to `/work/plugins/demo.mjs`

#### Scenario: Duplicate plugin entry
- **WHEN** `plugins:` lists the same path twice
- **THEN** loading fails with a message naming the duplicate entry

### Requirement: Reserved plugin config keys
Top-level config keys other than `sources`, `store`, `scan`, and `plugins`
SHALL be treated as plugin-owned settings and left as opaque objects for the
matching plugin. The core config loader MUST NOT reject unknown top-level keys
that are valid YAML objects or omit them.

#### Scenario: Plugin settings preserved
- **GIVEN** a config with a top-level key `mask-company-id: { pattern: "ACME-.*" }`
- **WHEN** the config is loaded
- **THEN** that object is available to the plugin named `mask-company-id` after plugins load

## MODIFIED Requirements

### Requirement: Source validation
Each source SHALL have a unique `id` made of lower-case letters, digits, `-` or
`_`, a non-empty `type` string, and the fields required by the connector
registered for that type. For the built-in `fs` connector, `path` MUST be a
non-empty string. The set of allowed `type` values SHALL be the ids of
connectors registered after plugins load, not a hard-coded list in the core
loader.

#### Scenario: Invalid id
- **WHEN** a source id is `Bad Id`
- **THEN** loading fails with a message explaining the allowed characters

#### Scenario: Unsupported type
- **WHEN** a source has `type: oracle` and no connector with id `oracle` is registered
- **THEN** the command fails with a message listing the registered connector types

#### Scenario: Duplicate id
- **WHEN** two sources share the same id
- **THEN** loading fails with a message naming the duplicate id

#### Scenario: fs source still requires path
- **WHEN** a source has `type: fs` and an empty `path`
- **THEN** loading fails with a message that path is required
