# Spec: scan-report (delta)

## REMOVED Requirements

### Requirement: Commands not yet available

**Reason**: `serve` is implemented in `add-mcp-server`; the “not available yet”
path for `serve` is obsolete. Unknown-command behavior moves to a dedicated
requirement below.

**Migration**: Use requirement “Unknown commands” for exit code 2 + help;
`serve` is covered by the `mcp-server` capability.

## ADDED Requirements

### Requirement: Unknown commands

Unknown commands SHALL exit with code 2 and show help. Implemented commands
including `run` and `serve` MUST NOT use a “not available yet” path.

#### Scenario: Unknown command

- **WHEN** the user runs `knot-sync nope`
- **THEN** the exit code is 2 and help is shown

#### Scenario: Serve is available

- **WHEN** the user runs `knot-sync serve -c <valid-config>`
- **THEN** the process does not exit solely because the command is unimplemented
- **AND** it does not print that `serve` is not available yet
