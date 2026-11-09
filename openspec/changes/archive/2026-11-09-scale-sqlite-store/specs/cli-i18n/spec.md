# Spec Delta

## ADDED Requirements

### Requirement: optimize command messages are localized

User-facing help, progress, and error strings for `knot-sync optimize` SHALL
be available in `en`, `ja`, and `vi` through the existing CLI message catalog.
Command name `optimize` and flag names remain English.

#### Scenario: Japanese optimize help

- **WHEN** the user runs `knot-sync optimize --help --lang ja` (or top-level
  help with `--lang ja` listing commands)
- **THEN** descriptive prose for `optimize` is Japanese
- **AND** the token `optimize` remains English

#### Scenario: Vietnamese store-open error

- **WHEN** `knot-sync optimize --lang vi` fails because the store cannot be opened
- **THEN** stderr includes Vietnamese guidance
- **AND** exit code is non-zero
