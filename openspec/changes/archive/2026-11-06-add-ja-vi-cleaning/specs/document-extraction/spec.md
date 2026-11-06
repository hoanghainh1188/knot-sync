# Spec: document-extraction (delta)

## ADDED Requirements

### Requirement: Clean after extract on run

When `knot-sync run` successfully extracts a document (status would otherwise
be `ready`), the CLI SHALL invoke each registered `Cleaner` in registration
order before upserting the document. Cleaning failures SHALL set document
status to `error` with an actionable message and SHALL NOT leave partial
cleaned content without original text.

#### Scenario: Cleaner runs after extract

- **WHEN** `knot-sync run` extracts text for a changed file and at least one
  Cleaner is registered
- **THEN** each Cleaner's `clean` is called with the extracted Document
- **AND** the upserted document uses the cleaner output for `content` / tables

#### Scenario: No cleaner registered

- **WHEN** `knot-sync run` extracts text and no Cleaner is registered
- **THEN** behavior matches extraction-only upsert (unchanged from prior
  archive)

#### Scenario: Cleaner throws

- **WHEN** a Cleaner's `clean` throws or rejects
- **THEN** the document is stored with status `error`
- **AND** the error message tells the operator what failed and to retry `run`
  after fixing input or disabling the failing step in `cleaning:`
