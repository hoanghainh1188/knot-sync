# Proposal

## Why

Regional compliance for Japan/Vietnam customers needs broader PII coverage
(tax IDs, bank accounts, personal names) and stronger prompt-injection heuristics
than the v0.1 rule set. Production readiness (v0.3 P2) calls for these
open-core enhancements before `scale-sqlite-store`.

## What Changes

- Extend built-in `pii-basic` rules with Vietnamese MST (tax code: 10-digit
  enterprise and 13-digit branch), bank-account heuristics (digit runs with
  common label/prefix cues), and curated JP/VN personal-name heuristics
- Extend built-in `guard` rules with suspicious Base64 payload detection,
  markdown image/link exfiltration patterns, and zero-width / control-character
  flood detection (dense control runs beyond isolated ZW hits)
- Keep existing `pii.mode` / `guard.mode` semantics; new rules participate in
  the same apply, findings, and `scan --pii` paths
- Update package READMEs and mark the roadmap item done after apply

**No new third-party dependencies** (Node built-ins + workspace only).

## Capabilities

### New Capabilities

_(none)_

### Modified Capabilities

- `pii-masking`: add MST, bank-account, and name-heuristic detection requirements
- `injection-guard`: add Base64 payload, markdown exfiltration, and control-flood
  detection requirements

## Impact

- Code: `packages/pii-basic` (rules + tests), `packages/guard` (rules + tests);
  possibly tiny docs in CLI/README if rule ids are listed
- Config: no new keys required (modes unchanged); optional future toggles out of scope
- Store/MCP: same `Document.pii` / `Document.guard` shapes; new rule ids only
- Dependencies: none added

## Out of scope

- Model-based PII or guardrails (paid)
- OCR / scanned-image PII
- Full NER or ML name recognition; name heuristics stay dictionary/label-based
- Free-text bank IBAN validation for every country (focus VN/JP cues)
- Changing default `pii.mode` / `guard.mode` or salt behavior
- OAuth, multi-tenant identity, or network calls for enrichment
- `scale-sqlite-store` and system logging (later roadmap items)
