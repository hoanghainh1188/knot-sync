# Spec Delta

## ADDED Requirements

### Requirement: Optional OCR plugin settings object

When the OCR plugin is used, config MAY include a plugin settings object under
the plugin’s documented key (e.g. matching the plugin `name`). Allowed keys
SHALL be documented by the plugin and validated by the plugin (not by core
beyond opaque `pluginSettings` pass-through). Typical keys: Docker image
reference, OCR timeout seconds, max input bytes, license env var name. Unknown
keys under that object SHALL fail load/register with an actionable error from
the plugin.

#### Scenario: Starter or docs mention OCR plugin settings

- **WHEN** an operator reads starter comments or OCR docs after this change
- **THEN** they see how to list the plugin under `plugins:` and optional
  settings (image, timeout, license) separate from `server.audit_log` /
  `logging`

#### Scenario: Invalid OCR setting rejected

- **GIVEN** OCR plugin settings contain an unknown key or non-positive timeout
- **WHEN** plugins load
- **THEN** load fails with a message listing allowed OCR settings keys or valid
  ranges
