# Spec: document-search (delta)

## ADDED Requirements

### Requirement: Optional source and type filters

Search SHALL accept optional filters for `sourceId` and document `type`. When
provided, only documents matching those filters SHALL be returned. When omitted,
behavior remains as in prior requirements (all sources and types).

#### Scenario: Filter by source id

- **GIVEN** documents in sources `share` and `other`
- **WHEN** search runs with query `請求書` and `sourceId: "share"`
- **THEN** only documents from `share` are returned

#### Scenario: Filter by type

- **WHEN** search runs with a query and `type: "xlsx"`
- **THEN** hits whose type is not `xlsx` are excluded
