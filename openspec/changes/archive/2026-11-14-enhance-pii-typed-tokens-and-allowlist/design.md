# Design

## Context

See `proposal.md` for motivation and scope, and `specs/config/spec.md` and `specs/pii-masking/spec.md` for normative requirements.

`packages/pii-basic` currently runs deterministic rules (`ALL_RULES`) during `knot-sync run` and `knot-sync scan --pii`, transforming matched spans in `applyModeToText()` before any document reaches the SQLite store or MCP tools. Paid plugin `packages/guard-llm` also calls `applyModeToText()` when applying model-discovered PII findings.

**Read-only and fully-local guarantees**:
- All allowlist matching and token formatting happen purely in-memory on extracted document strings using Node.js built-ins (`node:crypto` HMAC-SHA256 for `hash` mode).
- Configured customer folders and SQL sources are never written to, moved, or modified.
- Zero network calls or external APIs are invoked; raw PII substrings are still never persisted in SQLite, metadata, or logs.

## Goals / Non-Goals

**Goals:**
- Provide semantic rule tags on redacted tokens (`[PII:<RULE_UPPER>]` in `mask` mode when `tokenFormat: "typed"`, and `pii_<rule>_<16-char-hmac>` in `hash` mode by default) while keeping existing default `mask` output (`***`) 100% backward-compatible.
- Suppress false-positive PII spans inside or immediately after configured `pii.allowlist` terms across document content, tables, metadata originals, and `scan --pii` sampling.

**Non-Goals:**
- Regex compilation of arbitrary user patterns in `allowlist` (to avoid ReDoS risks; `allowlist` entries are matched as case-insensitive literal phrases or prefixes).
- Reversible token vaults or unmasking endpoints.

## Decisions

1. **Default `tokenFormat` per mode (`mask` vs `hash`)**:
   - **Decision**: Add `tokenFormat?: "legacy" | "typed"` to `PiiConfig`. When `tokenFormat` is omitted:
     - `mask` mode defaults to `"legacy"` (`***`, and `****-****-****-1234` for `credit-card`) so existing CLI/test assertions and documentation examples remain unchanged unless the user opts into `tokenFormat: "typed"`.
     - `hash` mode defaults to `"typed"` (`pii_<rule>_<16-char-hmac>`, where `<rule>` is normalized to lowercase `[a-z0-9_-]+`, e.g. `pii_email_...`, `pii_person-name_...`), and supports `tokenFormat: "legacy"` (`pii_<16-char-hmac>`) for strict legacy compatibility.
   - **Rationale**: In `hash` mode, prefixing the rule id after `pii_` still matches `/pii_/` while giving AI agents entity-type disambiguation out of the box. In `mask` mode, explicit opt-in `tokenFormat: "typed"` produces `[PII:PERSON_NAME]`, `[PII:CCCD]`, etc. without breaking callers expecting `***`.

2. **Phrase + Prefix Interval Suppression for `pii.allowlist`**:
   - **Decision**: Implement `isSpanAllowlisted(text, span, allowlist)` inside `packages/pii-basic/src/apply.ts` and apply it inside `collectFindings(text, rules, allowlist)`:
     - Normalize `text` and non-empty trimmed `allowlist` entries with `.toLowerCase()` (after NFC/NFKC or direct lowercase index matching).
     - A candidate span `[start, end]` is suppressed if:
       1. **Phrase containment / overlap**: An occurrence of an allowlist entry `[aStart, aEnd]` in `text` covers the span (`start >= aStart && end <= aEnd`) or equals the span. This handles cases like `氏名: 佐藤工業株式会社` where the `person-name` rule matches only `佐藤` (`[4, 6]`), which is inside the allowlisted phrase `佐藤工業株式会社` (`[4, 12]`).
       2. **Prefix adjacency**: The text immediately preceding `span.start` ends with an allowlist entry (`text.slice(0, span.start).toLowerCase().endsWith(entryLower)`), or the span itself starts with `entryLower`. This handles code prefixes like `allowlist: ["ORD-"]` on `Mã đơn: ORD-079123456789` where `cccd` matches `079123456789` right after `ORD-`.
   - **Alternatives considered**:
     - *Exact substring match (`text.slice(start, end) === entry`)*: Rejected because `person-name` only matches the surname/given-name tokens (`佐藤`), not the trailing `工業株式会社`, and `cccd` only matches the 12 digits (`079123456789`), not the `ORD-` prefix.
     - *User-supplied regular expressions*: Rejected to eliminate catastrophic backtracking (ReDoS) on large extracted documents.

## Risks / Trade-offs

- **[Risk] Overly broad allowlist entry (e.g. a 1-character string) could suppress legitimate PII** → Mitigation: Reject empty/whitespace-only strings in `parsePiiConfig`, and document in starter config comments that `allowlist` entries should be specific company names (e.g. `佐藤工業株式会社`) or code prefixes (e.g. `ORD-`).
- **[Risk] Case-conversion index drift on rare Unicode ligatures** → Mitigation: Perform case-insensitive search character-by-character or ensure lowercase length matches slice length when scanning for allowlist occurrences.
