# Proposal

## Why

Free Semantic Catalog only expands cryptic columns via dictionaries and optional
テーブル定義書 Excel. Many JP/VN schemas still leave `TKSK_CD`-style names blank.
Paid roadmap **Local LLM for Semantic Catalog** adds local-model suggestions so
operators get draft labels/descriptions without cloud APIs—while humans still
confirm via `knot-sync ui` / `reviewed`.

## What Changes

- Add an **opt-in paid plugin** package (private workspace) that registers a
  `CatalogSource` using a **local** OpenAI-compatible HTTP endpoint (Ollama or
  Docker inference; configurable base URL, default localhost)
- Call the LLM **only for columns still blank** after dictionary + definition
  Excel suggestions (fill-empty; never overwrite filled free-path fields)
- Suggest **`label` / `description` only** (optional soft `pii` hint allowed);
  **never** set `reviewed: true`—UI/`describe` merge keep reviewed entries
- Soft-fail when the local endpoint is down/timeout/unlicensed: leave column
  blank with actionable guidance; do not abort whole `describe`
- Plugin **self-checks** a license key; core never validates licenses; **not** a
  free CLI built-in
- Update README / Paid #5 in `docs/ROADMAP.md`

**Assumptions (from Harry):**

1. **C** — Ollama / OpenAI-compatible localhost **and** Docker inference via
   configurable URL (default localhost)
2. **A** — LLM only for columns still empty after dictionary + Excel
3. Labels/descriptions only; **no** auto-`reviewed`
4. Private opt-in plugin with license self-check

## Capabilities

### New Capabilities

- `catalog-llm`: paid local-LLM CatalogSource for blank-column label/description
  suggestions over OpenAI-compatible local HTTP, with license gate and soft-fail

### Modified Capabilities

- `semantic-catalog`: document fill-empty LLM suggestions after free sources;
  reviewed preservation unchanged
- `plugin-system`: catalog-llm is opt-in paid (not a default built-in)
- `config` (light): starter/docs for `plugins:` + catalog-llm settings (base URL,
  model, timeouts, license env)—secrets stay env-only if any

## Impact

- Code: new `packages/catalog-llm` (npm `@hoanghainh/knot-sync-catalog-llm`);
  small hook in catalog `describe` / suggestion apply for fill-empty ordering if
  needed; free path unchanged when plugin omitted
- Dependencies: prefer **Node built-in `fetch`** to local OpenAI-compatible API;
  no native deps; any helper must be MIT/BSD/Apache/ISC only and listed at design
- Ops: operator runs Ollama or Docker model locally; enable via `plugins:` +
  license env + base URL/model settings
- Product: still read-only to customer DB/files; no telemetry; no cloud LLM by
  default; MCP framing unchanged

## Out of scope

- Cloud LLM APIs as the default or required path
- Auto-marking `reviewed: true` or skipping the Catalog Review UI
- Overwriting non-empty dictionary/Excel suggestions
- Embedding / vector search (Paid #6); model-based guardrails (Paid #7)
- Shipping model weights inside the npm package
- Making catalog-llm a default built-in of the free published CLI
