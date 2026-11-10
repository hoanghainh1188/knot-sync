# Proposal

## Why

Operators running KnotSync in production need durable, local operational logs
(command start/end, failures, serve lifecycle) separate from the MCP tool
**audit** log. Roadmap “Later / v0.3” calls out system logs after the
hardening track; without them, diagnosis relies only on ephemeral stderr.

## What Changes

- Add a small local **system logger** (JSONL append) used by CLI commands
  (`scan`, `run`, `serve`, `optimize`, and peers as needed)
- Add config section `logging:` with `path` (optional; default beside store)
  and `level` (`info` | `warn` | `error`, default `info`)
- Refuse log paths inside configured source roots (same discipline as audit)
- Keep stderr progress/errors for humans; file log is structured for ops
- Document usage; update ROADMAP Later / v0.3 note

**No new third-party dependencies.**

**Assumptions (roadmap had no detailed prompt):** system logs are operational
JSONL on disk, not MCP audit lines, not remote telemetry, and not a full
observability stack.

## Capabilities

### New Capabilities

- `system-logs`: local JSONL operational logging (levels, path safety, what is /
  is not logged)

### Modified Capabilities

- `config`: optional `logging:` section (`path`, `level`) with validation
- `cli-i18n`: user-facing messages if logging misconfiguration is reported in
  the active locale (minimal keys)

## Impact

- Code: `packages/core` (config + logger helper) and/or CLI wiring; tests
- Config: new optional top-level `logging:` keys; starter comments
- Runtime: still fully local; no outbound log shipping
- Distinct from `server.audit_log` (MCP tool/resource audit remains unchanged)

## Out of scope

- Remote/cloud log shipping, OpenTelemetry, Datadog, etc. (violates no-telemetry)
- Replacing or merging with MCP `audit_log`
- Logging document bodies, PII match text, SQL row payloads, or API keys
- Log rotation daemons (document simple size guidance; optional truncate later)
- Paid multi-tenant / OAuth identity fields in logs
- Changing default human CLI UX beyond optional file logging
