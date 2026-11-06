# config Specification

## Purpose

Defines how KnotSync is configured: one YAML file that lists data sources, the store location and scan settings, plus the `init` command that creates a starter file.

## Requirements

### Requirement: Config file location
The CLI SHALL read `knot-sync.config.yaml` from the current directory by default and SHALL accept another path through `-c` / `--config`.

#### Scenario: Default config file
- **WHEN** the user runs `knot-sync scan` in a folder that contains `knot-sync.config.yaml`
- **THEN** that file is used

#### Scenario: Missing config file
- **WHEN** the config file does not exist
- **THEN** the command exits with code 1 and tells the user to run `knot-sync init`

### Requirement: Relative paths resolve from the config file
All relative paths in the config (source paths, store path) SHALL resolve from the directory that contains the config file, not from the current directory.

#### Scenario: Relative source path
- **GIVEN** a config at `/work/knot-sync.config.yaml` with source path `./share`
- **WHEN** the config is loaded from any working directory
- **THEN** the source path is `/work/share`

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

### Requirement: Extension filter normalization
Source `extensions` SHALL be compared case-insensitively and SHALL accept values with or without a leading dot.

#### Scenario: Mixed-case extensions
- **WHEN** a source lists `extensions: [XLSX, .Pdf]`
- **THEN** the effective filter is `.xlsx` and `.pdf`

### Requirement: Defaults
When omitted, the store path SHALL be `.data/store.sqlite`, `scan.old_file_years` SHALL be 5 and `scan.hash` SHALL be true. Folders `node_modules`, `.git`, `.svn`, `$RECYCLE.BIN`, `System Volume Information`, `.Trash` and `.Trashes` SHALL always be excluded.

#### Scenario: Minimal config
- **WHEN** a config only defines one source
- **THEN** the defaults above apply and the always-excluded folders are skipped during scan

### Requirement: Init command
`knot-sync init` SHALL write a commented starter config, SHALL accept `--path <folder>` for the first source, and SHALL refuse to overwrite an existing file unless `--force` is given.

#### Scenario: Create starter config
- **WHEN** the user runs `knot-sync init --path ./share`
- **THEN** a config is created whose first source path is `./share`

#### Scenario: Existing config is protected
- **WHEN** the config file already exists and `--force` is not given
- **THEN** the command exits with code 1 and the file is unchanged

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
Top-level config keys other than `sources`, `store`, `scan`, `plugins`,
`cleaning`, `pii`, and `guard` SHALL be treated as plugin-owned settings and
left as opaque objects for the matching plugin. The core config loader MUST NOT
reject unknown top-level keys that are valid YAML objects or omit them.

#### Scenario: Plugin settings preserved
- **GIVEN** a config with a top-level key `mask-company-id: { pattern: "ACME-.*" }`
- **WHEN** the config is loaded
- **THEN** that object is available to the plugin named `mask-company-id` after plugins load

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
