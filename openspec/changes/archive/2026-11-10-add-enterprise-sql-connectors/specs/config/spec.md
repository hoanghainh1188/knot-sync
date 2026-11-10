# Spec Delta

## ADDED Requirements

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
