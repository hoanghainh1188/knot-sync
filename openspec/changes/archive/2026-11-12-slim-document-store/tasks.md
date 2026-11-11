# Tasks

## 1. Config Schema & Sample Defaults (`packages/core`)

- [x] 1.1 Add `keepOriginalText?: boolean` to `CleaningConfig` in `packages/core/src/types.ts` and include `"keepOriginalText"` in `CLEANING_KEYS` and `keepOriginalText: false` in `DEFAULT_CLEANING_CONFIG` in `packages/core/src/config.ts`.
- [x] 1.2 Update `parseCleaningConfig` in `packages/core/src/config.ts` so `keepOriginalText` defaults to `false` when omitted, validates as a boolean (rejecting non-booleans with a clear `ConfigError`), and appears commented (`#   keepOriginalText: false`) in `SAMPLE_CONFIG`.
- [x] 1.3 Add/update `node:test` unit tests in `packages/core/src/core.test.ts` verifying `DEFAULT_CLEANING_CONFIG.keepOriginalText === false`, partial `cleaning:` overrides keeping `keepOriginalText: false`, explicit `keepOriginalText: true`, and rejection of non-boolean `cleaning.keepOriginalText` values.

## 2. Conditional Original Text Retention (`packages/cleaner-ja-vi`)

- [x] 2.1 Update `cleanDocument` in `packages/cleaner-ja-vi/src/clean.ts` to omit `metadata.originalContent` and `metadata.originalTables` (and strip any stale `originalContent`/`originalTables` inherited on input metadata) when `settings.keepOriginalText` is falsy, while retaining them when `settings.keepOriginalText === true` and always keeping `metadata.tokensBefore` and `metadata.tokensAfter`.
- [x] 2.2 Update existing default-config assertions and add `node:test` tests in `packages/cleaner-ja-vi/src/cleaner-ja-vi.test.ts` covering both default (`keepOriginalText: false` omits `originalContent`/`originalTables` while keeping `tokensBefore`/`tokensAfter` for JA/VN text and tables) and opt-in `keepOriginalText: true`.

## 3. CLI Error Fallback & End-to-End Store Integration (`packages/cli`)

- [x] 3.1 Update the cleaner-failure fallback in `packages/cli/src/main.ts` so `originalContent` is attached (when `host.piiRules.size === 0`) only when `structural.cleaning.keepOriginalText === true`.
- [x] 3.2 Update/add `node:test` tests in `packages/cli/src/cli.test.ts` verifying that `knot-sync run` on Japanese/Vietnamese documents leaves `metadata.originalContent` and `metadata.originalTables` undefined under default config while keeping `tokensBefore`/`tokensAfter` (and `knot-sync bench` compatibility), persists PII-masked `originalContent` when `cleaning.keepOriginalText: true`, and produces smaller `metadata_json` rows in SQLite under the default setting.

## 4. Documentation & Full Verification

- [x] 4.1 Document `cleaning.keepOriginalText` (default `false`) in `README.md`, `packages/cli/README.md`, and `packages/cleaner-ja-vi/README.md`, and update `slim-document-store` status to `✅ done` in `docs/ROADMAP.md`.
- [x] 4.2 Run workspace build and full `node:test` suite (`pnpm build && pnpm test`) and verify all tests pass with zero failures.

## Workflow follow-up

- After implementation and verification complete, run `/opsx-archive` to archive `slim-document-store` and sync the delta specs into `openspec/specs/config/spec.md` and `openspec/specs/ja-vi-cleaning/spec.md`.
