# Spec Delta

## ADDED Requirements

### Requirement: Rule-based guard remains default; model findings optional

Deterministic injection-guard rules and `guard.mode` SHALL continue to work
without the guard-llm plugin and WITHOUT requiring a local LLM. When the
guard-llm enricher appends findings, those findings MUST use the same
`Document.guard` shape and MUST be processed under the configured `guard.mode`.

#### Scenario: Guard works with model plugin unloaded

- **GIVEN** no guard-llm plugin under `plugins:`
- **WHEN** `run` processes text matching an instruction-ja rule
- **THEN** guard findings and risk are recorded as today
