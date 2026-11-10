# Spec Delta

## ADDED Requirements

### Requirement: Optional mcp-oauth plugin settings and docs

When the mcp-oauth plugin is used, config MAY include a plugin settings object
under the plugin’s documented key. Allowed keys SHALL be documented and
validated by the plugin (opaque pass-through in core). Signing secrets, client
secrets, and API keys MUST remain environment-only. Starter comments or docs
SHALL show how to list the plugin under `plugins:`, set the license env, choose
local AS vs JWKS mode, and keep `KNOT_SYNC_API_KEY` as fallback—separate from
`server.audit_log` / `logging`.

#### Scenario: Starter mentions OAuth plugin settings

- **WHEN** an operator reads starter comments or mcp-oauth docs after this
  change
- **THEN** they see `plugins:` + license env guidance, local vs JWKS notes, and
  that `KNOT_SYNC_API_KEY` remains the fallback

#### Scenario: Invalid oauth setting rejected

- **GIVEN** mcp-oauth plugin settings contain an unknown key
- **WHEN** plugins load
- **THEN** load fails with a message listing allowed settings keys
