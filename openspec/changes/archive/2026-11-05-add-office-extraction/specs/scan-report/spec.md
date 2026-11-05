# Spec Delta

## MODIFIED Requirements

### Requirement: Commands not yet available
`serve` SHALL exit with code 2 and a message that it is not available yet.
Unknown commands SHALL exit with code 2 and show help. `run` is available and
MUST NOT use this “not available yet” path.

#### Scenario: Unknown command
- **WHEN** the user runs `knot-sync nope`
- **THEN** the exit code is 2 and help is shown

#### Scenario: Serve still unavailable
- **WHEN** the user runs `knot-sync serve`
- **THEN** the exit code is 2 and the message says it is not available yet
