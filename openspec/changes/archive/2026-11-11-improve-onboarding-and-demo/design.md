# Design

## Overview

This change improves product comprehension across three surfaces—a runnable local demo, grouped CLI help/next-step prompts, and an in-UI context banner—without altering KnotSync's 1.0 public CLI/MCP contract or adding dependencies.

## Read-Only & Fully-Local Guarantees

- **Demo fixture generation**: `scripts/create-demo-data.mjs` writes synthetic sample files strictly into a gitignored/demo output folder (e.g., `examples/.demo-data/`, never into any user-configured production source) using only local Node.js built-ins and already-installed `exceljs`. No network calls or external assets are used.
- **CLI hints & help**: Text-only changes in `packages/cli/src/i18n/`. Machine-readable `--json` output for `scan` and `run` is unchanged. Next-step hints only print to stdout/stderr in human-readable mode.
- **Catalog Review UI**: Banner strings are bundled inside `packages/ui/src/chrome-i18n.ts` and rendered purely from local static assets (`127.0.0.1`). No CDN URLs or outbound requests are introduced. Writes remain limited to `knot-sync.catalog.yaml`.

## Detailed Choices

### 1. Reproducible Demo (`onboarding-demo`)
- Keep `examples/sample-data` and `pnpm scan:sample` untouched so existing workflows and expectations stay intact.
- Add `scripts/create-demo-data.mjs` (invoked via `pnpm demo:prepare`) to generate:
  - A real `.xlsx` workbook via `exceljs` containing Japanese Wareki dates (`令和6年4月1日`), full-width digits (`１２３４`), repeated empty rows, and a synthetic My Number pattern.
  - A `.csv` / `.txt` fixture containing Vietnamese TCVN3-encoded text (e.g., `B¸o c¸o doanh thu - NguyÔn V¨n A`) and a synthetic 12-digit CCCD pattern.
- Provide `examples/demo.config.yaml` (pointing at `examples/.demo-data` with `.data/demo-store.sqlite` outside the source folder) and `examples/demo-catalog.yaml` (sample `TKSK_CD` / `ma_kh` entries so `knot-sync ui -c examples/demo.config.yaml` can be explored immediately without running a local Postgres/MySQL server).
- Add `examples/.demo-data` to `.gitignore` so generated binaries are never committed.

### 2. Grouped CLI Help & Next-Step Hints (`cli-i18n`)
- Group commands in `help` across `en`, `ja`, and `vi` into:
  1. Setup & Audit (`init`, `scan`)
  2. Prepare Data (`run`, `describe`, `ui`)
  3. Serve to AI (`serve`)
  4. Optional / Ops (`bench`, `optimize`, `embed`, `plugins`)
- Add `scan.next` and `run.next` keys to `MessageCatalog` in `packages/cli/src/i18n/messages.ts` and implement them in `en.ts`, `ja.ts`, `vi.ts`:
  - `scan.next`: Suggest `knot-sync run` to extract/clean documents (or `knot-sync scan --report` for HTML summary).
  - `run.next`: Suggest `knot-sync serve` to connect an AI agent via MCP (or `knot-sync bench` to inspect token reduction).
- Only print `scan.next` / `run.next` when `--json` is NOT set, keeping JSON output strictly valid and unchanged.

### 3. UI Purpose & Boundary Banner (`catalog-review-ui`)
- Add a concise `contextBanner` string in `packages/ui/src/chrome-i18n.ts` for `en`, `ja`, and `vi`, explaining:
  - Why: Label abbreviated SQL columns (e.g. `TKSK_CD` → customer code) so AI agents write accurate queries.
  - Boundary: Changes save only to `knot-sync.catalog.yaml`; source databases are never modified.
- Render the banner cleanly inside `<header>` or directly beneath it in `packages/ui/src/client/App.tsx`.
