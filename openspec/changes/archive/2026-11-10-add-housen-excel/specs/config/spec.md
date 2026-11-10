# Spec Delta

## ADDED Requirements

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
