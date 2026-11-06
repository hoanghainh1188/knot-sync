# Proposal

## Why

Document text that reaches agents can carry indirect prompt-injection
(instruction-like phrases, invisible Unicode, and hidden Office runs). Before
MCP, KnotSync must detect that risk, record findings, and optionally strip or
block content so agents never treat document text as instructions.

## What Changes

- New package `packages/guard` (`@hoanghainh/knot-sync-guard`): built-in
  `guard-rule` plugin applied by `knot-sync run` after PII masking and before
  upsert.
- Detection rules (each a `guard-rule` id), covering at least:
  - Instruction-like phrases in English, Japanese, and Vietnamese
    (e.g. “ignore previous instructions”, 「以前の指示を無視」,
    “bỏ qua hướng dẫn trước”)
  - Zero-width and bidi control characters
  - Hidden text when the extractor exposes it (white/hidden Excel/Word runs
    surfaced into document metadata for the guard to scan)
- Config `guard.mode`: `flag` (keep content, record risk + spans), `strip`
  (remove or neutralize flagged spans / controls), `block` (do not upsert
  ready content; store an error/blocked document with an actionable message).
- Results saved per document: risk level plus flagged spans (rule + offsets in
  the pre-transform text). Span text itself is not required in the store.
- Widen core `GuardRule` from stub to an executable `find` contract; register
  the built-in with CLI plugins.
- **No new third-party dependencies.**

### Out of scope

- Model-based / LLM guardrails (paid edition).
- Framing document text as untrusted in MCP tool results (`add-mcp-server`).
- HTML scan-report chrome for guard stats (`add-html-scan-report`).
- Full OCR or image steganography detection.
- Guaranteeing discovery of every Office “hidden” style; only what the
  extractor can expose without new native deps.

## Capabilities

### New Capabilities

- `injection-guard`: detect indirect prompt injection on `run`, apply
  `guard.mode`, persist risk + span findings without treating document text as
  instructions.

### Modified Capabilities

- `document-extraction`: `run` applies registered guard rules after PII.
- `plugin-system`: `GuardRule` registrations are executable (not stubs).
- `config`: optional `guard:` section (`mode` and related settings).

## Impact

- **Code:** `guard` package; core types/plugin/`GuardConfig` and `Document.guard`
  (parallel to `pii`); CLI `run` pipeline; optional extractor metadata for
  hidden text; SQLite store persists guard findings JSON.
- **Deps:** none new.
- **Docs:** README and `docs/ROADMAP.md`.
