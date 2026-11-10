# Design

## Context

See proposal.md — Why. MCP already has append-only JSONL **audit** logging
(`server.audit_log`) for tool/resource calls, with path-outside-sources checks
in `packages/mcp-server`. CLI commands still rely mainly on stderr for
lifecycle diagnosis. Roadmap Later / v0.3 calls for **system logs** as local
ops logs, not telemetry and not a merge with audit.

## Goals / Non-Goals

**Goals:**

- Small append-only JSONL system logger for CLI/server lifecycle events
- Config `logging.path` / `logging.level` with defaults beside the store
- Refuse log paths under configured source roots
- Keep stderr human UX; keep MCP audit file separate
- Zero new third-party dependencies; fully local (no outbound shipping)

**Non-Goals:**

- OpenTelemetry, syslog shipping, remote aggregators
- Logging document bodies, PII match text, SQL rows, or API keys
- Automatic log rotation daemon (document size guidance only)
- Replacing or routing MCP audit through the system logger

## Decisions

### 1. Logger lives in `packages/core`

**Choice:** Add a tiny `SystemLogger` (or `createSystemLogger`) in core:
`append({ level, event, ...fields })`, sync or async `appendFile` of one JSON
line, create parent dirs once (same pattern as `AuditLog`). Export level
ordering `error` < `warn` < `info` for filtering.

**Alternatives:** Put logger only in CLI — rejected; config types and path
validation belong with config load, and serve/run share the helper.

### 2. Default path beside store

**Choice:** When `logging.path` omitted, default to
`<dirname(store.path)>/system.jsonl` (parallel to default MCP audit under
`.data/`). Document in starter comments and README.

**Alternatives:** Default off until path set — weaker for production
diagnosis; always-on local file next to store matches audit defaults.

### 3. Path safety mirrors audit

**Choice:** Reuse the same absolute-prefix check as
`assertAuditPathOutsideSources` (extract a shared
`assertPathOutsideSources(path, sourcePaths, { key: "logging.path" })` in
core, or duplicate the small helper once in core and call from audit). Fail
with `ConfigError` naming `logging.path`.

**Alternatives:** Only check at write time — still needed, but prefer fail at
config/logger init so bad configs never start.

### 4. What gets logged

**Choice:** Minimum event set for this change:

| Event | Level | Commands |
|---|---|---|
| `command.start` | info | scan, run, serve, optimize, … |
| `command.end` | info | success path |
| `command.error` | error | failures with message (no stack dump of secrets) |
| `serve.listen` / `serve.shutdown` | info | serve |

Optional structured fields: `command`, `exitCode`, `durationMs`, paths that
are KnotSync-owned (config, store, log), counts. Never: document `content`,
PII substrings, SQL row payloads, Bearer / `KNOT_SYNC_API_KEY`.

### 5. CLI wiring

**Choice:** After config load, construct logger; wrap command handlers with
start/end/error appends. Failures still print to stderr as today, then append
`command.error`. Logger write failures SHOULD surface once (stderr) without
masking the original command error.

### 6. Read-only / fully local

System logger writes only to `logging.path` (outside sources). No network
calls, no telemetry endpoints, no HTTP log shippers. Source trees remain
read-only. Document content stays in the store / MCP framing, not in ops logs.

### 7. i18n

Add minimal catalog keys for logging config/path/level errors in `en`/`ja`/
`vi`. Machine tokens (`logging.path`, level enums) stay English.

## Risks / Trade-offs

- **[Disk growth]** → Document that operators may truncate/rotate externally;
  no built-in rotator in this change
- **[Confusion with audit]** → Distinct filename default + docs; never write
  tool audit lines into system.jsonl
- **[Logger I/O slows CLI]** → Append is cheap; no flush batching required for
  v0.3 volumes
- **[Partial localization of ConfigError from core]** → Prefer CLI mapping or
  English ConfigError with CLI wrapping where locale is known (match prior
  i18n design)

## Migration Plan

- Optional `logging:` section; omit = defaults (info + path beside store)
- No schema / store migration
- Rollback: revert logger wiring; configs with `logging:` become unknown-key
  errors unless left unused

## Open Questions

None — event names and default path are fixed for this change; richer events
can append later without renaming the config section.
