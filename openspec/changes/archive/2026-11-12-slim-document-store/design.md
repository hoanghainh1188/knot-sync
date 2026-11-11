# Design

## Context

`packages/cleaner-ja-vi` runs in-memory on extracted `Document` objects before `pii-basic`, `guard`, and `Store.upsertDocuments` in `packages/cli` (`knot-sync run`). Today `cleanDocument` always assigns `metadata.originalContent` and `metadata.originalTables` alongside `tokensBefore` and `tokensAfter`, doubling text storage inside `store.sqlite`. See `proposal.md` for motivation.

## Goals / Non-Goals

**Goals:**
- Default `cleaning.keepOriginalText` to `false` in `core` config parsing, `cleaner-ja-vi`, and `cli` error fallbacks so `store.sqlite` omits `metadata.originalContent` and `metadata.originalTables` by default.
- Preserve `tokensBefore`, `tokensAfter`, FTS searchability, and `knot-sync bench` compatibility with zero changes to bench schemas.
- Support opt-in `cleaning.keepOriginalText: true` with existing PII masking (`pii-basic`) and prompt-injection stripping (`guard`).

**Non-Goals:**
- Rewriting or vacuuming pre-existing rows in old SQLite databases when unmodified files are skipped.
- Adding compression codecs or native SQLite dependencies.

## Decisions

### 1. Backward-compatible `CleaningConfig` extension
- **`keepOriginalText?: boolean` on `CleaningConfig`**:
  - Making `keepOriginalText` optional on the TypeScript interface preserves compatibility for programmatic/test callers constructing 5-field `CleaningConfig` literals, while `DEFAULT_CLEANING_CONFIG` and `parseCleaningConfig` explicitly materialize `keepOriginalText: false` (or `true` when configured).
  - `CLEANING_KEYS` and `SAMPLE_CONFIG` in `packages/core/src/config.ts` include `keepOriginalText` so YAML validation continues to reject unknown keys and non-boolean values cleanly.

### 2. Gating both `originalContent` and `originalTables`
- In `cleanDocument` (`packages/cleaner-ja-vi/src/clean.ts`):
  - Compute `tokensBefore` from in-memory pre-clean text (`originalContent` + `originalTables`) and `tokensAfter` after cleaning as today — neither field requires persisting raw text copies.
  - Only assign `metadata.originalContent` and `metadata.originalTables` when `Boolean(settings.keepOriginalText)` is `true`. When `false`, delete `metadata.originalContent` and `metadata.originalTables` from the cloned metadata object so stale pre-clean copies never leak into `metadata_json`.
  - Alternative considered: filtering `metadata.originalContent` inside `Store.upsertDocuments`. Rejected as the sole mechanism because `Store` does not receive `CleaningConfig` and must persist `originalContent` whenever operators explicitly opt in with `keepOriginalText: true`. Performing the gating inside `cleaner-ja-vi` and `cli` naturally shrinks every row written to `store-sqlite` without coupling `store-sqlite` to `CleaningConfig`.

### 3. CLI cleaner-failure fallback alignment
- In `packages/cli/src/main.ts`, when a cleaner throws and `host.piiRules.size === 0`, attach `originalContent` only if `structural.cleaning.keepOriginalText` is `true` so failure rows respect the same slim-store preference.

### 4. Read-only & fully-local guarantees
- All normalization, token estimation, and metadata gating run strictly in-memory inside local Node.js processes against already-extracted document copies. Customer source directories/databases are never written to, moved, or modified, and no network calls or telemetry occur.

## Risks / Trade-offs

- **Loss of pre-clean diffing when `keepOriginalText: false` (default)** → Expected trade-off for ~50% smaller `store.sqlite`; operators needing raw traceability can set `cleaning.keepOriginalText: true` in config and re-run `knot-sync run`.
- **Existing tests expecting `originalContent` by default** → Update default cleaner/CLI tests to assert omitted `originalContent` under default config alongside new opt-in `keepOriginalText: true` tests (covering PII masking + `originalTables`).
