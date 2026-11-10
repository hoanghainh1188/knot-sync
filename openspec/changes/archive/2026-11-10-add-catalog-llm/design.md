# Design

## Context

See proposal.md — Why. Free `describe` merges `CatalogSource` suggestions in
order (`applySuggestionsAsync` in `packages/catalog`): romaji, Vietnamese,
customer dict, optional definition Excel—later non-empty fields overwrite.
Reviewed merge is separate (`merge.ts`). Paid OCR already documents local
HTTP/Docker as an opt-in network exception; catalog-llm follows that pattern
for **loopback / operator-run** OpenAI-compatible servers only by default.

## Goals / Non-Goals

**Goals:**

- Opt-in CatalogSource that fills **blank** labels/descriptions via local LLM
- Support Ollama and Docker OpenAI-compatible servers via configurable `baseUrl`
- Soft-fail per column; never mark `reviewed`; never write customer sources
- Free CLI path unchanged when plugin omitted (no LLM deps on publish path)

**Non-Goals:**

- Shipping model weights or requiring a specific vendor cloud API
- Auto-review / skipping Catalog Review UI
- Overwriting non-empty free-path suggestions
- Batch embedding / vector index (Paid #6)

## Decisions

### 1. Package layout

**Choice:** `packages/catalog-llm`, npm `@hoanghainh/knot-sync-catalog-llm`,
`"private": true`. Plugin / settings key `catalog-llm`.

**Alternatives:** Fold into `packages/catalog` — rejected (pulls paid path into
free package). Name `llm-catalog` — acceptable alias in docs; keep
`catalog-llm` beside `catalog`.

### 2. Fill-empty without breaking free overwrite order

**Choice:** Keep free sources as today. After `applySuggestionsAsync` over
non-LLM sources (or equivalently: run LLM last with a **fill-empty** merge):

- If any of `label.ja|vi|en` is already set → do not call LLM for labels (skip
  or no-op)
- Else call local chat completions; merge only empty fields
- Description filled only when still empty
- Never set `reviewed`

Implementation may (a) extend suggestion apply with a `fillEmpty` flag for the
LLM source id, or (b) post-pass in `buildDescribeDraft` that invokes the LLM
source only when labels are blank. Prefer (b) or a small helper in
`packages/catalog` that is inert when no LLM source is registered—avoid
changing free overwrite semantics among built-ins.

**Alternatives:** Pass `prior` into every `CatalogSuggestInput` — more API
churn; only if (b) proves awkward.

### 3. HTTP client

**Choice:** Node built-in `fetch` to `{baseUrl}/v1/chat/completions`
(OpenAI-compatible). Settings: `baseUrl` (default `http://127.0.0.1:11434/v1`
for Ollama), `model` (required non-empty when plugin used), `timeoutMs`,
optional `apiKeyEnv` for servers that need a local key. **No new npm
dependency** unless a tiny MIT JSON schema helper becomes necessary (list in
tasks if added).

**Alternatives:** Official `openai` SDK — extra dep; defer. Native llama.cpp
bindings — violates no-native / free-CLI constraints.

### 4. Prompt and privacy

**Choice:** Prompt includes physical column name, table, optional SQL type, and
asks for JSON `{ ja?, vi?, en?, description? }` (and optional `pii` boolean).
**Do not** send distinct sample values by default (PII risk); optional
settings flag `includeSamples` default false. Cap response size; reject
non-JSON / instruction-like payloads as soft-fail. Never write prompts or
completions into customer sources; system log may record counts only, not
prompt bodies.

### 5. License

**Choice:** Env `KNOT_SYNC_CATALOG_LLM_LICENSE` / settings `licenseKey`; test
sentinel `knot-sync-catalog-llm-dev`. Missing → register plugin for listing but
skip LLM HTTP (soft no-op) with guidance—mirror oauth/OCR patterns as chosen
at apply.

### 6. Locality

**Choice:** Default `baseUrl` is loopback. Docs state operators may point at
on-prem Docker on LAN. Do not hard-code cloud hosts. No telemetry.

### 7. Read-only / fully local guarantees

- LLM path never issues SQL writes or filesystem writes under configured
  sources
- Network only to the configured inference URL when plugin loaded and a blank
  column needs a suggestion
- Free install (plugin omitted) keeps describe offline

## Risks / Trade-offs

| Risk | Mitigation |
| --- | --- |
| Slow/flaky local models | Per-column timeout; soft-fail; optional concurrency limit (serial default) |
| Hallucinated labels | `reviewed` stays false; UI review required |
| PII in samples | Samples off by default |
| Operator points `baseUrl` at cloud | Document local-only default; no cloud hard-coding; license still paid |

## Migration Plan

1. Add package + wire workspace/tsconfig; document `plugins:` + env
2. Operators install/run Ollama or Docker model separately
3. Rollback: remove plugin entry from config—free describe restored

## Open Questions

None material for v1 (Harry locked 1C/2A/3/4). Exact default Ollama port/model
name can follow current Ollama docs at apply time.
