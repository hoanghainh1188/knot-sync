# Design

## Context

See proposal.md — Why. Free `run` applies deterministic PII then guard
(`packages/pii-basic`, `packages/guard`) via sync `find()` rules—no network.
`GuardRule` / `PiiRule` contracts stay offline. Paid catalog-llm / search-vector
already use loopback OpenAI-compatible HTTP as an opt-in exception; guard-llm
follows that pattern for a **post-rule document enricher**.

## Goals / Non-Goals

**Goals:**

- Opt-in enricher that adds guard + PII findings after rules on `run`
- Reuse `guard.mode` / `pii.mode` for model findings
- Soft-fail; never write customer sources; free path unchanged when omitted

**Non-Goals:**

- Replacing rule engines; cloud LLM defaults; separate plugin action modes
- Shipping model weights; changing MCP tool surface in this change

## Decisions

### 1. Package layout

**Choice:** `packages/guard-llm`, npm `@hoanghainh/knot-sync-guard-llm`,
`"private": true`. Plugin / settings key `guard-llm`. License env
`KNOT_SYNC_GUARD_LLM_LICENSE`; test sentinel `knot-sync-guard-llm-dev`.

**Alternatives:** Fold into `packages/guard` — rejected (pulls paid HTTP into
free package). Name `model-guardrails` for the package — keep capability
`model-guardrails` in specs; package id `guard-llm` beside `guard`.

### 2. Extension point: document enricher

**Choice:** Add `DocumentEnricher` to core plugin API:

- `id: string`
- `enrich(doc, ctx) → Promise<Document>` (or findings + apply helpers)

Register via `registerDocumentEnricher`. Host map
`documentEnrichers: Map<string, DocumentEnricher>`. CLI `run` after
`applyPiiToDocument` + `applyGuardToDocument` loops enrichers in registration
order.

**Why not** put HTTP inside `GuardRule.find`: would break the no-network rule
contract and force sync APIs.

**Alternatives:** Reuse MCP tool registration and invoke from CLI — works for
embed but is a misuse of MCP tools for pipeline steps. Rejected for clarity.

### 3. Additive merge + mode reuse

**Choice:** Enricher receives the **post-rule** document (already masked /
stripped / blocked as configured). Prompt asks for JSON findings with
`kind: "guard" | "pii"`, `rule` id prefix `model-`, and `start`/`end` offsets
into the **current** content (or quote snippets mapped back carefully).

Apply path:

1. Validate/clamp spans; drop overlaps with existing findings when needed
2. Append to `doc.guard` / `doc.pii`
3. Recompute `guardRisk` when guard findings added
4. Apply mode effects for **new** spans only (strip/block/mask/hash/drop)
   using the same helpers as free packages where practical

**Alternatives:** Run model on pre-mode text — rejected for Harry’s 3A
(after rules). Full re-apply of all rules after model — unnecessary churn.

### 4. HTTP client

**Choice:** Node built-in `fetch` to `{baseUrl}/v1/chat/completions`. Settings:
`baseUrl` (default `http://127.0.0.1:11434/v1`), `model`, `timeoutMs`,
`maxChars` (truncate input), optional `apiKeyEnv`. **No new npm dependency.**

Reject non-JSON / instruction-like model output as soft-fail. Cap response
size. Do not log prompt/completion bodies into customer sources; system log
may record counts only.

### 5. License

**Choice:** Mirror catalog-llm / search-vector: missing license → plugin lists
but enrich is soft no-op (no HTTP) with guidance.

### 6. Locality and read-only

- Default `baseUrl` is loopback; docs allow on-prem Docker/LAN
- No cloud hosts hard-coded; no telemetry
- Enricher never writes under configured sources; only mutates in-memory
  `Document` before store upsert

### 7. Free CLI publish path

Paid package stays private / not a default built-in. Published free CLI does
not depend on guard-llm.

## Risks / Trade-offs

- **[Risk]** Model false positives strip/block good content → **Mitigation:**
  default operators keep `guard.mode: flag` until trusted; document modes;
  soft-fail on parse errors
- **[Risk]** Offset errors from truncated `maxChars` → **Mitigation:** only
  accept spans within sent window; map with clear window start; drop invalid
- **[Risk]** Latency on large corpora → **Mitigation:** `maxChars` + timeout;
  soft-fail; optional future skip-if-already-high-risk (out of scope unless
  cheap to add)
- **[Risk]** Spec tension: “fully local / no network” vs local LLM →
  **Mitigation:** same as OCR/catalog-llm/search-vector — opt-in plugin only;
  free install stays offline

## Migration Plan

- No store schema migration
- Operators add `plugins:` + license + local model; omit plugin → zero change
- Rollback: remove plugin entry

## Open Questions

None material for apply; prompt JSON schema details can be finalized in
implementation tests.
