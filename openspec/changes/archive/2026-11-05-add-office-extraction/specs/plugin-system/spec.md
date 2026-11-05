# Spec Delta

## ADDED Requirements

### Requirement: Extractor extension contract
An extractor registration SHALL include a stable `id`, the document types or
extensions it handles, and an `extract` operation that accepts a file inventory
entry and returns a Document or signals that the file cannot be extracted. The
host SHALL expose registered extractors through the extractor registry for the
`run` command.

#### Scenario: Register and resolve extractor
- **WHEN** a plugin registers an extractor with id `office` for type `xlsx`
- **THEN** the host extractor registry lists `office` and `run` can select it for an `.xlsx` inventory entry
