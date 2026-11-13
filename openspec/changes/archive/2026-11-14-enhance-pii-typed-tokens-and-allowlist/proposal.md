# Proposal

## Why

When AI agents analyze redacted enterprise documents or tables via MCP, current PII redaction tokens lose semantic entity context (`***` in `mask` mode and untyped `pii_<hash>` in `hash` mode), preventing agents from distinguishing whether a redacted span was a person's name, phone number, national ID, or tax code—and in `mask` mode preventing correlation across occurrences. Additionally, deterministic JP/VN heuristics (`person-name`, `cccd`, `bank-account`) can trigger false positives on B2B company names containing common surnames (e.g. `佐藤工業株式会社`, `Công ty TNHH Nguyễn Hoàng`) or internal order/product codes with 10–12 digit runs.

## What Changes

- Add optional `pii.tokenFormat` (`"legacy"` | `"typed"`) to `knot-sync.config.yaml` and `PiiConfig` in `@hoanghainh/knot-sync-core`:
  - In `hash` mode, include the normalized rule identifier in replacement tokens (`pii_<rule>_<16-char-hmac>`, e.g. `pii_person-name_a8f2...`) by default (when `tokenFormat` is `"typed"` or omitted; `"legacy"` preserves `pii_<16-char-hmac>`).
  - In `mask` mode, when `tokenFormat: "typed"` is configured, emit rule-tagged placeholders (`[PII:PERSON_NAME]`, `[PII:EMAIL]`, `[PII:MY_NUMBER]`, `[PII:CCCD]`, `[PII:MST_VN]`, `[PII:PHONE_JP]`, `[PII:PHONE_VN]`, `[PII:BANK_ACCOUNT]`, while keeping last-4 credit card masking `****-****-****-1234`); when `tokenFormat` is omitted or `"legacy"`, preserve `***` for backward compatibility.
- Add optional `pii.allowlist` (`string[]`) to `knot-sync.config.yaml` and `PiiConfig`:
  - Suppresses PII findings whose span falls within or immediately follows a configured allowlist phrase/prefix in the text (case-insensitive), preventing false positives on known B2B company names (e.g. `佐藤工業株式会社`) and internal document/order code prefixes (e.g. `ORD-`, `LOT-`).
  - Applies consistently across `run` (`applyPiiToDocument` on content, tables, and metadata), `scan --pii` (`textHasPii`), and `guard-llm` PII enrichment (`applyModeToText`).
- **Out of scope**:
  - Automatic LLM-based entity disambiguation (covered by paid `packages/guard-llm`).
  - Reversible encryption or unmasking tools in MCP (raw PII is never stored in SQLite or exposed to MCP).
  - No new third-party dependencies (uses Node.js built-ins only).

## Capabilities

### New Capabilities
<!-- None -->

### Modified Capabilities
- `config`: Allow optional `tokenFormat` (`"legacy"` | `"typed"`) and `allowlist` (non-empty string array) under `pii:` in `knot-sync.config.yaml` with strict validation.
- `pii-masking`: Support typed redaction/hash tokens (`[PII:<RULE>]` and `pii_<rule>_<hash>`) and filter out spans matching `pii.allowlist` phrases or prefixes during detection and `scan --pii`.

## Impact

- **`packages/core`**: Extend `PiiConfig` (`tokenFormat?: PiiTokenFormat`, `allowlist?: string[]`) and `parsePiiConfig()` validation.
- **`packages/pii-basic`**: Update `collectFindings()`, `textHasPii()`, `applyModeToText()`, and `applyPiiToDocument()` to respect `allowlist` and `tokenFormat`.
- **`packages/guard-llm`**: Pass `ctx.pii.tokenFormat` to `applyModeToText()` when applying model-detected PII spans.
- **`packages/cli`**: Pass `config.pii.allowlist` into `textHasPii()` during `knot-sync scan --pii`.
- **Dependencies**: None added (zero third-party runtime dependencies added; Apache-2.0 compatible).
