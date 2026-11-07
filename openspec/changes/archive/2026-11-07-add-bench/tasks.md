# Tasks

## 1. Bench suite model and token report

- [x] 1.1 Define suite YAML types + loader (search + catalog cases); default path beside config; actionable errors for bad YAML — verify unit tests with JP/VN case fixtures
- [x] 1.2 Implement token aggregation from document metadata (`tokensBefore`/`tokensAfter`) with skip counts — verify test where cleaned JP doc contributes before ≥ after

## 2. Suite runners

- [x] 2.1 Run search cases against the store search API; score `documentId` / `titleContains` / `pathContains` — verify Vietnamese query case passes and missing expect fails
- [x] 2.2 Run catalog resolve cases before (no catalog) vs after (with catalog) — verify `得意先コード` → `TKSK_CD` passes only in after when catalog present

## 3. CLI `bench` command

- [x] 3.1 Wire `knot-sync bench` (`-c`, `--json`, `--suite`, `--lang`); human + JSON output; help lists `bench`; empty store exits 1 with guidance — verify CLI tests
- [x] 3.2 Add i18n strings for bench summary in en/ja/vi — verify `--lang ja` localizes chrome but JSON keys stay English

## 4. Docs and verification

- [x] 4.1 Document `bench` + suite format in README and briefly in `docs/ja` / `docs/vi`; add example suite under `examples/` if useful — verify README mentions `bench`
- [x] 4.2 Mark `add-bench` under v0.2 in `docs/ROADMAP.md` — verify status
- [x] 4.3 Run full `pnpm test` — verify all packages pass

## Workflow follow-up

- Archive the change after review (`/opsx:archive add-bench`).
- v0.2 roadmap slice complete after archive.
