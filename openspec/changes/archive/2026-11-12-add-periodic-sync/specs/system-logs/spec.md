## ADDED Requirements

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
