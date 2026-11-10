# Tasks

## 1. Config + core logger

- [x] 1.1 Parse optional `logging:` (`path`, `level`) in core config; defaults
      (`info`, system JSONL beside store); reject unknown keys / bad level /
      empty path — verify unit tests including a Japanese relative path under
      `経理/` rejected when it resolves inside a source
- [x] 1.2 Add shared path-outside-sources helper (or core equivalent of audit
      assert) and `SystemLogger` JSONL append with level filtering — verify
      info skipped when level is `warn`; line is valid JSON with timestamp
- [x] 1.3 Ensure logger never receives document bodies in its public API
      (typed fields only) — verify a unit test that logged fields omit
      `content` even if a caller passes extra junk via a narrow API

## 2. CLI wiring + i18n

- [x] 2.1 Wire `scan` / `run` / `serve` / `optimize` (and peers that load
      config) to emit `command.start` / `command.end` / `command.error` (plus
      serve listen/shutdown) — verify temp-dir run produces start+end lines
      without document text `請求書 1000円` in the log file
- [x] 2.2 Keep stderr progress/errors; system log failures do not erase the
      original command error — verify with a forced unwritable log path or
      mock
- [x] 2.3 Add en/ja/vi messages for logging misconfiguration — verify
      `--lang ja` / `--lang vi` for path-under-source or bad level

## 3. Docs and roadmap

- [x] 3.1 Update starter config comments + root README: `logging` vs
      `server.audit_log`, defaults, no telemetry, size/rotation guidance
- [x] 3.2 Mark system logs done (or note) under Later / v0.3 in
      `docs/ROADMAP.md`
- [x] 3.3 Run full `pnpm test` and confirm all suites pass

## Workflow follow-up

- Archive with `/opsx:archive add-system-logs` after apply review
- Commit / PR when Harry asks
