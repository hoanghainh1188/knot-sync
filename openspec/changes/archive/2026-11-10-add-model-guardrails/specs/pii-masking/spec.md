# Spec Delta

## ADDED Requirements

### Requirement: Rule-based PII remains default; model findings optional

Deterministic PII rules and `pii.mode` SHALL continue to work without the
guard-llm plugin and WITHOUT requiring a local LLM. When the guard-llm
enricher appends PII findings, those findings MUST use the same `Document.pii`
shape and MUST be processed under the configured `pii.mode`.

#### Scenario: PII works with model plugin unloaded

- **GIVEN** no guard-llm plugin under `plugins:`
- **WHEN** `run` processes text matching a Vietnamese phone rule
- **THEN** PII findings are applied under `pii.mode` as today
