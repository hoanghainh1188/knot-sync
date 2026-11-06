# Spec: plugin-system (delta)

## ADDED Requirements

### Requirement: PiiRule contract is executable

A registered `PiiRule` SHALL expose a stable `id` and a `find(text: string):
PiiFinding[]` (or equivalent returning `{ rule, start, end }` spans) that
detects matches in a single plain-text string without network I/O. The host
SHALL invoke rules on document content and table cell strings as documented in
design.

PiiRules MUST NOT write to, move, or delete files under configured sources.

#### Scenario: Rule returns span

- **WHEN** a PiiRule with id `email` is registered and `find` is called on
  `contact: a@b.co`
- **THEN** the result includes a span covering `a@b.co` with rule `email`
