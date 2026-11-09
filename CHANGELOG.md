# Changelog

All notable changes to KnotSync are documented in this file.

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
