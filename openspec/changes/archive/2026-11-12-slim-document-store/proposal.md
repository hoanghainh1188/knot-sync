# Proposal

## Why

Currently, `cleaner-ja-vi` stores full copies of pre-clean document text in `metadata.originalContent` (and `metadata.originalTables` for modified tables) inside every SQLite row's `metadata_json`, nearly doubling `store.sqlite` size even though FTS search, MCP tools, and `knot-sync bench` rely on cleaned `content`, `tables`, `tokensBefore`, and `tokensAfter`. Making original text retention opt-in cuts SQLite store growth roughly in half by default while preserving `tokensBefore`/`tokensAfter` metrics and optional full before/after traceability.

## What Changes

- **Add `cleaning.keepOriginalText` option (default `false`) in `packages/core`:**
  - Extend `CleaningConfig`, `CLEANING_KEYS`, `DEFAULT_CLEANING_CONFIG`, `parseCleaningConfig`, and `SAMPLE_CONFIG` with boolean `keepOriginalText` defaulting to `false` (while `nfkc`, `wareki`, `datesIso`, `legacyVietnamese`, and `tokenReduce` continue to default to `true`).
  - Keep existing TypeScript config compatibility by typing `keepOriginalText?: boolean` (resolved to `false` whenever omitted by `parseCleaningConfig` and `cleanDocument`).
- **Omit pre-clean text copies by default in `packages/cleaner-ja-vi` and `packages/cli`:**
  - When `keepOriginalText` is `false` (default), `cleanDocument` omits `metadata.originalContent` and `metadata.originalTables` (deleting any stale pre-clean copies if present on input) while continuing to compute and store `metadata.tokensBefore` and `metadata.tokensAfter`.
  - When `keepOriginalText` is `true`, `cleanDocument` retains `metadata.originalContent` and `metadata.originalTables` (when tables changed), and downstream `pii-basic` / `guard` masking/scrubbing continues to sanitize those fields before `store-sqlite` persistence.
  - Ensure `knot-sync run` cleaner-failure fallback in `packages/cli` likewise omits `originalContent` unless `cleaning.keepOriginalText` is `true` (and PII rules are disabled).

**Out of scope**

- Backfilling, vacuuming, or rewriting existing legacy rows already stored in pre-upgrade `store.sqlite` files unless a source file re-runs or `knot-sync optimize` is invoked manually.
- Removing `tokensBefore` or `tokensAfter` metadata required by `knot-sync bench`.
- External compression codecs, native SQLite extensions, or paid-edition features (`guard-llm`, `catalog-llm`, `search-vector`, `auth-oauth`, `connector-sql-enterprise`, `extractor-ocr`, `extractor-housen`).
- New third-party dependencies (none; uses only Node.js built-ins and workspace packages under Apache-2.0).

## Capabilities

### Modified Capabilities

- `config`: Add boolean `cleaning.keepOriginalText` (default `false`) to `Optional cleaning section` validation while keeping transformation steps defaulting to `true`.
- `ja-vi-cleaning`: Update `Config section cleaning` and `Original text retained` so pre-clean `originalContent` / `originalTables` copies are omitted by default (`keepOriginalText: false`) and stored only when `cleaning.keepOriginalText` is `true`, keeping `tokensBefore`/`tokensAfter` and PII/guard scrubbing intact.

## Impact

- Code: `packages/core/src/types.ts`, `packages/core/src/config.ts`, `packages/cleaner-ja-vi/src/clean.ts`, `packages/cli/src/main.ts`.
- Tests: `packages/core/src/core.test.ts`, `packages/cleaner-ja-vi/src/cleaner-ja-vi.test.ts`, `packages/cli/src/cli.test.ts`, `packages/store-sqlite/src/store.test.ts`.
- Docs: `README.md`, `packages/cli/README.md`, `packages/cleaner-ja-vi/README.md` (if present/needed), and `docs/ROADMAP.md` (`v0.4` status for `slim-document-store`).
- Dependencies: None (0 new third-party dependencies).
- Runtime / Storage: Significantly smaller `metadata_json` / `store.sqlite` footprint by default; strictly read-only on customer sources and fully local.
