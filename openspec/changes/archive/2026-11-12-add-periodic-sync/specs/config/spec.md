## MODIFIED Requirements

### Requirement: Optional server section

Config MAY include a `server` object. Allowed keys:

- `audit_log` — optional string path (relative to the config directory or
  absolute) for the MCP JSONL audit log; when omitted, a documented default
  under the store directory SHALL be used
- `sync_interval_seconds` — optional positive finite number enabling background
  periodic sync cycles inside `knot-sync serve` at that interval; when omitted,
  periodic sync SHALL remain disabled

Unknown keys under `server` SHALL fail config load with an actionable error
listing allowed keys. Non-positive or non-numeric `sync_interval_seconds` values
SHALL fail config load with a clear `ConfigError`.

#### Scenario: Default audit log path

- **WHEN** config has no `server` key
- **THEN** `serve` still starts and writes the audit log to the documented
  default under the store directory
- **AND** `sync_interval_seconds` is unset (periodic sync disabled)

#### Scenario: Reject unknown server key

- **WHEN** config contains `server: { port: 8080 }`
- **THEN** config load fails and the error lists allowed keys under `server`

#### Scenario: Valid and invalid sync_interval_seconds

- **WHEN** config contains `server: { sync_interval_seconds: 300 }`
- **THEN** config load succeeds with `server.syncIntervalSeconds === 300`
- **WHEN** config contains `server: { sync_interval_seconds: 0 }` or a non-number
- **THEN** config load fails with an actionable error mentioning `server.sync_interval_seconds`
