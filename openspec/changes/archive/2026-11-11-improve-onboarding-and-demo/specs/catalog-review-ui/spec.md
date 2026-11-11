# Spec Delta

## ADDED Requirements

### Requirement: Purpose and boundary explainer in UI

The Catalog Review UI SHALL display a concise localized (`en`, `ja`, `vi`) explainer stating that the screen is for adding human-readable business meanings to cryptic database columns (for accurate AI queries) and that edits save only to `knot-sync.catalog.yaml` without modifying source databases.

#### Scenario: Vietnamese explainer banner in UI chrome

- **WHEN** the UI chrome dictionary is queried for locale `vi` (or opened with `?lang=vi`)
- **THEN** it includes a Vietnamese explainer mentioning labeling database columns for AI and that source databases are not modified

#### Scenario: Japanese explainer banner in UI chrome

- **WHEN** the UI chrome dictionary is queried for locale `ja` (or opened with `?lang=ja`)
- **THEN** it includes a Japanese explainer mentioning labeling database columns for AI and that source databases are not modified
