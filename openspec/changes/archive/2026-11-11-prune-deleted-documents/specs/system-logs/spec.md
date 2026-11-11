## ADDED Requirements

### Requirement: Pruned document count logged to system log

When `knot-sync run` prunes one or more stale documents (`pruned > 0`), it SHALL append a `run.prune` record (`level: "info"`, `command: "run"`, `count`, `storePath`) to the local JSONL system log. The log line MUST NOT include deleted document bodies, titles, file contents, or PII.

#### Scenario: System log records run.prune without document content

- **GIVEN** a previously extracted document `Báo cáo mật.txt` was removed and `logging.level` is `info`
- **WHEN** `knot-sync scan` and `knot-sync run` execute
- **THEN** the JSONL system log contains an entry with `"event":"run.prune"`, `"command":"run"`, and `"count":1`
- **AND** the log entry contains no document text or PII
