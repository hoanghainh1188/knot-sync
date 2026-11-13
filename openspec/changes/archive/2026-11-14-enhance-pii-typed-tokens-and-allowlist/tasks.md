# Tasks

## 1. Core `PiiConfig` Schema & Validation (`packages/core`)

- [x] 1.1 Add `PiiTokenFormat = "legacy" | "typed"` and optional `tokenFormat?: PiiTokenFormat` and `allowlist?: string[]` fields to `PiiConfig` in `packages/core/src/types.ts` (and export `PiiTokenFormat` from `packages/core/src/index.ts`), verifying `pnpm build` succeeds.
- [x] 1.2 Update `PII_KEYS` and `parsePiiConfig()` in `packages/core/src/config.ts` to validate `tokenFormat` (`"legacy"` | `"typed"`) and `allowlist` (array of non-empty trimmed strings), rejecting unknown keys or invalid values with a clear `ConfigError`.
- [x] 1.3 Add unit tests in `packages/core/src/core.test.ts` covering valid/invalid `pii.tokenFormat` and `pii.allowlist` configs, and verify with `pnpm test`.

## 2. Typed Token Formatting & Allowlist Suppression (`packages/pii-basic`)

- [x] 2.1 Update `collectFindings()` and `textHasPii()` in `packages/pii-basic/src/apply.ts` to accept an optional `allowlist?: readonly string[]` and suppress spans that fall within an allowlisted phrase occurrence in the text or immediately follow an allowlisted prefix (case-insensitively).
- [x] 2.2 Update `applyModeToText()`, `maskTables()`, `scrubMetadataPii()`, and `applyPiiToDocument()` in `packages/pii-basic/src/apply.ts` to support `tokenFormat` (`[PII:<RULE_UPPER>]` for `mask` when `tokenFormat === "typed"`, `***` for `mask` when omitted/`"legacy"`, `pii_<rule>_<16-char-hmac>` for `hash` by default/`"typed"`, and `pii_<16-char-hmac>` for `hash` when `"legacy"`), passing `config.allowlist` and `config.tokenFormat` through all document, table, and metadata redaction paths.
- [x] 2.3 Add `node:test` unit tests in `packages/pii-basic/src/pii-basic.test.ts` covering typed `mask` tokens (`[PII:PERSON_NAME]`, `[PII:CCCD]`), typed vs legacy `hash` tokens (`pii_email_<hash>`), Japanese company name allowlist suppression (`佐藤工業株式会社`), and Vietnamese order prefix allowlist suppression (`ORD-079123456789`), verifying with `pnpm test`.

## 3. CLI `scan --pii`, `guard-llm` Integration & Documentation

- [x] 3.1 Pass `config.pii.allowlist` to `textHasPii()` during `knot-sync scan --pii` in `packages/cli/src/main.ts` and pass `ctx.pii.tokenFormat` to `applyModeToText()` in `packages/guard-llm/src/enricher.ts`, verifying with `pnpm build`.
- [x] 3.2 Add integration tests in `packages/cli/src/cli.test.ts` and `packages/guard-llm/src/guard-llm.test.ts` verifying `scan --pii` respects `pii.allowlist` and `guard-llm` respects `pii.tokenFormat`, and run `pnpm test`.
- [x] 3.3 Update `README.md` (and `docs/ja/README.md`, `docs/vi/README.md`) to document `pii.tokenFormat` and `pii.allowlist`, mark `enhance-pii-typed-tokens-and-allowlist` as `✅ done` in `docs/ROADMAP.md`, and verify the full test suite passes with `pnpm test`.

## Workflow follow-up

- Archive the change with `/opsx:archive enhance-pii-typed-tokens-and-allowlist` after verification.
- Close GitHub Issue #53 once merged/committed.
