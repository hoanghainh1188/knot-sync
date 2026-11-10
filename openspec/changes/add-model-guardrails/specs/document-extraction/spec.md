# Spec Delta

## ADDED Requirements

### Requirement: Optional model enricher after PII and guard on run

When one or more document enrichers are registered (e.g. paid guard-llm),
`knot-sync run` SHALL invoke them **after** rule-based PII and guard have been
applied to a document and **before** upsert. Enrichers MUST NOT write, move, or
delete anything under configured source paths. Soft-fail of an enricher MUST
NOT discard already-applied rule-based PII/guard results for that document.

#### Scenario: Enricher runs after rules

- **GIVEN** a licensed document enricher is registered
- **AND** rule-based PII and guard have already updated the in-memory document
- **WHEN** `run` continues processing that document
- **THEN** the enricher is invoked on the post-rule document
- **AND** upsert persists the post-enricher document
- **AND** source files on disk are unchanged
