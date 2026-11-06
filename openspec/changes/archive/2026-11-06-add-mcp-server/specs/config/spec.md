# Spec: config (delta)

## ADDED Requirements

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

## MODIFIED Requirements

### Requirement: Reserved plugin config keys

Top-level config keys other than `sources`, `store`, `scan`, `plugins`,
`cleaning`, `pii`, `guard`, `server`, and `prompts` SHALL be treated as
plugin-owned settings and left as opaque objects for the matching plugin. The
core config loader MUST NOT reject unknown top-level keys that are valid YAML
objects or omit them.

#### Scenario: Plugin settings preserved

- **GIVEN** a config with a top-level key `mask-company-id: { pattern: "ACME-.*" }`
- **WHEN** the config is loaded
- **THEN** that object is available to the plugin named `mask-company-id` after plugins load
