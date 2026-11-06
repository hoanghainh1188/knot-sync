# Spec: plugin-system (delta)

## ADDED Requirements

### Requirement: Cleaner contract is executable

A registered `Cleaner` SHALL expose `clean(document: Document): Document |
Promise<Document>` (name MAY be `clean` on the plugin object). The host SHALL
pass the current Document and use the returned Document for subsequent
cleaners and persistence.

Cleaners MUST NOT write to, move, or delete files under configured sources.
Cleaners MUST NOT perform network I/O.

#### Scenario: Sequential cleaners

- **WHEN** two Cleaners are registered
- **THEN** the second receives the Document returned by the first

#### Scenario: Identity when disabled steps

- **WHEN** a Cleaner runs with all of its steps disabled via config
- **THEN** it returns a Document whose `content` equals the input `content`
  (aside from metadata fields the cleaner is allowed to set, such as token
  estimates)
