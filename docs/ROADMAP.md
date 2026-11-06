# KnotSync roadmap

Positioning: **a semantic layer for legacy data.** Cleaning is preparation; the
Semantic Catalog (business names, descriptions, valid values for cryptic fields
like `TKSK_CD` or `ma_kh`) is the core value.

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
document (risk level + flagged spans). Paid edition will add model-based guardrails; out of scope.
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

v0.1.0 metadata, per-package README/LICENSE, CHANGELOG, `docs/ja` + `docs/vi`,
CI matrix (Node 22/24 × Linux/macOS/Windows), license gate, tag publish with
npm provenance. After merge: tag `v0.1.0` when ready, then
`npx @hoanghainh/knot-sync@0.1.0 --version`.

## Later

| Version | Scope |
|---|---|
| v0.2 | Web UI (`knot-sync ui`, React, bundled in the npm package, 127.0.0.1 by default) with Semantic Catalog review screen; `knot-sync bench` (tokens and tool-call accuracy before/after, on the customer's own data); CLI messages in ja/vi |
| v0.3 | System logs (app log files of legacy systems), resource subscriptions |
| Paid | OCR (Docling via Docker), 方眼紙 Excel, SQL Server / Oracle / Access / AS400, HTTP + OAuth 2.1 + scopes, local LLM for catalog, vector search, model-based guardrails |
| After v1.0 | Write tools / stored procedures, always with human approval |

Do not use unverified effectiveness numbers in marketing; `bench` produces real ones.
