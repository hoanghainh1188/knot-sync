# Proposal

## Why

Marketing and sales need **real** before/after numbers on each customer’s own
data—not invented percentages. v0.2 calls for `knot-sync bench` to measure
token reduction from cleaning and tool-call / retrieval accuracy with the
Semantic Catalog, fully offline.

## What Changes

- Add `knot-sync bench` that reads the local store (and optional catalog /
  bench suite file) and prints measurable results.
- **Token report:** aggregate `tokensBefore` / `tokensAfter` (same estimator
  as `cleaner-ja-vi`) across stored documents; show totals and reduction %.
- **Tool / retrieval accuracy:** run a customer-supplied (or sample) suite of
  cases—document search queries and optional catalog column-resolution
  checks—scoring hit rate **without** vs **with** catalog enrichment where
  applicable; document search uses the cleaned store content as the “after”
  baseline.
- Human-readable + `--json` output; CLI locale via existing `--lang` /
  `cli.locale`.
- Help lists `bench`; README / ROADMAP / ja+vi docs updated.
- Prefer **no new third-party dependencies** (reuse `estimateTokens` and
  existing MCP/search/catalog helpers).

**Out of scope (defer):**
- Calling cloud or local LLMs to score agent tool traces (paid / later)
- Fabricating marketing numbers; network/telemetry
- Web UI for bench charts; writing to customer sources
- Changing cleaning or catalog algorithms themselves

**New third-party dependencies:** none.

## Capabilities

### New Capabilities

- `bench`: Local before/after measurement of token estimates and
  retrieval/tool suite accuracy on the operator’s store and optional suite
  file.

### Modified Capabilities

- *(none at requirement level for existing capabilities; bench consumes
  store/catalog/search as they are.)*

## Impact

- `packages/cli` (command + i18n strings) and possibly a small
  `packages/bench` or `cli/src/bench/` module.
- Reuses `@hoanghainh/knot-sync-cleaner-ja-vi` token estimator,
  store search, and catalog resolve helpers.
- Tests with JP/VN fixtures built in temp dirs; docs + ROADMAP v0.2 #3.
