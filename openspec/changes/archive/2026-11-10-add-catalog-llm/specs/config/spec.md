# Spec Delta

## ADDED Requirements

### Requirement: Optional catalog-llm plugin settings and docs

When the catalog-llm plugin is used, config MAY include a plugin settings
object under the plugin’s documented key. Allowed keys SHALL be documented and
validated by the plugin (opaque pass-through in core). License and any API
tokens MUST remain environment-only when used. Starter comments or docs SHALL
show how to list the plugin under `plugins:`, set the license env, point
`baseUrl` at Ollama or a Docker OpenAI-compatible server, and choose a model—
separate from `catalog.path` / `server.audit_log` / `logging`.

#### Scenario: Starter mentions catalog-llm settings

- **WHEN** an operator reads starter comments or catalog-llm docs after this
  change
- **THEN** they see `plugins:` + license env guidance, local base URL / model
  notes, and that cloud LLM is not required

#### Scenario: Invalid catalog-llm setting rejected

- **GIVEN** catalog-llm plugin settings contain an unknown key
- **WHEN** plugins load
- **THEN** load fails with a message listing allowed settings keys
