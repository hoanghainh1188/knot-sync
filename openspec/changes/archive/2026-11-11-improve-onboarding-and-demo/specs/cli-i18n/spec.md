# Spec Delta

## ADDED Requirements

### Requirement: Grouped CLI help by workflow stage

The top-level `--help` output in `en`, `ja`, and `vi` SHALL organize the 10 stable CLI commands by workflow stage (setup/audit, data preparation, serving to AI, optional/maintenance) while preserving all English command names and flag tokens.

#### Scenario: Vietnamese grouped help lists core and optional commands

- **WHEN** the user runs `knot-sync --help --lang vi`
- **THEN** the help text groups commands into workflow stages in Vietnamese prose
- **AND** all 10 English command names (`init`, `scan`, `run`, `describe`, `ui`, `bench`, `optimize`, `embed`, `plugins`, `serve`) remain present

### Requirement: Actionable next-step hint after scan and run

When `knot-sync scan` or `knot-sync run` completes in human-readable mode (without `--json`), the CLI SHALL print a localized next-step hint in the active locale (`en`, `ja`, `vi`) guiding the operator to the subsequent command (`run` after `scan`, `serve` or `bench` after `run`). Machine-readable `--json` output SHALL remain unchanged.

#### Scenario: Japanese next-step hint after run

- **WHEN** the user runs `knot-sync run --lang ja` without `--json`
- **THEN** stdout includes Japanese guidance mentioning `knot-sync serve` as the next step

#### Scenario: JSON scan output stays pure JSON

- **WHEN** the user runs `knot-sync scan --json --lang vi`
- **THEN** stdout contains only valid JSON with no trailing prose hint
