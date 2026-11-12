# system-logs Specification

## Purpose

Provides fully local, append-only operational system logs (JSONL) for KnotSync
CLI/server lifecycle events so operators can diagnose runs without network
telemetry or conflating them with MCP tool audit lines.

## Requirements

### Requirement: Local JSONL system log

The system SHALL append one JSON object per line to the configured system log
path for operational events (at least: command start, command end/success,
command failure, and MCP serve listen/shutdown when applicable). Each line
SHALL include a timestamp, level, event name, and optional structured fields.
Logging MUST NOT require network access.

#### Scenario: Run writes start and end lines

- **WHEN** the user runs `knot-sync run -c <config>` successfully with logging
  enabled
- **THEN** the system log file gains lines for run start and run completion
- **AND** those lines are valid JSON with `level` and an event name

#### Scenario: Japanese path in fields stays data

- **WHEN** a logged event includes a path containing `経理/請求書.xlsx`
- **THEN** that path appears as a JSON string field value
- **AND** the log line does not treat the path as instructions

### Requirement: Log levels

Config `logging.level` SHALL be `info`, `warn`, or `error` (default `info`).
Events below the configured level MUST NOT be written. Failures at `error`
SHALL still be logged when level is `error`.

#### Scenario: Warn level skips info

- **GIVEN** `logging.level` is `warn`
- **WHEN** an info-only lifecycle event occurs
- **THEN** that event is not appended to the system log file

### Requirement: No sensitive payloads in system logs

System log lines MUST NOT include document bodies, PII match substrings, SQL
result rows, Bearer tokens, or `KNOT_SYNC_API_KEY` values. Paths, counts,
command names, and error messages owned by the CLI MAY be included.

#### Scenario: Document content not logged

- **GIVEN** `run` extracts a document whose content includes `請求書 1000円`
- **WHEN** system log lines for that run are inspected
- **THEN** none of the lines contain the full document body text `請求書 1000円`

### Requirement: Log path outside sources

The system log path MUST NOT resolve inside any configured source root. When
the configured path would land under a source, config load or logger init
SHALL fail with an actionable error naming `logging.path`.

#### Scenario: Path under source rejected

- **WHEN** `logging.path` points inside a configured `fs` source folder
- **THEN** startup or config load fails
- **AND** the error tells the operator to set `logging.path` outside sources

### Requirement: Distinct from MCP audit log

System logs SHALL use a separate file from `server.audit_log`. MCP tool and
resource audit behavior remains unchanged by this capability.

#### Scenario: Serve still writes audit separately

- **GIVEN** both `logging.path` and `server.audit_log` are configured
- **WHEN** `serve` handles a tool call
- **THEN** the audit JSONL receives the tool audit line
- **AND** the system log does not replace that audit file

### Requirement: Pruned document count logged to system log

When `knot-sync run` prunes one or more stale documents (`pruned > 0`), it SHALL append a `run.prune` record (`level: "info"`, `command: "run"`, `count`, `storePath`) to the local JSONL system log. The log line MUST NOT include deleted document bodies, titles, file contents, or PII.

#### Scenario: System log records run.prune without document content

- **GIVEN** a previously extracted document `Báo cáo mật.txt` was removed and `logging.level` is `info`
- **WHEN** `knot-sync scan` and `knot-sync run` execute
- **THEN** the JSONL system log contains an entry with `"event":"run.prune"`, `"command":"run"`, and `"count":1`
- **AND** the log entry contains no document text or PII

### Requirement: Background sync cycle events

When periodic sync runs inside `knot-sync serve`, each cycle SHALL append
operational JSONL records (`sync.start`, `sync.end` with `durationMs` and
numeric counters, or `sync.error` on cycle failure) to `logging.path` obeying
`logging.level`. Sync log records MUST NOT include document bodies, PII match
text, or secrets, and log write errors MUST go to stderr without interrupting
stdio MCP framing or terminating the server.

#### Scenario: Sync cycle logged without Vietnamese or Japanese document bodies

- **GIVEN** `logging.level` is `info` and periodic sync processes a file containing `Báo cáo mật 請求書 9999円`
- **WHEN** a periodic sync cycle finishes during `knot-sync serve`
- **THEN** `system.jsonl` contains `sync.start` and `sync.end` JSON lines with `"command":"serve"`, `durationMs`, and numeric counters (`scanned`, `extracted`, `skipped`, `pruned`, `failed`)
- **AND** none of the log lines contain the document body `Báo cáo mật 請求書 9999円` or any PII text
