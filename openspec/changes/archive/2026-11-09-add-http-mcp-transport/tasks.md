# Tasks

## 1. Auth helper and audit fields

- [x] 1.1 Add Bearer API key check against `KNOT_SYNC_API_KEY` with
      timing-safe compare and clear 401/missing-env errors — verify unit
      tests for match, mismatch, missing header, and empty env
- [x] 1.2 Extend `AuditEntry` with optional `clientIp`, `userAgent`,
      `requestId` and thread them from HTTP request context — verify a unit
      test that appended JSONL includes those fields when set and omits them
      for stdio-style entries

## 2. HTTP Streamable transport

- [x] 2.1 Implement `serveHttp({ host, port, … })` using SDK Streamable HTTP
      + `node:http` (add Express MIT only if blocked, and document in this
      change) with path `/mcp`, loopback default, and API key gate — verify
      integration tests: listen on ephemeral port, 401 without key, authenticated
      initialize/tools path succeeds without binding on stdio serve
- [x] 2.2 Wire graceful shutdown (SIGINT/SIGTERM) and Host allowlist for
      loopback — verify server closes cleanly in test teardown

## 3. CLI flags and i18n

- [x] 3.1 Parse `serve --http [--port] [--host]`; refuse HTTP start when
      `KNOT_SYNC_API_KEY` unset; keep default stdio path — verify CLI tests for
      help text, missing key exit 1, and stdio regression
- [x] 3.2 Add en/ja/vi strings for new flags and errors — verify locale key
      coverage test still passes

## 4. Docs and full verification

- [x] 4.1 Document HTTP serve, `/mcp`, env key, and security notes in root
      README (and ja/vi docs as needed); mark `add-http-mcp-transport` done in
      `docs/ROADMAP.md` — verify README mentions `--http` and `KNOT_SYNC_API_KEY`
- [x] 4.2 Run `pnpm test` and confirm all suites pass

## Workflow follow-up

- Archive with `/opsx:archive` after review/merge.
- Continue v0.3 with `enhance-pii-guard` when ready.
