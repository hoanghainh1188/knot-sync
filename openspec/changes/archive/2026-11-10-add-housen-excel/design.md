# Design

## Context

See proposal.md — Why. Built-in `extractor-office` reads `.xlsx` via ExcelJS and
emits a Markdown table with **row 0 as headers**. `findExtractor` returns the
**first** registered extractor for an extension; office owns `.xlsx` before any
config `plugins:`. Paid OCR already set the pattern: private package, license
self-check, CLI helper for fallthrough/rewrite, no new native deps.

## Goals / Non-Goals

**Goals:**

- Opt-in housen plugin with local heuristic layout detection + structured emit
- Plain tables stay on office when plugin is loaded
- Soft-fail license/timeout/size; read-only sources; no network
- Prefer **exceljs only** (MIT, already in monorepo)

**Non-Goals:**

- Default built-in housen in free CLI
- LLM / vision layout
- Binary `.xls`
- Rewriting customer files on disk

## Decisions

### 1. Package layout

**Choice:** `packages/extractor-housen`, npm
`@hoanghainh/knot-sync-extractor-housen`, `"private": true`. Plugin `name`
`extractor-housen`; settings under top-level `extractor-housen:`. Extractor id
e.g. `housen-xlsx` claiming `.xlsx` (for `plugins` listing and direct extract
tests).

**Alternatives:** Patch `extractor-office` — rejected (blurs paid/free boundary).

### 2. CLI rewrite (office owns .xlsx)

**Choice:** After a successful office extract for `.xlsx`, if host has
`housen-xlsx` (or plugin loaded), call `housen.tryRewrite(file, ctx)`:

1. License check inside plugin
2. Read workbook (ExcelJS), score form-likeness
3. If below threshold → return “not form” and **keep office Document**
4. If form-like → return housen Document (replaces office result)

Mirror the OCR helper style (`extractWithOcrFallback`) as
`extractWithHousenRewrite` in CLI.

**Alternatives:** Register housen before office — rejected; would OCR/layout
every spreadsheet. Cleaner-only rewrite — rejected; cleaners should not re-open
source files as the primary layout path.

### 3. Detection heuristics (v1)

**Choice:** Deterministic score from:

- Merged-cell density
- Empty-cell / sparsity ratio vs filled cells
- Adjacent label→value pairs (non-empty cell beside empty-or-short neighbor)
- Small lexicon of JP form labels (`氏名`, `日付`, `金額`, `所属`, `申請`, `請求`, …)

Configurable thresholds under plugin settings; defaults tuned on fixtures.
Emit Markdown sections + `- **label**: value` lines and optional small
`TableData` for repeated blocks.

**Alternatives:** Local LLM — deferred paid item; too heavy for this change.

### 4. License self-check

**Choice:** Same pattern as OCR: `KNOT_SYNC_HOUSEN_LICENSE` (override via
`licenseEnv`) or `licenseKey`; test sentinel `knot-sync-housen-dev`. Missing →
soft-fail `LICENSE` (keep office Document if rewrite was optional, or record
issue—prefer: skip rewrite, optionally issue once; design: **skip rewrite +
issue with LICENSE** only when settings force housen-only—default skip rewrite
silently? Spec says message names how to set license. **Record LICENSE issue
and keep office Document** so operators notice misconfig without losing data.)

### 5. Dependencies

**Choice:** `exceljs` ^4.4 (MIT) + workspace `core`. No Docker, no native addons.

## Risks / Trade-offs

- **[False positives on sparse tables]** → Thresholds + plain-table fixture
  must stay on office; tune defaults conservatively
- **[False negatives on unusual forms]** → Document limits; fixtures for common
  JP leave forms; no marketing % claims
- **[Double read of xlsx]** → Accept for paid path; honor size/timeout bounds
- **[Paid code in Apache monorepo]** → Private package + license gate (same as OCR)

## Migration Plan

- No store schema change
- Existing installs unchanged until `plugins:` lists housen
- Rollback: remove plugin entry

## Open Questions

None for propose—exact default thresholds fixed at apply against fixtures.
