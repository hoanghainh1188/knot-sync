# Spec: scan-report (delta)

## ADDED Requirements

### Requirement: Optional PII prevalence estimate

`knot-sync scan` SHALL accept `--pii`. When set, the scan output (text and
`--json`) SHALL include per-source an estimate of how many inventoried files
appear to contain personal data under the built-in PII rules, without storing
documents or match strings. When `--pii` is absent, behavior is unchanged from
prior requirements.

#### Scenario: JSON includes estimate

- **WHEN** the user runs `knot-sync scan --json --pii`
- **THEN** each source object includes a numeric PII estimate field (name per design)
- **AND** no matched PII substrings appear in the JSON
