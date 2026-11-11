# Spec Delta

## Purpose

Defines the frozen 1.0 public contract for KnotSync: which CLI commands and
flags, top-level config keys, MCP resource URIs and tool names, and plugin host
API version are stable for operators and plugin authors under SemVer.

## ADDED Requirements

### Requirement: Stable CLI command set

The product documentation and help SHALL treat these command names as the
1.0-stable CLI surface: `init`, `scan`, `run`, `describe`, `ui`, `bench`,
`optimize`, `embed`, `plugins`, `serve`. Removing or renaming any of these
names SHALL be treated as a breaking change requiring a major version bump.

#### Scenario: Help lists stable commands

- **WHEN** a user runs `knot-sync --help`
- **THEN** the help text lists each of `init`, `scan`, `run`, `describe`, `ui`,
  `bench`, `optimize`, `embed`, `plugins`, and `serve` as available commands

#### Scenario: Vietnamese help keeps English command names

- **WHEN** a user runs `knot-sync --help --lang vi`
- **THEN** those command names remain English (locale may translate
  descriptions only)

### Requirement: Stable global CLI flags

The product documentation SHALL treat these global flags as 1.0-stable:
`-c` / `--config`, `--lang`, `-h` / `--help`, `-v` / `--version`. Removing or
renaming them SHALL be a breaking change requiring a major version bump.

#### Scenario: Global flags in help

- **WHEN** a user inspects `knot-sync --help`
- **THEN** help documents `--config`, `--lang`, `--help`, and `--version`
  (short forms MAY also appear)

### Requirement: Stable top-level config keys

The product documentation SHALL treat these top-level config keys as
1.0-stable: `sources`, `store`, `scan`, `cleaning`, `extraction`, `pii`,
`guard`, `server`, `logging`, `catalog`, `prompts`, `cli`, `plugins`. Removing
or renaming any of these keys SHALL be a breaking change requiring a major
version bump. Plugin-owned settings under a plugin name key remain plugin
contracts.

#### Scenario: Init sample uses stable keys

- **WHEN** a user runs `knot-sync init` and opens the generated config
- **THEN** the sample includes at least `sources`, `store`, and `plugins`
  (other stable keys MAY be commented defaults)

### Requirement: Stable MCP resource URIs

The MCP server SHALL keep these resource URI patterns as 1.0-stable:
`knot://sources`, `knot://docs/{source}/{doc_id}`, and
`knot://db/{source}/{table}/schema` (SQL when configured). Changing the scheme
or path pattern SHALL be a breaking change requiring a major version bump.

#### Scenario: Sources URI is documented and served

- **WHEN** an MCP client lists or reads `knot://sources`
- **THEN** the server recognizes that exact URI for configured source metadata

### Requirement: Stable built-in MCP tool names

The MCP server SHALL keep these built-in tool names as 1.0-stable:
`search_documents`, `get_document`, `describe_table`, `query_table`. Removing
or renaming them SHALL be a breaking change requiring a major version bump.
`search_similar` remains optional and is registered only when the search-vector
plugin is loaded.

#### Scenario: Built-in tools registered without vector plugin

- **WHEN** `knot-sync serve` starts without the search-vector plugin
- **THEN** tools `search_documents`, `get_document`, `describe_table`, and
  `query_table` are registered
- **AND** `search_similar` is not registered

### Requirement: SemVer rule for the public contract

After a 1.0.0 release of `@hoanghainh/knot-sync`, any breaking change to the
stable CLI command names, global flags, top-level config keys, MCP resource URI
patterns, built-in MCP tool names, or plugin host `apiVersion` `1` MUST bump the
major version. Additive, backward-compatible changes MAY ship in minor or patch
releases. This change itself MUST NOT require tagging 1.0.0.

#### Scenario: Docs state major-bump rule before 1.0 tag

- **WHEN** a reader opens the product README stability section
- **THEN** it states that breaking changes to the listed public surface require
  a major version bump after 1.0.0
- **AND** it does not claim that 1.0.0 is already published if the package
  version is still below 1.0.0

### Requirement: Product README documents the public contract

The English product README (packed into `@hoanghainh/knot-sync`) SHALL include a
short stability section that lists the stable CLI commands, notes stable MCP
tool/resource names (or points to them), states plugin host `apiVersion` `1`,
and restates that customer sources remain read-only.

#### Scenario: Japanese reader finds 読み取り専用 with stability

- **WHEN** a Japanese-speaking reader opens the linked `docs/ja` overview or the
  stability notes that mention source policy
- **THEN** the overview still states sources are 読み取り専用 (or clear
  equivalent) alongside the public-contract preparation status
