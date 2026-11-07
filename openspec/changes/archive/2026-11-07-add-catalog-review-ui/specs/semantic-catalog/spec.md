## ADDED Requirements

### Requirement: Human review via local UI

Operators MAY confirm or edit catalog entries through the local catalog
review UI (`knot-sync ui`) as well as by editing the YAML file directly.
Saving from the UI SHALL produce a catalog document that still satisfies the
catalog entry shape and SHALL set `reviewed` according to the operator’s
choice. Re-running `describe` MUST continue to preserve entries with
`reviewed: true` unchanged.

#### Scenario: UI-reviewed column survives describe

- **GIVEN** a column marked `reviewed: true` with label ja `得意先コード` via
  the review UI
- **WHEN** `knot-sync describe` runs again with dictionaries that would
  suggest a different label
- **THEN** the ja label remains `得意先コード`
