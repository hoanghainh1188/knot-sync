# KnotSync

> Scan, clean and serve legacy enterprise data to AI agents via the
> [Model Context Protocol (MCP)](https://modelcontextprotocol.io).

**Status: pre-alpha.** `init`, `scan`, `run`, `describe`, `plugins` and `serve` work today.

- Runs **fully on your own machine**. Nothing is sent to the Internet.
- Sources are **read-only**. The tool never changes your files or databases.
- Built for **Japanese and Vietnamese** legacy data (和暦, 全角/半角, TCVN3/VNI fonts…).
- Extensible via **plugins** (connectors, extractors, cleaners, rules…). Plugins run
  in-process with full trust — install only modules you trust. Paid plugins check
  their own license keys; the core never does.

## Quick start

Requires Node.js 22.13 or newer.

```bash
npx @hoanghainh/knot-sync init --path /path/to/shared/folder
npx @hoanghainh/knot-sync scan
npx @hoanghainh/knot-sync run
npx @hoanghainh/knot-sync describe   # SQL sources: build Semantic Catalog
npx @hoanghainh/knot-sync plugins
npx @hoanghainh/knot-sync serve
```

`run` extracts text and tables from the last scan (`.xlsx`, `.docx`, text PDF,
`.csv`/`.tsv`, `.txt`, `.md`) into the local document store, then applies the
built-in JP/VN cleaner (`cleaner-ja-vi`: NFKC, wareki→Gregorian, ISO dates,
TCVN3/VNI, token reduction). Original text and rough token counts are kept in
document metadata. Toggle steps under config `cleaning:` (all enabled by
default). Then built-in PII rules mask emails, JP/VN phones, CCCD, My Number,
and card numbers (`pii.mode`: `mask` | `hash` | `drop`); findings are stored
without raw values. `scan --pii` estimates how many small text files look like
they contain PII without storing matches. After PII, the built-in guard
(`guard.mode`: `flag` | `strip` | `block`) detects instruction-like phrases
(EN/JP/VN), zero-width/bidi controls, and extractor-exposed hidden text; risk
and spans are stored on `Document.guard`. Unchanged files (same content hash)
are skipped. Unsupported or broken files are reported as issues; the run
continues.

Example output:

```
■ Source "sample": 8 files, 59 B

  By type:
    xlsx   4   36 B
    ...
  Health:
    Duplicate copies     2   16 B wasted
    Older than 5 years   1
    Empty files          1
    Unreadable           0

  Biggest duplicates:
    8 B × 3
      - 営業/見積書 (1).xlsx
      - 営業/見積書.xlsx
      - 営業/見積書_最新_本当に最新.xlsx
```

Use `scan --json` for machine-readable output. Use `scan --report [file]` to write
one self-contained HTML health report (offline, light/dark, EN/日本語/Tiếng Việt
labels). Default path: `./knot-sync-scan-report.html` (never inside a source folder).

## MCP server (`serve`)

`knot-sync serve` speaks MCP over **stdio only** (no HTTP, no network). It is
read-only: tools never change sources or the store. Document text is always
framed as untrusted data. Tool calls are appended to a JSONL audit log
(`server.audit_log`, default beside the store as `mcp-audit.jsonl`).

| Surface | What it does |
|---|---|
| Resource `knot://sources` | List configured source ids/types |
| Resource `knot://docs/{source}/{doc_id}` | Fetch one stored document |
| Resource `knot://db/{source}/{table}/schema` | Allow-listed SQL table schema |
| Tool `search_documents` | Keyword search (`query`, optional `source` / `type` / `limit`) |
| Tool `get_document` | Fetch by document id |
| Tool `describe_table` | Describe allow-listed SQL columns |
| Tool `query_table` | Parameterized filters on allow-listed columns (no free SQL) |
| Config `prompts:` | Optional MCP prompts (name, description, arguments, template) |

### Register in Claude Desktop

Add to `claude_desktop_config.json` (adjust the config path):

```json
{
  "mcpServers": {
    "knot-sync": {
      "command": "npx",
      "args": ["@hoanghainh/knot-sync", "serve", "-c", "/absolute/path/to/knot-sync.config.yaml"]
    }
  }
}
```

### Register in Claude Code / Cursor

Point the MCP server entry at the same command (stdio). Example Cursor
`.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "knot-sync": {
      "command": "npx",
      "args": ["@hoanghainh/knot-sync", "serve", "-c", "/absolute/path/to/knot-sync.config.yaml"]
    }
  }
}
```

Run `scan` then `run` before `serve` so the store has documents to search.

## SQL sources (PostgreSQL / MySQL)

Built-in connectors `postgres` and `mysql` connect **read-only**. The database
URL must come from an environment variable (`url: env:NAME`) — never store a
plaintext URL in the config file. Only tables/columns listed under `allow:` are
visible to `scan` and MCP.

```yaml
sources:
  - id: erp
    type: postgres
    url: env:KNOT_PG_URL
    allow:
      受注:
        columns: [受注番号, 得意先名, 金額]
      hoa_don:
        columns: [ma_kh, so_tien]
```

```bash
export KNOT_PG_URL='postgres://readonly_user@127.0.0.1:5432/erp'
npx @hoanghainh/knot-sync scan -c knot-sync.config.yaml
```

`scan` inventories each allow-listed table (row estimates when available). MCP
`query_table` supports filters `eq` / `in` / `range` / `contains` with a max of
200 rows (default 50). Cell values are framed as untrusted content.

## Semantic Catalog (`describe`)

For SQL sources, `knot-sync describe` writes `knot-sync.catalog.yaml` (path
overridable via `catalog.path`) with business labels (ja/vi/en), descriptions,
types, sampled distinct values, PII/expose flags, and a `reviewed` flag.

Inputs (all local, read-only):

- DB introspection of allow-listed tables/columns
- Bounded distinct sampling
- Built-in romaji (e.g. `TKSK_CD` → 得意先コード) and Vietnamese abbreviations
  (e.g. `ma_kh` → mã khách hàng)
- Optional customer dictionary (`catalog.dictionary`)
- Optional テーブル定義書 / 項目定義書 Excel (`catalog.definition_excel` +
  `catalog.definition_mapping`)

Re-running `describe` **never overwrites** entries with `reviewed: true`.

When the catalog file exists, `serve` loads it so `describe_table` / schema
resources show business labels, and `query_table` accepts unique business-name
filter columns and validates `eq`/`in` against catalog `values` when set.

```yaml
catalog:
  path: ./knot-sync.catalog.yaml
  # dictionary: ./customer-dict.yaml
  # definition_excel: ./defs/項目定義.xlsx
```

```yaml
# knot-sync.catalog.yaml (excerpt)
version: 1
sources:
  erp:
    tables:
      受注:
        columns:
          TKSK_CD:
            label: { ja: "得意先コード", vi: "", en: "customer code" }
            values: []
            reviewed: false
```

## Roadmap

KnotSync is a **semantic layer for legacy data**: it does not only clean files, it explains
cryptic fields (`TKSK_CD`, `ma_kh`…) so AI agents call tools correctly.

- ✅ Foundation: folder source, SQLite store, `init`, `scan`
- ✅ Plugin system (`plugins` command, built-in `fs` connector plugin)
- ✅ Office extraction (`run`, built-in `extractor-office` plugin)
- ✅ JP/VN cleaning (`cleaner-ja-vi`, config `cleaning:`)
- ✅ PII masking (`pii-basic`, config `pii:`, `scan --pii`)
- ✅ Prompt-injection guard (`guard`, config `guard:`)
- ✅ HTML scan report (`scan --report`, `report-html`)
- ✅ MCP server (`serve`, stdio, `mcp-server`)
- ✅ PostgreSQL / MySQL (`connector-sql`, allow-list, `query_table`)
- ✅ Semantic Catalog (`describe`, `catalog` package, MCP business names/enums)

Details and order: [docs/ROADMAP.md](./docs/ROADMAP.md). Development uses
[OpenSpec](https://github.com/Fission-AI/OpenSpec): specs live in `openspec/specs/`.

## Development

```bash
corepack enable          # gives you pnpm
pnpm install
pnpm test                # build + run all tests
pnpm scan:sample         # scan examples/sample-data
```

Packages:

| Package | Purpose |
|---|---|
| `packages/core` | Types (`Document`, `FileEntry`), config loader, plugin host API |
| `packages/connector-fs` | Built-in `fs` connector plugin (read-only folder walker) |
| `packages/connector-sql` | Built-in `postgres` / `mysql` connectors (env URL, allow-list) |
| `packages/extractor-office` | Built-in extractor for Office/text files (`run`) |
| `packages/cleaner-ja-vi` | Built-in JP/VN text cleaner (NFKC, wareki, ISO dates, TCVN3/VNI, token reduce) |
| `packages/pii-basic` | Built-in PII detection/masking (email, phones, CCCD, My Number, Luhn) |
| `packages/guard` | Built-in prompt-injection guard (EN/JP/VN phrases, controls, hidden text) |
| `packages/report-html` | Self-contained HTML scan health report (`scan --report`) |
| `packages/catalog` | Semantic Catalog YAML, dictionaries, Excel defs, `describe` helpers |
| `packages/mcp-server` | Stdio MCP server (resources, search/get tools, audit log) |
| `packages/store-sqlite` | `node:sqlite` store, FTS5 trigram search (works for 日本語 / Tiếng Việt) |
| `packages/cli` | `knot-sync` command |

Extra plugins are listed under `plugins:` in the config (npm package name or path
relative to the config file). Example: `examples/plugins/mask-company-id.mjs`.

Design notes:

- **No native dependencies.** Storage uses the built-in `node:sqlite`, so `npx` installs fast and works offline-friendly.
- **Few dependencies on purpose** (`yaml`; MCP adds `@modelcontextprotocol/sdk` + `zod`; SQL adds `pg` + `mysql2`; catalog/Excel reuse `exceljs` — all MIT). Less supply-chain risk for enterprise users.
- Search terms shorter than 3 characters (e.g. `請求`) fall back to `LIKE`, because trigram FTS needs 3+ characters.
- **Plugins are never auto-discovered** — only built-ins plus entries in `plugins:`.

---

## 日本語

社内に散らばった古いデータ（Excel、Word、PDF、紙の書類、古いDB）を整理し、MCP 経由で AI エージェントに安全に渡すためのツールです。
すべて自社のマシン内で動き、データは外部に送信されません。元データは読み取りのみで、変更しません。

## Tiếng Việt

Công cụ dọn dẹp dữ liệu cũ nằm rải rác trong công ty (Excel, Word, PDF, giấy tờ scan, database cũ), rồi đưa cho AI Agent qua MCP một cách an toàn.
Mọi thứ chạy trên máy của bạn, không gửi dữ liệu ra ngoài. Dữ liệu gốc chỉ được đọc, không bị sửa.

## License

[Apache-2.0](./LICENSE)
