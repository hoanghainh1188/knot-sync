# KnotSync roadmap

Positioning: **a semantic layer for legacy data.** Cleaning is preparation; the
Semantic Catalog (business names, descriptions, valid values for cryptic fields
like `TKSK_CD` or `ma_kh`) is the core value.

**Current status (2026-11-13):** open-core **v0.1–v0.4** ✅ and Paid edition
capabilities **#1–#7** ✅ (+ Cloud Drive connectors) are shipped in this repo. Docs prep
`prepare-v1-public-contract` (1.0 public surface + Paid npm clarity; **do not**
tag `1.0.0` until a real pilot) and `improve-onboarding-and-demo` are archived
✅. Next planned tracks in order: **v0.5 (Pre-Pilot AI Reasoning, Multi-Table ERP & Turnkey LAN Appliance — Issues #53–#57)** →
**v1.0 (`release-v1-0-0` after pilot verification)** → **v1.1+ (Safe Write Tools
& Regional SaaS Connectors)**. See the tables below.

Pipeline (4 stages):

1. **Ingest & clean** — extract, normalize JP/VN text, reduce tokens, mask PII, flag prompt injection
2. **Semantic tagging** — Semantic Catalog (rules + テーブル定義書 in free; local LLM in paid)
3. **MCP mapping** — Resources (`knot://…` URIs), Tools (strict Zod schemas), Prompts (SOPs)
4. **Security & governance** — read-only, allow-lists, audit log (OAuth 2.1 in paid)

## How to use this file with Claude Code

Work through the changes **in order**, one at a time:

```
/opsx:propose <prompt from the table below>
# review the 4 artifacts, edit if needed
/opsx:apply <change-name>
/opsx:archive <change-name>
# commit, then tick the change here
```

## v0.1 changes

| # | Change | Status |
|---|---|---|
| 0 | Foundation: core, folder source, SQLite store, `init`, `scan` | ✅ done (baseline specs) |
| 1 | `add-plugin-system` | ✅ done |
| 2 | `add-office-extraction` | ✅ done |
| 3 | `add-ja-vi-cleaning` | ✅ done |
| 4 | `add-pii-masking` | ✅ done |
| 5 | `add-injection-guard` | ✅ done |
| 6 | `add-html-scan-report` | ✅ done |
| 7 | `add-mcp-server` | ✅ done |
| 8 | `add-sql-source` | ✅ done |
| 9 | `add-semantic-catalog` | ✅ done |
| 10 | `prepare-npm-release` | ✅ done |

From change 2 on, every new connector, extractor, cleaner, rule, catalog source,
MCP tool or prompt MUST be built as a plugin on the plugin API from change 1.

### 1. add-plugin-system

```
/opsx:propose add-plugin-system: Add a plugin API in core and plugin loading in the CLI, before
any other pipeline work. Extension points: connector, extractor, cleaner, pii-rule, guard-rule,
catalog-source, mcp-tool, mcp-prompt (define the interfaces now, even if only connector is used
today). A plugin is an ES module whose default export is { name, version, apiVersion,
register(api) }; register() adds implementations to typed registries. Config `plugins:` lists
npm package names or relative file paths; only listed plugins are loaded, never auto-discovered.
Built-in features are plugins too, loaded by default (turn the existing folder source into the
built-in `fs` connector plugin, and make source `type` resolve through the connector registry so
new source types come from plugins). Reject plugins with an incompatible apiVersion or duplicate
ids with a clear error. Add `knot-sync plugins` to list loaded plugins and their extension points.
Plugin-specific settings live under the plugin's own config key and are validated by the plugin.
Document that plugins run in-process with full trust (install only trusted plugins), and that
paid plugins check their own license key (the core never does). Keep all existing specs passing;
the config spec changes because source types become plugin-provided. Include an example plugin
in examples/plugins/ (e.g. a custom PII rule) with tests. No new dependencies.
```

### 2. add-office-extraction

```
/opsx:propose add-office-extraction: New package extractor-office (built-in extractor plugin) and the `knot-sync run` command.
`run` reads the inventory from the last scan, extracts text and tables from .xlsx, .docx,
text-based .pdf, .csv/.tsv, .txt and .md into the Document model (content as Markdown, tables
as headers+rows), and stores them so document-search finds them. Only re-extract files whose
hash changed since the last run. Unsupported or broken files are reported as issues, never crash
the run. Out of scope: OCR for scanned PDFs/images, .xls/.doc (old binary formats), 方眼紙 layout
detection (paid). Candidate libraries: exceljs (MIT), mammoth (BSD-2-Clause), unpdf (MIT).
Fixtures must be generated in tests, the files in examples/sample-data are fake bytes.
```

### 3. add-ja-vi-cleaning

```
/opsx:propose add-ja-vi-cleaning: New package cleaner-ja-vi applied by `run` after extraction.
Unicode NFKC (full-width/half-width), wareki to Gregorian (明治/大正/昭和/平成/令和, including
元年 and kanji numerals), dates to ISO 8601 (2024/1/5, 05-01-2024, 2024年1月5日), legacy Vietnamese
fonts TCVN3 and VNI to Unicode (detect, then convert), token reduction (collapse whitespace,
drop empty rows/cells, remove headers/footers repeated on every page), and record an estimated
token count before/after per document for the future `bench` command. Each step can be turned
off in config `cleaning:`. Original text is kept in the store for traceability. Avoid new
dependencies; a simple token estimate is fine (exact tokenizer is out of scope).
```

### 4. add-pii-masking

```
/opsx:propose add-pii-masking: New package pii-basic applied by `run` before storing.
Rules: email, Japanese phone numbers, Vietnamese phone numbers, Vietnamese CCCD (12 digits),
Japanese My Number (12 digits with check digit), credit card numbers (Luhn). Modes from config
`pii.mode`: mask (***), hash (stable salted hash per installation), drop. Findings are saved in
Document.pii (rule + position). The masked text is what reaches the search index and MCP; the
unmasked text must never be stored. `scan` gains an optional `--pii` sample check that estimates
how many files contain personal data, without storing any matches.
```

### 5. add-injection-guard

```
/opsx:propose add-injection-guard: New package guard applied by `run`. Detect indirect prompt
injection in document text with rules: instruction-like phrases in English, Japanese and
Vietnamese ("ignore previous instructions", "以前の指示を無視", "bỏ qua hướng dẫn trước"…),
zero-width and bidi control characters, hidden text (white or hidden cells/runs in Excel/Word
when the extractor exposes it). Config `guard.mode`: flag, strip, block. Results saved per
document (risk level + flagged spans). Model-based guardrails shipped later as paid
`add-model-guardrails` / `packages/guard-llm` (out of scope for this free change).
```

### 6. add-html-scan-report

```
/opsx:propose add-html-scan-report: `knot-sync scan --report [file]` writes ONE self-contained
HTML file (no external assets, works offline, light and dark mode) with the scan health summary:
totals, by type, duplicates (top groups), old/empty/unreadable files, and — when available —
PII estimate. Audience: a non-technical manager at the customer; labels in English, Japanese and
Vietnamese (language switch inside the page). New package report-html. No charting library.
```

### 7. add-mcp-server

```
/opsx:propose add-mcp-server: New package mcp-server and the `knot-sync serve` command (stdio
only). Resources: knot://sources, knot://docs/{source}/{doc_id}. Tools with strict Zod input
schemas: search_documents (query, source, type, limit), get_document (id). Prompts loaded from
config `prompts:` (name, description, arguments, template). Every tool result frames document
text as untrusted content, never as instructions, and includes guard flags. Audit log as JSONL
(timestamp, tool/resource, arguments, result count) at config `server.audit_log`. Read-only: no
tool may change any data. Out of scope: HTTP transport and OAuth 2.1 (paid). Libraries:
@modelcontextprotocol/sdk (MIT), zod (MIT). Include a README section showing how to register
the server in Claude Desktop / Claude Code / Cursor.
```

### 8. add-sql-source

```
/opsx:propose add-sql-source: New package connector-sql with source types postgres and mysql.
Connection URL from an environment variable (url: env:NAME), never stored in the config file.
Connect read-only (read-only transaction / session), introspect tables, columns, types, keys.
Only tables and columns listed in `allow:` are exposed. Add MCP resource
knot://db/{source}/{table}/schema and tools describe_table and query_table: filters on allowed
columns only (equals, in, range, contains), parameterized queries, max rows, no free SQL.
`scan` reports table counts and row estimates. Libraries: pg (MIT), mysql2 (MIT).
```

### 9. add-semantic-catalog — ✅ done

`packages/catalog`, `knot-sync describe`, dictionaries, optional definition Excel
(fixture-built in tests), MCP enrichment / business-name filters / enum checks.
Reviewed entries preserved across re-runs. Out of scope: local LLM (paid).

### 10. prepare-npm-release — ✅ done

Follow-up `single-npm-package`: publish **only** `@hoanghainh/knot-sync`;
other workspace packages stay private and are bundled into the CLI.

Release tooling: per-package README/LICENSE, CHANGELOG, `docs/ja` + `docs/vi`,
CI matrix (Node 22/24 × Linux/macOS/Windows), license gate, tag publish with
npm provenance. **Shipped:** `@hoanghainh/knot-sync@0.1.1` on npm.

Follow-up `improve-npm-package-page`: ship the product README +
`repository`/`homepage` on the npm page (**`0.1.2`**). Production hardening
track ships as **`0.1.3`**. Paid edition surface + enricher/`embed` hooks ship
as **`0.2.0`** (`npx @hoanghainh/knot-sync@0.2.0 --version` after tag publish).


## v0.2 changes

| # | Change | Status |
|---|---|---|
| 1 | `add-cli-i18n` — CLI messages en/ja/vi (`--lang`, `cli.locale`) | ✅ done |
| 2 | `add-catalog-review-ui` — `knot-sync ui` + Semantic Catalog review | ✅ done |
| 3 | `add-bench` — `knot-sync bench` (tokens / tool-call accuracy) | ✅ done |

### 1. add-cli-i18n

```
/opsx:propose add-cli-i18n: Localize CLI help, errors and progress for en/ja/vi.
Resolve locale from --lang, then cli.locale, then env heuristic, else en.
Keep command names, flags, --json keys and --version in English. No new deps.
```

## Production readiness (v0.3 & Enterprise Hardening)

Target: Harden KnotSync for production deployments (resilience, security,
scalability). Multi-tenant OAuth remains paid.

| # | Change | Priority | Status |
|---|---|:---:|---|
| 1 | `harden-office-extraction` | P0 | ✅ done |
| 2 | `harden-sql-connector` | P1 | ✅ done |
| 3 | `add-http-mcp-transport` | P1 | ✅ done |
| 4 | `enhance-pii-guard` | P2 | ✅ done |
| 5 | `scale-sqlite-store` | P2 | ✅ done |
| 6 | `add-system-logs` | P2 | ✅ done |

### 1. harden-office-extraction (P0)

```
/opsx:propose harden-office-extraction: Harden office extractor against OOM and infinite hangs.
Add config extraction.maxFileSizeMb (default 50MB) and extraction.timeoutSeconds (default 30s).
Safely skip oversized files with an actionable issue code (SKIPPED_TOO_LARGE) without aborting
the scan or run. Switch large xlsx parsing to ExcelJS streaming reader to keep RAM usage bounded.
Implement per-file extraction timeout via Promise.race / AbortSignal. Add chunking for large
delimited text files (.csv, .tsv, .txt) exceeding token thresholds.
```

### 2. harden-sql-connector (P1)

```
/opsx:propose harden-sql-connector: Support custom PostgreSQL schemas and resilient connection management.
Allow configurable schema in PostgresSourceConfig (default: "public", configurable to any schema).
Update introspection queries in packages/connector-sql/src/postgres.ts to filter dynamically.
Adopt connection pooling (pg.Pool with max connections cap) and enforce per-session statement_timeout
(e.g., 5000ms) to prevent full-table scan resource exhaustion on production databases.
Add common business query filters to query_table (starts_with, between_dates, is_null).
```

### 3. add-http-mcp-transport (P1)

Open-core: HTTP/SSE + shared API key for team/server deployments.
**Out of scope (paid):** OAuth 2.1, scopes, and multi-tenant identity.

```
/opsx:propose add-http-mcp-transport: Add networked MCP transport for centralized team/server deployments.
Add knot-sync serve --http [--port 3000] [--host 0.0.0.0] using @modelcontextprotocol/sdk SSEServerTransport
alongside existing stdio transport. Support Bearer Token / API key authentication via Authorization header
configured via environment variable (KNOT_SYNC_API_KEY). Return 401 Unauthorized on unauthenticated requests.
Enrich JSONL audit log with client IP, user agent, and request ID. Out of scope: OAuth 2.1 and scopes (paid).
```

### 4. enhance-pii-guard (P2)

```
/opsx:propose enhance-pii-guard: Expand PII masking and prompt injection defenses to meet regional compliance.
Add Vietnamese Tax Code (MST - 10-digit enterprise and 13-digit branch format) and Bank Account Number
detection rules with common prefixes to pii-basic. Add heuristic name dictionaries for common Vietnamese and
Japanese surnames/given names. Harden guard with suspicious Base64 payload detection, markdown exfiltration
pattern detection (![exfil](https://...)), and zero-width character flood detection.
```

### 5. scale-sqlite-store (P2)

```
/opsx:propose scale-sqlite-store: Optimize SQLite storage and FTS5 for large document stores (>100k docs).
Batch document upserts in chunked transactions (500 records per tx) to minimize disk I/O and lock contention.
Add knot-sync optimize CLI command to run FTS5 optimize and PRAGMA wal_checkpoint(TRUNCATE).
Add load and stress benchmark scripts to monitor latency and memory under 50k+ document indices.
```

### 6. add-system-logs (P2)

```
/opsx:propose add-system-logs: Local JSONL operational system logs for CLI/server lifecycle.
Config logging.path (default beside store) and logging.level (info|warn|error). Refuse paths
under sources. Distinct from server.audit_log. No telemetry / remote shipping. No new deps.
```

## Later

| Version | Scope |
|---|---|
| v0.3 | Production hardening complete in open-core (see section above) ✅ |
| Paid | Separate plugin packages (license checked by the plugin, never by core) ✅ #1–#7 below |
| Onboarding | `prepare-v1-public-contract` ✅ + `improve-onboarding-and-demo` ✅ |
| v0.4 | Pilot readiness & data hygiene (prune deleted docs, SQL sort/aggregates, slim store, periodic sync) ✅ |
| v0.5 | Pre-Pilot AI reasoning, multi-table ERP relations & turnkey LAN deployment (Issues #53–#57) ⏳ |
| v1.0 | Commercialization & governance (Ed25519 offline licensing ✅, UI document explorer ✅, `.xls`/`.doc` ✅, `1.0.0` release ⏳) |
| v1.1+ (After v1.0) | Write tools / stored procedures (always with human approval) & enterprise SaaS connectors |

---

## v0.4 — Pilot Readiness & Data Hygiene

Target: Close data lifecycle and analytical gaps before running customer pilots, while keeping the 1.0 public CLI/MCP contract backward-compatible (additive only).

| # | Change | Priority | Status |
|---|---|:---:|---|
| 1 | `prune-deleted-documents` | P0 | ✅ done |
| 2 | `enhance-sql-query-analytics` | P0 | ✅ done |
| 3 | `slim-document-store` | P1 | ✅ done |
| 4 | `add-periodic-sync` | P1 | ✅ done |

### 1. prune-deleted-documents (P0)

```
/opsx:propose prune-deleted-documents: Prune stale documents from the local SQLite store (and vector embeddings when present) during `knot-sync run` when their source files are no longer present in the latest `scan` inventory for that source. Keep customer sources strictly read-only. Report the number of pruned documents in `run` output and system logs (`en`/`ja`/`vi`). No new dependencies.
```

### 2. enhance-sql-query-analytics (P0)

```
/opsx:propose enhance-sql-query-analytics: Add additive, allow-listed `orderBy` (`column`, `dir: asc|desc`) and safe aggregation support (`COUNT`, `SUM`, `AVG`, `MIN`, `MAX` with optional `GROUP BY` on allow-listed columns) to `query_table` in `packages/connector-sql`. Resolve both physical and reviewed Semantic Catalog business labels (JA/VI/EN) in `orderBy` and `groupBy` just like `filters`. Keep read-only transactions, parameterized queries, and statement timeouts enforced. No new dependencies.
```

### 3. slim-document-store (P1)

```
/opsx:propose slim-document-store: Add `cleaning.keepOriginalText` (default `false`) so `cleaner-ja-vi` and `store-sqlite` do not persist full `metadata.originalContent` copies by default, cutting SQLite store size roughly in half while keeping `tokensBefore`, `tokensAfter`, and cleaning step metadata for `knot-sync bench`. Preserve opt-in `keepOriginalText: true` (still PII-masked) when operators want full before/after text in metadata. No new dependencies.
```

### 4. add-periodic-sync (P1)

```
/opsx:propose add-periodic-sync: Add optional background sync interval (`--sync-interval <seconds>` or config `server.sync_interval_seconds`) to `knot-sync serve` so shared LAN deployments automatically run incremental `scan` + `run` + prune without an external cron job. Log each background sync cycle to `system.jsonl` without interrupting active MCP requests. No new dependencies.
```

---

## v0.5 — Pre-Pilot AI Reasoning, Multi-Table ERP & Turnkey LAN Appliance

Target: Maximize AI reasoning accuracy on masked PII, prevent context window overflow on large documents, unlock multi-table ERP lookups without raw SQL, and provide a turnkey Docker Compose LAN appliance before running customer pilots.

| # | Issue | Change | Priority | Status |
|---|---:|---|:---:|---|
| 1 | [#53](https://github.com/hoanghainh1188/knot-sync/issues/53) | `enhance-pii-typed-tokens-and-allowlist` | P0 | ✅ done |
| 2 | [#54](https://github.com/hoanghainh1188/knot-sync/issues/54) | `add-mcp-document-pagination` | P0 | ⏳ planned |
| 3 | [#55](https://github.com/hoanghainh1188/knot-sync/issues/55) | `add-sql-views-and-catalog-relations` | P1 | ⏳ planned |
| 4 | [#56](https://github.com/hoanghainh1188/knot-sync/issues/56) | `add-catalog-lookup-joins` | P1 | ⏳ planned |
| 5 | [#57](https://github.com/hoanghainh1188/knot-sync/issues/57) | `add-turnkey-lan-deployment` | P2 | ⏳ planned |

### 1. enhance-pii-typed-tokens-and-allowlist (P0 — #53)

```
/opsx:propose enhance-pii-typed-tokens-and-allowlist: Enhance packages/pii-basic with typed pseudonymization tokens and an allowlist to reduce false positives on B2B data. Add optional pii.tokenFormat ("legacy" | "typed", default "typed" for hash or configurable) so masked/hashed spans preserve rule type context for AI reasoning (e.g. [PII:PERSON] or pii_person-name_<hash>). Add optional pii.allowlist (array of literal terms or prefixes) in knot-sync.config.yaml to skip known company names (e.g. 佐藤工業株式会社) and internal product/order codes during PII detection. Keep all raw PII out of SQLite and MCP responses. No new dependencies.
```

### 2. add-mcp-document-pagination (P0 — #54)

```
/opsx:propose add-mcp-document-pagination: Add optional, backward-compatible pagination and table selection parameters (offset, maxChars, tableIndex, includeTables) to the get_document MCP tool in packages/mcp-server. Include totalChars and tableCount metadata in search_documents hits and get_document headers so AI agents can inspect large PDFs and multi-sheet Excel workbooks slice-by-slice without overflowing context windows. Keep UNTRUSTED_DOCUMENT_CONTENT framing and guard flags intact on every slice. No new dependencies.
```

### 3. add-sql-views-and-catalog-relations (P1 — #55)

```
/opsx:propose add-sql-views-and-catalog-relations: Support read-only SQL Views and Materialized Views in packages/connector-sql introspection and add foreign-key relationship hints (references: "table.column") to packages/catalog and packages/ui. Auto-detect foreign keys between allow-listed tables during knot-sync describe and surface references in describe_table MCP output so AI agents can resolve master-detail relationships (e.g. juchu.TKSK_CD -> tokuisaki_mst.TKSK_CD) accurately. Maintain strict read-only session enforcement. No new dependencies.
```

### 4. add-catalog-lookup-joins (P1 — #56)

```
/opsx:propose add-catalog-lookup-joins: Allow pre-approved, human-reviewed lookup joins in knot-sync.catalog.yaml so query_table in packages/connector-sql can resolve display columns from allow-listed master tables (e.g. joining juchu.TKSK_CD to tokuisaki_mst.TKSK_CD to select/filter/group by customer name) in a single parameterized read-only query. Enforce that both tables and all referenced columns are allow-listed in config and marked reviewed: true in the catalog; never accept arbitrary JOIN syntax from MCP tool arguments. No new dependencies.
```

### 5. add-turnkey-lan-deployment (P2 — #57)

```
/opsx:propose add-turnkey-lan-deployment: Add an official non-root Dockerfile, deploy/docker-compose.lan.yml (with read-only :ro customer source mounts and optional Docling OCR / Ollama profiles), and a 3-step Enterprise Pilot Playbook (docs/PILOT_PLAYBOOK.md in EN/JA/VI) so IT admins can deploy KnotSync in shared LAN environments with a single command. No new runtime dependencies.
```

---

## v1.0 — Commercialization & Operator Governance

Target: Production-grade offline licensing for Paid plugins, read-only document/issue inspection in the local UI for PMs/IT admins, legacy binary Office support, and tagging `@hoanghainh/knot-sync@1.0.0` after pilot verification.

| # | Change | Priority | Status |
|---|---|:---:|---|
| 1 | `cryptographic-plugin-licensing` | P1 (Paid) | ✅ done |
| 2 | `expand-ui-document-explorer` | P2 | ✅ done |
| 3 | `legacy-xls-doc-conversion` | P2 | ✅ done |
| 4 | `release-v1-0-0` | P1 | ⏳ after pilot |

### 1. cryptographic-plugin-licensing (Paid P1)

```
/opsx:propose cryptographic-plugin-licensing: Upgrade Paid plugins (#1–#7) from non-empty string checks to offline Ed25519 signed license tokens verified with Node.js built-in `node:crypto` (validating licensee, allowed plugin IDs, and expiration timestamp `exp`). Keep the core package 100% license-unaware, preserve test sentinels for unit tests, and add a local keygen/signing script plus distributable Paid plugin bundle script. No new third-party dependencies.
```

### 2. expand-ui-document-explorer (P2)

```
/opsx:propose expand-ui-document-explorer: Add a read-only "Documents & Health" tab in `packages/ui` (`knot-sync ui`, loopback-only, zero CDN) so PMs and IT admins can browse extracted document titles, PII/guard badges, scan/run issues, and sanitized text snippets alongside the Semantic Catalog review screen (`en`/`ja`/`vi`). Never expose unmasked PII or write to customer sources.
```

### 3. legacy-xls-doc-conversion (P2)

```
/opsx:propose legacy-xls-doc-conversion: Support legacy binary `.xls` and `.doc` files common in Japanese and Vietnamese enterprises—either via a permissive-licensed pure-JS parser or an opt-in local conversion step—feeding extracted text/tables through the standard JA/VI cleaner, PII masker, and injection guard.
```

---

## v1.1+ (After v1.0) — Safe Write Tools & Enterprise Connectors

| # | Change | Scope | Status |
|---|---|---|---|
| 1 | `human-approved-write-tools` | Opt-in MCP action/stored-procedure tools requiring a 2-step dry-run + explicit human approval token in UI/CLI and full JSONL audit logging | ⏳ planned (After v1.0) |
| 2 | `enterprise-saas-connectors` | Read-only connectors for regional enterprise tools (SharePoint / OneDrive / Google Drive ✅ via `add-cloud-drive-connectors`; Kintone, Backlog ⏳ planned) feeding the same local JA/VI + PII + Guard pipeline | ⏳ partial (Cloud Drive ✅; Kintone/Backlog planned) |

### Paid edition (shipped capabilities)

Open-core stays Apache-2.0 and fully local. Paid work ships as **trusted plugins**
that register through the existing plugin API. All seven capabilities below are
implemented and archived; keep this table as the product inventory.

| # | Capability | What it does | Why paid / deferred |
|---|---|---|---|
| 1 | **OCR (Docling via Docker)** ✅ (`add-ocr-docling`) | Opt-in plugin `packages/extractor-ocr`: local Docker Docling for scanned PDFs/images; PDF `EMPTY` fallthrough; license self-check. Setup: `docker pull quay.io/docling-project/docling-serve-cpu:v1.38.2`, `plugins:` + `KNOT_SYNC_OCR_LICENSE`. | Heavy native/ML stack; not a Node built-in; ops burden (Docker). Free core only extracts **text-based** PDFs. |
| 2 | **方眼紙 Excel** ✅ (`add-housen-excel`) | Opt-in plugin `packages/extractor-housen`: heuristic form/grid detect + structured Markdown; CLI rewrite after office for form-like `.xlsx`. Setup: `plugins:` + `KNOT_SYNC_HOUSEN_LICENSE`. | Layout heuristics beyond normal `.xlsx` extract; called out as paid since `add-office-extraction`. |
| 3 | **SQL Server / Oracle / Access / AS400** ✅ (`add-enterprise-sql-connectors`) | Opt-in plugin `packages/connector-sql-enterprise`: `mssql` (tedious), `oracle` (`oracledb` optional), `access`/`as400` (`odbc` optional) with license self-check, env URL, allow-list, read-only intent, shared MCP `describe_table` / `query_table`. Setup: `plugins:` + `KNOT_SYNC_SQL_ENTERPRISE_LICENSE`. | Extra drivers/ODBC and enterprise packaging; free core covers Postgres + MySQL only. |
| 4 | **OAuth 2.1 + scopes** ✅ (`add-mcp-oauth`) | Opt-in plugin `packages/auth-oauth`: local AS (client credentials JWT) + optional on-prem JWKS; tool/resource scopes; `KNOT_SYNC_API_KEY` remains full-access fallback. Setup: `plugins:` + `KNOT_SYNC_OAUTH_LICENSE` + signing/client env. | Identity product, not “a transport flag”; open-core HTTP already ships with shared Bearer key. |
| 5 | **Local LLM for Semantic Catalog** ✅ (`add-catalog-llm`) | Opt-in plugin `packages/catalog-llm`: OpenAI-compatible local HTTP (Ollama/Docker); fill-empty labels/descriptions after dictionary+Excel; never auto-`reviewed`. Setup: `plugins:` + `KNOT_SYNC_CATALOG_LLM_LICENSE` + `baseUrl`/`model`. | Model runtime + quality ops; free catalog uses dictionaries + テーブル定義書 Excel only. |
| 6 | **Vector search** ✅ (`add-vector-search`) | Opt-in plugin `packages/search-vector`: local OpenAI-compatible embeddings (Ollama/Docker); SQLite + JS cosine; MCP `search_similar` + CLI `embed`; lazy fill. Setup: `plugins:` + `KNOT_SYNC_SEARCH_VECTOR_LICENSE` + `baseUrl`/`model`. | Embeddings, storage, and ranking product; free search stays SQLite FTS5 trigram. |
| 7 | **Model-based guardrails** ✅ (`add-model-guardrails`) | Opt-in plugin `packages/guard-llm`: local OpenAI-compatible chat (Ollama/Docker); document enricher after rule-based PII→guard; additive findings reuse `guard.mode` / `pii.mode`. Setup: `plugins:` + `KNOT_SYNC_GUARD_LLM_LICENSE` + `baseUrl`/`model`. | Needs model inference; free core stays deterministic rules with no network. |

**Shared paid constraints (same as open-core product rules):**

- Still **read-only** to customer sources (no silent writes).
- Prefer **on-prem / local** runtimes; no telemetry. OCR/LLM may use local Docker/models, not cloud APIs by default.
- MCP text remains **untrusted document content**, never instructions.
- Core **never** checks license keys; each paid plugin validates its own license.

Do not use unverified effectiveness numbers in marketing; `bench` produces real ones.
