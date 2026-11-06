# Spec: document-extraction (delta)

## ADDED Requirements

### Requirement: Apply PII rules after clean on run

When `knot-sync run` has a Document ready after extraction (and after any
cleaners), the CLI SHALL run each registered `PiiRule` in registration order
to detect spans, then apply `pii.mode` once across the combined findings before
upsert. PII processing failures SHALL set document status to `error` with an
actionable message and MUST NOT upsert unmasked content.

#### Scenario: Masked content is what is upserted

- **WHEN** `run` extracts a file whose text contains an email and at least one
  PiiRule is registered
- **THEN** the upserted document content does not contain that email
- **AND** `Document.pii` is non-empty when a rule matched

#### Scenario: No PiiRule registered

- **WHEN** `run` completes extract/clean and no PiiRule is registered
- **THEN** upsert proceeds without PII transformation (content unchanged by this step)
