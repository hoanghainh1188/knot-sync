# @hoanghainh/knot-sync-cleaner-ja-vi

Built-in JP/VN text cleaner plugin for KnotSync.

## Configuration (`cleaning:`)

- `nfkc`, `wareki`, `datesIso`, `legacyVietnamese`, `tokenReduce` — normalization toggles (all `true` by default).
- `keepOriginalText` — retain pre-clean `originalContent` and `originalTables` in document metadata (`false` by default to reduce SQLite store size; `tokensBefore` and `tokensAfter` are always recorded, and retained originals remain PII-masked and guard-scrubbed).

Part of [KnotSync](https://github.com/hoanghainh1188/knot-sync). See the
repository root README for install and usage.

**License:** Apache-2.0  
**Version:** 0.1.1
