# Design

## Context

See proposal.md. After `run`, documents already store `metadata.tokensBefore` /
`tokensAfter` via `estimateTokens` in `cleaner-ja-vi`. Search and catalog
resolve APIs exist for MCP. No LLM in free core; bench must stay local and
honest (ROADMAP: no unverified marketing numbers).

## Goals / Non-Goals

**Goals:**
- One CLI command summarizing token reduction and suite pass rates.
- Customer-owned suite file for retrieval/catalog checks.
- Reuse existing estimators and search/resolve—no new deps.

**Non-Goals:**
- Training or calling models; A/B of live Claude Desktop sessions.
- Perfect tiktoken parity (document the estimator as approximate, same as
  cleaner).
- Mutating store/catalog during bench.

## Decisions

### 1. Implementation home: `packages/cli/src/bench/` (+ optional thin package)

**Choice:** Keep logic in the CLI package first (`bench/report.ts`,
`bench/suite.ts`, `bench/run.ts`) importing cleaner tokens, store, catalog.
Promote to `@hoanghainh/knot-sync-bench` only if size warrants—default stay in
CLI for a one-week change.
**Why:** Fewer packages; matches `describe` living in CLI.
**Alternative:** New package immediately (more boilerplate).

### 2. Token metrics

**Choice:** Sum `tokensBefore` / `tokensAfter` from all documents with both
fields set. Report `documentsWithTokens`, `documentsSkipped`, `before`,
`after`, `saved`, `reductionPct`. Do not re-clean during bench.
**Why:** Reflects what `run` actually produced on this store.
**Fallback:** If a doc has `originalContent` but missing token fields, optional
re-estimate with `estimateTokens`—only if cheap and documented; prefer
skipping with a note to re-`run`.

### 3. Suite file format (`knot-sync.bench.yaml`)

```yaml
version: 1
search:
  - id: invoice-ja
    query: 請求書
    expect:
      titleContains: 請求書   # or documentId: ...
  - id: invoice-vi
    query: hóa đơn
    expect:
      titleContains: Hóa đơn
catalog:
  - id: tksk
    source: erp
    table: 受注
    name: 得意先コード   # business or physical
    expectResolved: true
```

**Choice:** YAML beside config; flag `--suite <path>`. Missing suite → token
report only (still valid).
**Why:** Operators control expected hits on their data.

### 4. Search scoring

**Choice:** Call the same search path as MCP (`store.search` or
`search_documents` handler) with `limit` small. Pass if any hit matches
`documentId` or `titleContains` / `pathContains` (case-insensitive, JP/VN
as store already handles).
**Before/after for search:** “After” = current cleaned store (only store we
have). Do **not** invent a dirty-content search index. Label the section
“retrieval suite (on cleaned store)” rather than fake before/after for
search. Token section carries the cleaning before/after story.
**Why:** We do not keep a parallel uncleaned FTS index; honesty > fake before.

### 5. Catalog before/after

**Choice:** For each catalog case, **before** = resolve with empty/absent
catalog (physical name only succeeds); **after** = resolve with loaded
catalog (business labels). Score independently; report two rates.
**Why:** Matches ROADMAP “with catalog” story without an LLM.

### 6. Output and locale

Human table via existing CLI i18n keys; `--json` schema:

```json
{
  "version": "0.1.0",
  "tokens": { "before": 0, "after": 0, "reductionPct": 0, "documents": 0, "skipped": 0 },
  "suite": { "path": "...", "search": { "passed": 0, "failed": 0, "cases": [] }, "catalog": { ... } }
}
```

### 7. Read-only / local

Read config, store, catalog, suite only. No network. No writes to sources.
Exit codes: 0 command ok (even if suite has fails); 1 config/store errors; 2
usage.

## Risks / Trade-offs

- **[Risk] Users expect LLM tool-trace accuracy** → Docs clarify suite-based
  scoring; paid LLM eval later.
- **[Risk] Empty token metadata** → Clear skip counts; tell them to re-run.
- **[Trade-off] No search “before cleaning”** → Documented; tokens cover
  cleaning impact.

## Migration Plan

- New command only; no schema migration.
- Sample suite under `examples/` optional in tasks.

## Open Questions

None blocking.
