# Spec Delta

## ADDED Requirements

### Requirement: Optional search-vector plugin settings and docs

When the search-vector plugin is used, config MAY include a plugin settings
object under the plugin’s documented key. Allowed keys SHALL be documented and
validated by the plugin (opaque pass-through in core). License and any API
tokens MUST remain environment-only when used. Starter comments or docs SHALL
show how to list the plugin under `plugins:`, set the license env, point
`baseUrl` at Ollama or a Docker OpenAI-compatible embedding server, and choose
a model—separate from `store.path` / `server.audit_log` / `logging`.

#### Scenario: Starter mentions search-vector settings

- **WHEN** an operator reads starter comments or search-vector docs after this
  change
- **THEN** they see `plugins:` + license env guidance, local base URL / model
  notes, and that cloud embeddings are not required

#### Scenario: Invalid search-vector setting rejected

- **GIVEN** search-vector plugin settings contain an unknown key
- **WHEN** plugins load
- **THEN** load fails with a message listing allowed settings keys
