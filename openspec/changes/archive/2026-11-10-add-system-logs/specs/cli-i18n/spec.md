# Spec Delta

## ADDED Requirements

### Requirement: Logging misconfiguration messages are localized

User-facing errors for invalid or unsafe `logging` config (unknown keys,
invalid level, path inside a source) SHALL be available in `en`, `ja`, and
`vi` through the existing CLI message catalog when the CLI surfaces them.
Config key names `logging`, `path`, and `level` remain English in messages.

#### Scenario: Japanese logging.path under source

- **WHEN** config load or logger init fails because `logging.path` is under a
  source and the operator uses `--lang ja`
- **THEN** stderr includes Japanese guidance naming `logging.path`
- **AND** exit code is non-zero

#### Scenario: Vietnamese invalid level

- **WHEN** config contains `logging.level: debug` and the operator uses
  `--lang vi`
- **THEN** stderr includes Vietnamese guidance listing allowed levels
  **AND** the tokens `info`, `warn`, and `error` remain English
