# Spec Delta

## ADDED Requirements

### Requirement: Optional guard-llm plugin settings and docs

When the guard-llm plugin is used, config MAY include a plugin settings object
under the plugin’s documented key. Allowed keys SHALL be documented and
validated by the plugin (opaque pass-through in core). License and any API
tokens MUST remain environment-only when used. Starter comments or docs SHALL
show how to list the plugin under `plugins:`, set the license env, point
`baseUrl` at Ollama or a Docker OpenAI-compatible chat server, and choose a
model—separate from `pii` / `guard` structural sections and from
`server.audit_log` / `logging`.

#### Scenario: Starter mentions guard-llm settings

- **WHEN** an operator reads starter comments or guard-llm docs after this
  change
- **THEN** they see `plugins:` + license env guidance, local base URL / model
  notes, and that cloud LLM is not required

#### Scenario: Invalid guard-llm setting rejected

- **GIVEN** guard-llm plugin settings contain an unknown key
- **WHEN** plugins load
- **THEN** load fails with a message listing allowed settings keys
