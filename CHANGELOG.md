# Changelog

All notable changes to KnotSync are documented in this file.

## 0.2.0 — 2026-11-11

Open-core hooks for the shipped Paid edition surface, plus docs aligned with
local-first wording. Paid packages remain private workspace plugins (license
self-check); this npm release updates the free bundled CLI.

### Added

- Plugin `DocumentEnricher` extension point (runs after rule-based PII → guard)
- CLI `embed` command and optional MCP `search_similar` when a vector plugin
  is loaded
- Config / init stubs for opt-in paid plugins (OCR, 方眼紙, enterprise SQL,
  OAuth, catalog-llm, search-vector, guard-llm)

### Changed

- README (en) and ja/vi overviews: local-first (not air-gapped-only), Paid
  plugins table, MCP HTTP / `search_similar`, roadmap status through Paid #7

### Notes

- Verify after publish: `npx @hoanghainh/knot-sync@0.2.0 --version`
- Paid plugins are not published as separate npm packages in this release;
  enable them from the monorepo via `plugins:` + license env vars

## 0.1.3 — 2026-11-10

Production hardening (v0.3 open-core) bundled into the single CLI package.

### Added

- Extraction bounds: `extraction.maxFileSizeMb` / `timeoutSeconds` / `maxTextChars`,
  soft-skip oversized files, streaming-friendly large `.xlsx` handling
- SQL connector: configurable Postgres `schema`, connection pools, statement
  timeout, and extra `query_table` filters (`starts_with`, `between_dates`, `is_null`)
- Optional MCP HTTP transport: `knot-sync serve --http` with
  `KNOT_SYNC_API_KEY` Bearer auth and richer audit fields
- PII/guard expansions: Vietnamese MST, bank-account heuristics, JP/VN
  person-name hints; Base64 / markdown-exfil / zero-width flood guard rules
- Store scale: batched document upserts (500), `knot-sync optimize`, offline
  `pnpm store:stress` load script
- Local operational system logs: config `logging.path` / `logging.level`
  (JSONL, distinct from `server.audit_log`, no telemetry)

### Notes

- Verify after publish: `npx @hoanghainh/knot-sync@0.1.3 --version`

## 0.1.2 — 2026-11-09

### Changed

- Publish the full product README on the npm package page (synced from the
  repository root README at pack time)
- Add `repository` and `homepage` metadata so npmjs links to GitHub
- Prefer absolute GitHub links in the README so they work on npmjs

### Notes

- Verify after publish: `npx @hoanghainh/knot-sync@0.1.2 --version`

## 0.1.1 — 2026-11-09

First registry publish of the single bundled package `@hoanghainh/knot-sync`
(version `0.1.0` was unpublished earlier and cannot be reused on npm).

### Notes

- Same open-core surface as 0.1.0; publish-only version bump
- Verify: `npx @hoanghainh/knot-sync@0.1.1 --version`

## 0.1.0 — 2026-11-07

First publishable open-core release.

### Added

- `knot-sync init` / `scan` / `run` / `describe` / `ui` / `bench` / `plugins` /
  `serve` for local legacy data
- Folder source connector (`fs`) and SQLite store with FTS5 trigram search (JP/VN)
- Office/text extraction (`xlsx`, `docx`, PDF text, CSV/TSV, Markdown)
- JP/VN cleaning (NFKC, wareki→Gregorian, ISO dates, TCVN3/VNI, token reduction)
- PII masking (`mask` / `hash` / `drop`) and `scan --pii` estimate
- Prompt-injection guard (`flag` / `strip` / `block`)
- Self-contained HTML scan report (`scan --report`)
- Stdio MCP server: document search/get, SQL schema resource, `describe_table` /
  `query_table` (allow-listed, parameterized, no free SQL)
- Read-only PostgreSQL / MySQL sources (`url: env:NAME`, `allow:`)
- **Semantic Catalog**: `knot-sync describe`, `knot-sync.catalog.yaml`, romaji /
  Vietnamese dictionaries, optional テーブル定義書 Excel; MCP business-name
  filters and enum validation
- Catalog review UI (`knot-sync ui`, loopback-only)
- CLI messages in English, Japanese, and Vietnamese (`--lang` / `cli.locale`)
- Local effectiveness bench (`knot-sync bench`: token before/after + suite)
- Plugin system with built-in connectors, extractors, cleaners, and rules

### Notes

- Requires Node.js ≥ 22.13
- Sources are read-only; no telemetry
- npm publishes **only** `@hoanghainh/knot-sync` (one package); other workspace
  packages are private and bundled into the CLI
- After publish, verify: `npx @hoanghainh/knot-sync@0.1.1 --version`
