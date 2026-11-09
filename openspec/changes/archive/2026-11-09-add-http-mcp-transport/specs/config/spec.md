# Spec Delta

## ADDED Requirements

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
