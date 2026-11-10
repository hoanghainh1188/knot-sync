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

### Requirement: Optional server section

Config MAY include a `server` object. Allowed keys:

- `audit_log` — optional string path (relative to the config directory or
  absolute) for the MCP JSONL audit log; when omitted, a documented default
  under the store directory SHALL be used

Unknown keys under `server` SHALL fail config load with an actionable error
listing allowed keys.

#### Scenario: Default audit log path

- **WHEN** config has no `server` key
- **THEN** `serve` still starts and writes the audit log to the documented
  default under the store directory

#### Scenario: Reject unknown server key

- **WHEN** config contains `server: { port: 8080 }`
- **THEN** config load fails and the error lists allowed keys under `server`

### Requirement: Optional logging section

Config MAY include a `logging` object. Allowed keys are `path` and `level`
only. Unknown keys under `logging` SHALL fail config load with an actionable
error listing allowed keys.

#### Scenario: Reject unknown logging key

- **WHEN** config contains `logging: { syslog: true }`
- **THEN** config load fails and the error lists allowed keys under `logging`

#### Scenario: Starter mentions logging

- **WHEN** an operator reads starter config comments
- **THEN** they see optional `logging.path` / `logging.level` guidance
  separate from `server.audit_log`

### Requirement: logging.path default and validation

`logging.path` SHALL be an optional non-empty string (relative to the config
directory or absolute). When omitted, a documented default under the store
directory SHALL be used (distinct from `server.audit_log`). Empty strings
SHALL fail. When the path resolves inside a configured source root, config
load or logger init SHALL fail naming `logging.path`.

#### Scenario: Defaults when logging omitted

- **WHEN** config has no `logging` key
- **THEN** the system log uses the documented default path under the store
  directory

#### Scenario: Empty path rejected

- **WHEN** config contains `logging: { path: "" }`
- **THEN** config load fails with an actionable error naming `logging.path`

### Requirement: logging.level enum

`logging.level` SHALL be optional and one of `info`, `warn`, or `error`.
When `logging` or `level` is omitted, effective level SHALL be `info`.
Invalid values SHALL fail config load listing allowed levels.

#### Scenario: Default level

- **WHEN** config has no `logging` key
- **THEN** effective level is `info`

#### Scenario: Reject invalid level

- **WHEN** config contains `logging: { level: debug }`
- **THEN** config load fails and the error lists allowed levels
  `info`, `warn`, and `error`

### Requirement: HTTP MCP API key is environment-only

Operators SHALL supply the shared HTTP API key via the environment variable
`KNOT_SYNC_API_KEY` (non-empty when `--http` is used). The config YAML MUST NOT
accept a plaintext API key field under `server` or elsewhere for this purpose.
Unknown keys under `server` continue to fail config load (bind host/port remain
CLI flags, not config keys, unless a later change adds them explicitly).

#### Scenario: server.api_key rejected as unknown

- **WHEN** config contains `server: { api_key: "secret" }`
- **THEN** config load fails
- **AND** the error lists allowed `server` keys (still including `audit_log`)

#### Scenario: Docs / starter mention env var

- **WHEN** an operator reads starter config comments or serve docs for HTTP mode
- **THEN** they are directed to set `KNOT_SYNC_API_KEY` in the environment

### Requirement: Optional prompts list

Config MAY include a `prompts` list of prompt objects. When `prompts` is
absent, the server exposes no config-defined prompts (plugin prompts remain
separate). Duplicate `name` values or invalid shapes SHALL fail config load
with an actionable message.

#### Scenario: Valid prompt entry

- **WHEN** config includes a prompt with `name`, `description`, and `template`
- **THEN** config load succeeds and that prompt is available to `serve`

#### Scenario: Duplicate prompt name

- **WHEN** two prompt entries share the same `name`
- **THEN** config load fails naming the duplicate

### Requirement: Prompt entry shape

Each `prompts` entry SHALL include non-empty string fields `name`,
`description`, and `template`, and MAY include `arguments` as a list of
descriptors with `name`, `description`, and optional `required` flag.

#### Scenario: Missing template rejected

- **WHEN** a prompt entry omits `template`
- **THEN** config load fails with a message naming the required fields

### Requirement: Optional catalog section

Config MAY include a `catalog` object. Allowed keys: `path`, `dictionary`,
`definition_excel`, and `definition_mapping`. Unknown keys under `catalog`
SHALL fail config load with an actionable error listing allowed keys.

#### Scenario: Default catalog path

- **WHEN** config has no `catalog` key
- **THEN** `describe` writes to the documented default path next to the config
  (e.g. `knot-sync.catalog.yaml`)

#### Scenario: Reject unknown catalog key

- **WHEN** config contains `catalog: { llm: true }`
- **THEN** config load fails and the error lists allowed keys under `catalog`

### Requirement: Catalog path resolution

`catalog.path`, `catalog.dictionary`, and `catalog.definition_excel` SHALL
resolve relative to the config file directory when not absolute.
`definition_mapping` SHALL be an optional object whose sheet/header keys are
documented in design.

#### Scenario: Relative definition Excel resolves from config dir

- **GIVEN** config sets `catalog.definition_excel: ./defs/項目定義.xlsx`
- **WHEN** config is loaded
- **THEN** the path resolves relative to the config file directory

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

### Requirement: Optional OCR plugin settings object

When the OCR plugin is used, config MAY include a plugin settings object under
the plugin’s documented key (e.g. matching the plugin `name`). Allowed keys
SHALL be documented by the plugin and validated by the plugin (not by core
beyond opaque `pluginSettings` pass-through). Typical keys: Docker image
reference, OCR timeout seconds, max input bytes, license env var name. Unknown
keys under that object SHALL fail load/register with an actionable error from
the plugin.

#### Scenario: Starter or docs mention OCR plugin settings

- **WHEN** an operator reads starter comments or OCR docs after this change
- **THEN** they see how to list the plugin under `plugins:` and optional
  settings (image, timeout, license) separate from `server.audit_log` /
  `logging`

#### Scenario: Invalid OCR setting rejected

- **GIVEN** OCR plugin settings contain an unknown key or non-positive timeout
- **WHEN** plugins load
- **THEN** load fails with a message listing allowed OCR settings keys or valid
  ranges

### Requirement: Optional housen plugin settings object

When the housen plugin is used, config MAY include a plugin settings object
under the plugin’s documented key (e.g. matching the plugin `name`). Allowed
keys SHALL be documented by the plugin and validated by the plugin (not by core
beyond opaque `pluginSettings` pass-through). Typical keys: detection
thresholds, timeout seconds, license env var name. Unknown keys under that
object SHALL fail load/register with an actionable error from the plugin.

#### Scenario: Starter or docs mention housen plugin settings

- **WHEN** an operator reads starter comments or housen docs after this change
- **THEN** they see how to list the plugin under `plugins:` and optional
  settings (thresholds, timeout, license) separate from `server.audit_log` /
  `logging`

#### Scenario: Invalid housen setting rejected

- **GIVEN** housen plugin settings contain an unknown key or non-positive
  timeout
- **WHEN** plugins load
- **THEN** load fails with a message listing allowed housen settings keys or
  valid ranges

### Requirement: Optional enterprise SQL plugin settings and docs

When the enterprise SQL plugin is used, config MAY include a plugin settings
object under the plugin’s documented key. Allowed keys SHALL be documented and
validated by the plugin (opaque pass-through in core). Starter comments or docs
SHALL show how to list the plugin under `plugins:`, set the license env, and
declare example sources for the four enterprise `type` values—separate from
`server.audit_log` / `logging`.

#### Scenario: Starter mentions enterprise SQL types

- **WHEN** an operator reads starter comments or enterprise SQL docs after this
  change
- **THEN** they see `plugins:` + license env guidance and example `type` values
  for SQL Server, Oracle, Access, and IBM i / AS400

#### Scenario: Invalid enterprise SQL setting rejected

- **GIVEN** enterprise SQL plugin settings contain an unknown key
- **WHEN** plugins load
- **THEN** load fails with a message listing allowed settings keys
