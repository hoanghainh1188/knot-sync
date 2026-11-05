# KnotSync

> Scan, clean and serve legacy enterprise data to AI agents via the
> [Model Context Protocol (MCP)](https://modelcontextprotocol.io).

**Status: pre-alpha.** `init`, `scan` and `plugins` work today.

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
npx @hoanghainh/knot-sync plugins
```

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

Use `scan --json` for machine-readable output.

## Roadmap

KnotSync is a **semantic layer for legacy data**: it does not only clean files, it explains
cryptic fields (`TKSK_CD`, `ma_kh`…) so AI agents call tools correctly.

- ✅ Foundation: folder source, SQLite store, `init`, `scan`
- ✅ Plugin system (`plugins` command, built-in `fs` connector plugin)
- ⏳ Office extraction, JP/VN cleaning, PII masking, prompt-injection guard
- ⏳ `scan --report` (one-file HTML), MCP server (`serve`), PostgreSQL / MySQL
- ⏳ Semantic Catalog (`describe`, reads テーブル定義書)

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
| `packages/store-sqlite` | `node:sqlite` store, FTS5 trigram search (works for 日本語 / Tiếng Việt) |
| `packages/cli` | `knot-sync` command |

Extra plugins are listed under `plugins:` in the config (npm package name or path
relative to the config file). Example: `examples/plugins/mask-company-id.mjs`.

Design notes:

- **No native dependencies.** Storage uses the built-in `node:sqlite`, so `npx` installs fast and works offline-friendly.
- **Few dependencies on purpose** (only `yaml` today). Less supply-chain risk for enterprise users.
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
