# Spec: document-extraction (delta)

## ADDED Requirements

### Requirement: Apply guard rules after PII on run

When `knot-sync run` has a Document ready after extraction, cleaning, and PII
processing, the CLI SHALL run each registered `GuardRule` in registration order
to detect spans, then apply `guard.mode` before upsert. Guard processing
failures SHALL set document status to `error` with an actionable message and
MUST NOT leave the operator without a clear next step.

#### Scenario: Guard runs after PII

- **WHEN** `run` extracts a file and at least one GuardRule is registered
- **THEN** guard detection/apply runs after PII masking on that document
- **AND** the upserted document reflects `guard.mode` (flag, strip, or block)

#### Scenario: No GuardRule registered

- **WHEN** `run` completes extract/clean/PII and no GuardRule is registered
- **THEN** upsert proceeds without guard transformation
