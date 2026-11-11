## MODIFIED Requirements

### Requirement: serve CLI command

`knot-sync serve` SHALL load config and plugins, open the configured store, and
run the MCP server until the transport closes or the process is interrupted. It
SHALL exit 0 on clean shutdown and exit 1 on config/store errors with an
actionable message. Help text SHALL describe `serve` as available, including
optional `--http` and `--sync-interval <seconds>` options.

When `--sync-interval <seconds>` is supplied on `serve`, it SHALL override
`server.sync_interval_seconds`. Non-positive or non-numeric `--sync-interval`
values SHALL fail startup cleanly with a localized `ConfigError` (`en`/`ja`/`vi`)
before serving requests.

#### Scenario: Serve starts with valid config

- **WHEN** the user runs `knot-sync serve -c <config>` with a valid store
- **THEN** the process remains running as an MCP server on stdio
- **AND** it does not print a “not available yet” message

#### Scenario: Help mentions http flag

- **WHEN** the user runs `knot-sync serve --help` (or top-level help listing serve)
- **THEN** output mentions `--http` (and documented port/host flags)

#### Scenario: Help mentions sync-interval flag

- **WHEN** the user runs `knot-sync serve --help` (or top-level help listing serve)
- **THEN** output mentions `--sync-interval`

#### Scenario: Invalid sync-interval rejected in active locale

- **WHEN** the user runs `knot-sync serve -c <config> --sync-interval 0 --lang ja`
- **THEN** startup fails with exit code 1 before opening the listener
- **AND** stderr displays a localized Japanese guidance message mentioning `--sync-interval`

## ADDED Requirements

### Requirement: Background periodic sync

When configured via `--sync-interval <seconds>` or `server.sync_interval_seconds`,
`knot-sync serve` SHALL schedule sequential, non-overlapping background cycles of
incremental `scan`, `run`, and stale-document pruning against read-only sources.
Cycles MUST NOT block active MCP requests or write diagnostics to `stdout`, and
timers MUST stop cleanly on shutdown.

#### Scenario: Newly added Vietnamese file becomes searchable during serve

- **GIVEN** `knot-sync serve --http --sync-interval <seconds>` is running against an initial folder snapshot
- **WHEN** a new file `Hợp đồng mới.txt` containing `Thanh toán 2024/05/01` is added to the read-only source folder and one sync interval elapses
- **THEN** the background sync cycle indexes and cleans it into SQLite so `search_documents` finds `Hợp đồng mới.txt` framed as untrusted data
- **AND** concurrent MCP requests before and after the cycle succeed without interruption and the source file remains untouched

#### Scenario: Deleted Japanese document pruned and transient cycle errors do not crash server

- **GIVEN** `knot-sync serve` is running with periodic sync enabled and a previously indexed file `請求書_old.txt` is removed from the folder
- **WHEN** the next background sync cycle executes
- **THEN** `請求書_old.txt` is pruned from `store.sqlite` so subsequent `search_documents` queries no longer return it
- **AND** if a sync cycle hits a transient source error, the server logs the error and continues serving MCP requests until normal shutdown cancels remaining timers
