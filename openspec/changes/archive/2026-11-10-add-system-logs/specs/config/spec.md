# Spec Delta

## ADDED Requirements

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
