# Proposal

## Why

Extracted Office/text still carries JP/VN legacy quirks (全角/半角, 和暦, TCVN3/VNI
fonts, noisy whitespace) that waste tokens and confuse agents. Cleaning must run
after extraction on `run`, as a built-in cleaner plugin, before PII/guard steps.

## What Changes

- New package `packages/cleaner-ja-vi` (`@hoanghainh/knot-sync-cleaner-ja-vi`):
  built-in cleaner plugin applied by `knot-sync run` after a successful extract.
- Cleaning steps (each toggleable under config `cleaning:`):
  - Unicode NFKC (full-width / half-width normalization)
  - Wareki → Gregorian (明治/大正/昭和/平成/令和, including 元年 and kanji numerals)
  - Common date forms → ISO 8601 (`2024/1/5`, `05-01-2024`, `2024年1月5日`, …)
  - Legacy Vietnamese encodings TCVN3 and VNI → Unicode (detect, then convert)
  - Token reduction: collapse whitespace, drop empty rows/cells, strip headers/
    footers repeated on every page
- Record estimated token counts before/after per document (for future `bench`).
- Keep original extracted text in the store for traceability; search/MCP see the
  cleaned content.
- Widen the core `Cleaner` interface; register built-in in CLI plugin list.
- **No new third-party dependencies.**

### Out of scope

- Exact LLM tokenizer / `bench` command (v0.2).
- PII masking and injection guard (later v0.1 changes).
- OCR, Shift_JIS→Unicode as a dedicated encoding step beyond TCVN3/VNI text
  content already decoded as Unicode code points.
- Paid layout / 方眼紙 cleaning.

## Capabilities

### New Capabilities

- `ja-vi-cleaning`: JP/VN text normalization, dating, legacy font conversion,
  token reduction, and per-document token estimates under config `cleaning:`.

### Modified Capabilities

- `document-extraction`: `run` applies registered cleaners after extraction
  before upsert.
- `plugin-system`: Cleaner registrations are callable (not empty stubs).
- `config`: optional `cleaning:` section with per-step toggles and defaults.

## Impact

- **Code:** new `cleaner-ja-vi`; core Cleaner types + config parse; CLI `run`
  pipeline; store keeps original via document metadata (or equivalent field).
- **Deps:** none new.
- **Docs:** README and `docs/ROADMAP.md`.
