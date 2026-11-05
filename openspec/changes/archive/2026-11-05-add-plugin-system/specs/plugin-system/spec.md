# Spec Delta

## Purpose

Defines how KnotSync loads trusted plugins, registers extension points, and
exposes which plugins are active so later pipeline features can ship as plugins
instead of hard-wired CLI code.

## ADDED Requirements

### Requirement: Plugin module contract
A plugin SHALL be an ES module whose default export is an object with `name`
(non-empty string), `version` (non-empty string), `apiVersion` (positive integer
matching the host), and `register(api)` that registers zero or more extensions
through the host API.

#### Scenario: Valid plugin loads
- **WHEN** a listed plugin module exports `{ name, version, apiVersion, register }` with a compatible `apiVersion`
- **THEN** the host calls `register` once and the plugin is marked loaded

#### Scenario: Incompatible apiVersion
- **WHEN** a listed plugin declares an `apiVersion` the host does not support
- **THEN** loading fails with exit code 1 and a message naming the plugin, its `apiVersion`, and the host's supported version

### Requirement: Explicit plugin list
The host SHALL load only plugins listed under config `plugins:` plus the
built-in default plugins. It MUST NOT auto-discover plugins from the filesystem
or the network.

#### Scenario: Unlisted plugin is ignored
- **GIVEN** an ES module file exists next to the config but is not listed in `plugins:`
- **WHEN** the CLI starts a command that loads plugins
- **THEN** that module is not loaded

#### Scenario: Relative path plugin
- **GIVEN** config lists `plugins: [./plugins/mask-company-id.mjs]`
- **WHEN** plugins are loaded
- **THEN** the path resolves from the config file directory and that module is loaded

### Requirement: Typed extension registries
The plugin API SHALL provide separate registries for extension points
`connector`, `extractor`, `cleaner`, `pii-rule`, `guard-rule`, `catalog-source`,
`mcp-tool`, and `mcp-prompt`. Each registration SHALL carry a stable id unique
within its extension point.

#### Scenario: Duplicate extension id
- **WHEN** two loaded plugins register the same id on the same extension point
- **THEN** loading fails with exit code 1 and a message naming the id, the extension point, and both plugin names

#### Scenario: Empty registries for unused points
- **WHEN** only the built-in `fs` connector plugin is loaded
- **THEN** the connector registry contains `fs` and the other registries may be empty without error

### Requirement: Built-in fs connector plugin
The host SHALL load a built-in connector plugin with id `fs` by default that
exposes the existing read-only folder source behavior. Source config `type: fs`
SHALL resolve to that connector.

#### Scenario: Default scan without plugins list
- **GIVEN** a config with one `type: fs` source and no `plugins:` key
- **WHEN** the user runs `knot-sync scan`
- **THEN** the folder inventory is produced as before and the inventory is saved

### Requirement: Connector type resolution
When scanning a source, the host SHALL resolve `source.type` through the
connector registry. If no connector is registered for that type, loading or
scanning SHALL fail with a message that lists the registered connector ids.

#### Scenario: Unknown source type after plugins load
- **GIVEN** only the built-in `fs` connector is registered
- **WHEN** a source has `type: oracle`
- **THEN** the command exits with code 1 and the error lists `fs` among supported types

### Requirement: Plugin-owned settings
Plugin-specific settings SHALL live under a top-level config key matching the
plugin `name` (or a documented alias the plugin declares). The host SHALL pass
that object to the plugin for validation; the core MUST NOT interpret those
fields itself.

#### Scenario: Invalid plugin settings
- **GIVEN** a loaded plugin that validates its config key
- **WHEN** the settings under that key fail validation
- **THEN** the command exits with code 1 and the error message says what to fix

### Requirement: In-process trust model
Plugins SHALL run in the same process as the CLI with the same privileges. The
host MUST NOT fetch plugins from the network at runtime. Documentation and the
`plugins` command help SHALL state that only trusted plugins should be
installed, and that paid plugins check their own license keys.

#### Scenario: Plugins command documents trust
- **WHEN** the user runs `knot-sync plugins --help` or `knot-sync plugins` with no plugins beyond built-ins
- **THEN** the output or help text states that plugins run in-process with full trust

### Requirement: plugins CLI command
`knot-sync plugins` SHALL list each loaded plugin's `name`, `version`, and the
extension point ids it registered. It SHALL exit 0 on success.

#### Scenario: List built-in and example plugin
- **GIVEN** config lists an example plugin that registers a `pii-rule` named `mask-company-id`
- **WHEN** the user runs `knot-sync plugins`
- **THEN** the output includes the built-in `fs` connector plugin and the example plugin with `pii-rule:mask-company-id`

#### Scenario: Japanese plugin display name in listing
- **GIVEN** a loaded plugin whose `name` is `mask-請求書-id`
- **WHEN** the user runs `knot-sync plugins`
- **THEN** the listing shows `mask-請求書-id` unchanged
