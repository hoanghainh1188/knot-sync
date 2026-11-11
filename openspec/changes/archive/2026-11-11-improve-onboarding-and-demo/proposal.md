# Proposal

## Why

New evaluators—including developers, IT admins, and PMs at Japanese and Vietnamese companies—struggle to picture KnotSync's concrete role and day-to-day behavior from CLI output, the Catalog Review UI, and the existing sample folder:

1. `examples/sample-data` currently contains placeholder non-Office byte stubs (suitable for `scan`, not `run`), so an evaluator cannot run `scan` → `run` → inspect Before/After cleaning (TCVN3, 和暦, PII masking) out of the box.
2. `knot-sync --help` lists all 10 commands in a flat list without separating the core workflow (`init`, `scan`, `run`, `serve`) from optional SQL catalog (`describe`, `ui`) and maintenance commands (`bench`, `optimize`, `embed`, `plugins`), and `scan` / `run` lack a localized "what to run next" hint.
3. The Catalog Review UI (`packages/ui`) opens directly into a three-pane editor titled "Review Semantic Catalog labels" without explaining *why* an operator labels cryptic SQL columns (`TKSK_CD` → customer code) or clarifying that edits only update `knot-sync.catalog.yaml` (never the source database or AI chat).

## What Changes

- **Runnable local demo dataset (`examples/demo` + script)**: Add a reproducible, zero-binary-commit demo generator (`scripts/create-demo-data.mjs` or `pnpm demo:prepare`) plus a starter `examples/demo.config.yaml` and `examples/demo-catalog.yaml` containing realistic Japanese (和暦, full-width, My Number test pattern) and Vietnamese (TCVN3, CCCD test pattern) documents, so anyone can run `scan`, `run`, and `ui` end-to-end and inspect Before/After output locally.
- **Grouped CLI help & next-step hints (`packages/cli`)**: Reorganize `--help` in `en`, `ja`, and `vi` into clear workflow stages (Setup & Audit, Prepare Data, Serve to AI, Optional / Maintenance) while preserving every command and flag name, and append a localized next-step hint after `scan` and `run` human-readable output (`--json` remains untouched).
- **In-app context banner in Catalog Review UI (`packages/ui`)**: Add a concise, localized (`en`/`ja`/`vi`) explainer banner in the UI header/empty-state telling PMs/IT admins/developers what the screen is for (*translating cryptic DB column names so AI queries accurately; edits stay in the local YAML catalog only*).

**Out of scope**

- Adding new top-level CLI subcommands to the 1.0 public contract (keep `init`, `scan`, `run`, `describe`, `ui`, `bench`, `optimize`, `embed`, `plugins`, `serve` unchanged).
- Adding an AI chat window inside `knot-sync ui` (KnotSync remains a headless MCP data adapter, not a chat UI).
- Write tools or modifying customer sources (deferred after v1.0).
- New third-party dependencies (none; uses existing workspace packages such as `exceljs` and Node.js built-ins).

## Capabilities

### New Capabilities

- `onboarding-demo`: A self-contained, local-only demo dataset generator and sample config/catalog in `examples/` that produces real `.xlsx`, `.csv`, and `.txt` fixtures (JA 和暦 + VI TCVN3 + synthetic PII) without committing binary blobs.

### Modified Capabilities

- `cli-i18n`: Group `--help` output by workflow stage across `en`, `ja`, and `vi`, and add localized next-step guidance after `scan` and `run` (keeping `--json` and command tokens invariant).
- `catalog-review-ui`: Add a localized purpose/boundary banner in `packages/ui` (`en`, `ja`, `vi`) clarifying that the UI edits only `knot-sync.catalog.yaml` for SQL column meaning and never touches source databases or acts as an AI chat client.

## Impact

- Code: `packages/cli/src/i18n/{en,ja,vi,messages}.ts`, `packages/cli/src/main.ts` (emit localized next-step hints in human mode after `scan` and `run`), `packages/ui/src/chrome-i18n.ts`, `packages/ui/src/client/App.tsx`, `packages/ui/src/client/styles.css`.
- Examples/Scripts: `scripts/create-demo-data.mjs` (or similar), `examples/demo.config.yaml`, `examples/demo-catalog.yaml`, root `package.json` script (`demo:prepare`). Existing `examples/sample-data` and `pnpm scan:sample` remain unchanged.
- Tests: `packages/cli/src/cli.test.ts` / `i18n.test.ts`, `packages/ui/src/chrome-i18n.test.ts`, and a new `node:test` verifying demo generation + `scan` + `run` clean JA/VI fixtures.
- Dependencies: None.
- Runtime / Security: Strictly read-only to configured sources; fully local; no network calls or telemetry.
