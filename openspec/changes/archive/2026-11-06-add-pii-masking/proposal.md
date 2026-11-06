# Proposal

## Why

Extracted and cleaned documents still carry personal data (emails, phone
numbers, national IDs, cards) that must not reach the store, search index, or
MCP. Agents need masked content plus structured findings; operators need an
optional scan estimate of how many files look like they contain PII.

## What Changes

- New package `packages/pii-basic` (`@hoanghainh/knot-sync-pii-basic`): built-in
  PII rule plugin applied by `knot-sync run` after cleaning and before upsert.
- Detection rules (each a `pii-rule` id):
  - `email`
  - Japanese phone numbers
  - Vietnamese phone numbers
  - Vietnamese CCCD (12 digits)
  - Japanese My Number (12 digits with check digit)
  - Credit card numbers (Luhn)
- Config `pii.mode`: `mask` (replace with `***` / partial mask), `hash` (stable
  salted hash per installation), or `drop` (remove the span).
- Findings saved on `Document.pii` (rule id + character offsets in the
  **pre-mask** text). Store/search/MCP receive only the masked (or dropped)
  content; **unmasked PII MUST never be persisted**.
- `knot-sync scan --pii` optionally samples file text (where cheap) and
  estimates how many files contain personal data **without storing matches**.
- Widen core `PiiRule` contract; register built-in with CLI plugins.
- **No new third-party dependencies** (Node `crypto` for hashing; salt stored
  locally under the store/data dir).

### Out of scope

- OCR / image PII, address/name NER, model-based detectors (paid / later).
- Reversible encryption of original PII for admin unlock.
- Injecting PII findings into the HTML scan report layout (beyond count
  estimate when `--pii` ran) — full report polish stays with
  `add-html-scan-report`.
- Custom regex rules from config (example plugin already shows the pattern).

## Capabilities

### New Capabilities

- `pii-masking`: detect/mask PII on `run`, persist findings without raw values,
  config `pii:`, and `scan --pii` sampling estimates.

### Modified Capabilities

- `document-extraction`: `run` applies registered PII rules after cleaners.
- `plugin-system`: `PiiRule` registrations are executable (not stubs).
- `config`: optional `pii:` section (`mode`, salt path / related settings).
- `scan-report`: `scan --pii` adds a PII file-count estimate to scan output
  (JSON and text) without storing match text.

## Impact

- **Code:** `pii-basic` package; core types/plugin; CLI `run` + `scan --pii`;
  local salt file next to store.
- **Deps:** none new.
- **Docs:** README and `docs/ROADMAP.md`.
