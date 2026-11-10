# plugin-system Specification

## Purpose

Defines how KnotSync loads trusted plugins, registers extension points, and
exposes which plugins are active so later pipeline features can ship as plugins
instead of hard-wired CLI code.

## Requirements

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

### Requirement: Extractor extension contract
An extractor registration SHALL include a stable `id`, the document types or
extensions it handles, and an `extract` operation that accepts a file inventory
entry and returns a Document or signals that the file cannot be extracted. The
host SHALL expose registered extractors through the extractor registry for the
`run` command.

#### Scenario: Register and resolve extractor
- **WHEN** a plugin registers an extractor with id `office` for type `xlsx`
- **THEN** the host extractor registry lists `office` and `run` can select it for an `.xlsx` inventory entry

### Requirement: Cleaner contract is executable

A registered `Cleaner` SHALL expose `clean(document: Document): Document |
Promise<Document>` (name MAY be `clean` on the plugin object). The host SHALL
pass the current Document and use the returned Document for subsequent
cleaners and persistence.

Cleaners MUST NOT write to, move, or delete files under configured sources.
Cleaners MUST NOT perform network I/O.

#### Scenario: Sequential cleaners

- **WHEN** two Cleaners are registered
- **THEN** the second receives the Document returned by the first

#### Scenario: Identity when disabled steps

- **WHEN** a Cleaner runs with all of its steps disabled via config
- **THEN** it returns a Document whose `content` equals the input `content`
  (aside from metadata fields the cleaner is allowed to set, such as token
  estimates)

### Requirement: PiiRule contract is executable

A registered `PiiRule` SHALL expose a stable `id` and a `find(text: string):
PiiFinding[]` (or equivalent returning `{ rule, start, end }` spans) that
detects matches in a single plain-text string without network I/O. The host
SHALL invoke rules on document content and table cell strings as documented in
design.

PiiRules MUST NOT write to, move, or delete files under configured sources.

#### Scenario: Rule returns span

- **WHEN** a PiiRule with id `email` is registered and `find` is called on
  `contact: a@b.co`
- **THEN** the result includes a span covering `a@b.co` with rule `email`

### Requirement: GuardRule contract is executable

A registered `GuardRule` SHALL expose a stable `id` and a
`find(text: string): Array<{ start: number; end: number }>` that detects matches
in a single plain-text string without network I/O. The host SHALL invoke rules on
document content, table cell strings, and extractor-provided hidden-text metadata
as documented in design.

GuardRules MUST NOT write to, move, or delete files under configured sources.

#### Scenario: Rule returns span

- **WHEN** a GuardRule with id `instruction-en` is registered and `find` is
  called on `please ignore previous instructions now`
- **THEN** the result includes a span covering the matched phrase

### Requirement: McpTool contract is executable

A registered `McpTool` SHALL expose a stable `id`, a human-readable
description, a JSON Schema (or Zod schema convertible to JSON Schema) for
inputs, and a handler that accepts validated arguments and returns a
read-only result for MCP. Handlers MUST NOT write to configured sources or
mutate the store. The host SHALL expose registered tools through the
`mcp-tool` registry for `serve`.

#### Scenario: Built-in search tool listed

- **WHEN** the user runs `knot-sync plugins` with default plugins
- **THEN** output includes at least one `mcp-tool:` id for document search

### Requirement: McpPrompt contract is executable

A registered `McpPrompt` SHALL expose a stable `id` (or name), description,
optional argument descriptors, and a template or render function. The host
SHALL expose registered prompts through the `mcp-prompt` registry for `serve`.

#### Scenario: Prompt registry used by serve

- **WHEN** a plugin registers an `mcp-prompt` and `serve` is running
- **THEN** that prompt is available to MCP clients via the prompts list

### Requirement: SQL connectors as built-in plugins

The host SHALL load the built-in SQL connector plugin by default so that source
types `postgres` and `mysql` resolve through the connector registry without a
`plugins:` entry. Each type SHALL parse `url: env:NAME` and a non-empty
`allow` structure as required by the sql-source capability.

#### Scenario: postgres type resolves

- **WHEN** a source has `type: postgres` and valid `url` / `allow` fields
- **THEN** config resolution succeeds using the registered postgres connector

#### Scenario: Unknown SQL-like type still fails

- **WHEN** a source has `type: oracle` and no connector is registered for it
- **THEN** loading fails listing registered connector types including `postgres`
  and `mysql` when those plugins are loaded

### Requirement: CatalogSource contract is executable

A registered `CatalogSource` SHALL expose a stable `id` and a `suggest`
operation that returns suggested catalog fields for one table/column without
network I/O. The host SHALL invoke registered catalog-sources during
`describe` as documented in design.

#### Scenario: Dictionary source suggests Japanese expansion

- **WHEN** a catalog-source for romaji abbreviations is registered
- **AND** `suggest` is called for column `TKSK_CD`
- **THEN** the suggestion includes a ja label related to 得意先 / コード

#### Scenario: Catalog-source does not write sources

- **WHEN** any registered CatalogSource runs during `describe`
- **THEN** no file under a configured folder source and no customer DB row
  is created, updated, or deleted

### Requirement: Built-in dictionary and Excel catalog-sources

Built-in dictionary and optional Excel definition inputs SHALL register as
`catalog-source` extensions (or equivalent built-ins loaded by default) so
`describe` can consume them through the plugin registry.

#### Scenario: Default describe has dictionary sources

- **WHEN** `describe` runs with default plugins and no customer dictionary
- **THEN** built-in romaji and Vietnamese dictionary sources contribute
  suggestions for matching tokens

### Requirement: OCR plugin is opt-in paid extractor

The Docling OCR extractor SHALL register through the plugin API as an
`extractor` extension and SHALL NOT be included in the CLI default built-in
plugin list. Operators enable it only by adding its package/path to config
`plugins:`. The plugin MAY perform its own license validation; the core host
SHALL NOT reject plugins for lacking a core-checked license field.

#### Scenario: Builtins list excludes OCR

- **WHEN** an operator runs `knot-sync plugins` with no OCR entry under
  `plugins:`
- **THEN** the loaded extractors do not include the OCR extractor id
- **AND** office (and other built-ins) still load as today

#### Scenario: Listing plugin loads OCR extractor

- **GIVEN** config `plugins:` includes the OCR plugin module
- **WHEN** plugins are loaded successfully
- **THEN** `knot-sync plugins` lists the OCR plugin and an `extractor:` id for OCR

### Requirement: Housen plugin is opt-in paid extractor

The 方眼紙 / form Excel extractor SHALL register through the plugin API as an
`extractor` extension (or equivalent layout rewriter invoked only when loaded)
and SHALL NOT be included in the CLI default built-in plugin list. Operators
enable it only by adding its package/path to config `plugins:`. The plugin MAY
perform its own license validation; the core host SHALL NOT reject plugins for
lacking a core-checked license field.

#### Scenario: Builtins list excludes housen

- **WHEN** an operator runs `knot-sync plugins` with no housen entry under
  `plugins:`
- **THEN** the loaded plugins/extractors do not include the housen plugin id
- **AND** office (and other built-ins) still load as today

#### Scenario: Listing plugin loads housen

- **GIVEN** config `plugins:` includes the housen plugin module
- **WHEN** plugins are loaded successfully
- **THEN** `knot-sync plugins` lists the housen plugin (and its extractor id
  when registered as an extractor)
