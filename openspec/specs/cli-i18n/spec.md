# cli-i18n Specification

## Purpose

Gives Japanese and Vietnamese operators localized CLI help, errors, and
progress text while keeping command names and machine-readable output stable
in English.

## Requirements

### Requirement: Supported CLI locales

The CLI SHALL support locales `en`, `ja`, and `vi` for user-facing messages.
Unsupported locale values from flags or config SHALL fail with an actionable
error that lists the allowed values and suggests fixing `--lang` or
`cli.locale`.

#### Scenario: Japanese help text

- **WHEN** the user runs `knot-sync --help --lang ja`
- **THEN** the help text is Japanese (or predominantly Japanese prose)
- **AND** command names such as `scan`, `run`, and `serve` remain English

#### Scenario: Vietnamese unknown-command error

- **WHEN** the user runs `knot-sync khong-ton-tai --lang vi`
- **THEN** the process exits with code 2
- **AND** stderr includes Vietnamese guidance naming the unknown command
- **AND** stderr still shows the English command token that was typed

#### Scenario: Invalid --lang value

- **WHEN** the user runs `knot-sync scan --lang fr`
- **THEN** the process exits with a non-zero code
- **AND** the error lists allowed locales `en`, `ja`, and `vi`

### Requirement: Locale resolution order

The effective locale SHALL be the first available of: `--lang`, then
`cli.locale` from a loaded config, then the environment heuristic, else `en`.

#### Scenario: Flag overrides config

- **GIVEN** a config with `cli.locale: ja`
- **WHEN** the user runs `knot-sync init --lang en`
- **THEN** English messages are used

#### Scenario: Config used when flag omitted

- **GIVEN** a config with `cli.locale: vi`
- **WHEN** the user runs `knot-sync scan` without `--lang`
- **THEN** Vietnamese user-facing messages are used

#### Scenario: Default English

- **WHEN** no `--lang`, no `cli.locale`, and no matching env locale is present
- **THEN** English messages are used

### Requirement: Environment locale heuristic

When `--lang` and `cli.locale` are unset, the CLI SHALL use `KNOT_SYNC_LANG`
if it is exactly `en`, `ja`, or `vi`; otherwise map `LANG` / `LC_ALL` prefixes
`ja*` → `ja` and `vi*` → `vi`. Commands that skip config load (e.g. `--help`)
SHALL still honor `--lang` and this heuristic, then default to `en`.

#### Scenario: KNOT_SYNC_LANG selects Japanese

- **WHEN** `KNOT_SYNC_LANG=ja` and no `--lang` / `cli.locale` is set
- **THEN** Japanese user-facing messages are used

#### Scenario: Help without config uses env

- **WHEN** the user runs `knot-sync --help` with `KNOT_SYNC_LANG=vi` and no
  `--lang`
- **THEN** the help text is Vietnamese prose with English command names

### Requirement: Machine interfaces stay English

Command names, option/flag names, `--json` object keys and structure, exit
codes, the version string from `--version`, source ids, plugin ids, and file
paths printed as path values SHALL remain English / unchanged by locale.
Dynamic customer data (paths, table names, issue codes from connectors) SHALL
not be translated.

#### Scenario: JSON scan output keys unchanged

- **WHEN** the user runs `knot-sync scan --json --lang ja` successfully
- **THEN** the JSON uses the same English field names as with `--lang en`

#### Scenario: Version is locale-invariant

- **WHEN** the user runs `knot-sync --version --lang vi`
- **THEN** stdout is the version string only (same as English)

### Requirement: Errors explain the next step in the active locale

Localized error and failure messages that the CLI owns SHALL tell the user
what to do next in the active locale (for example run `init`, fix config,
or use `--force`), while preserving English command and flag tokens inside
those messages.

#### Scenario: Missing inventory message in Japanese

- **WHEN** `knot-sync run --lang ja` finds no scan inventory
- **THEN** stderr is Japanese prose that mentions running `knot-sync scan`
  before `run`

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
