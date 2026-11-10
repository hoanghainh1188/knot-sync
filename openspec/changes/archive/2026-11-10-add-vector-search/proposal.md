# Proposal

## Why

Free document search is FTS5 trigram keyword search—strong for exact JP/VN
terms, weak for paraphrase / “find similar” intent. Paid roadmap **Vector
search** adds local embedding-based retrieval over cleaned documents so agents
can discover related content without cloud APIs or native SQLite extensions.

## What Changes

- Add an **opt-in paid plugin** package that embeds cleaned document text via a
  **local** OpenAI-compatible HTTP endpoint (Ollama or Docker; configurable
  `baseUrl`, default localhost)
- Store embeddings in a **SQLite table** (float vectors) and rank with
  **cosine similarity in pure JS**—no `sqlite-vec` / native extensions
- New MCP tool **`search_similar`**; keep FTS5 **`search_documents`** unchanged
- **Batch embed** via dedicated CLI (`knot-sync embed` or equivalent when plugin
  loaded) and optional hook during `run`; **lazy embed** missing docs on
  `search_similar`
- Soft-fail when the local endpoint is down: tool returns empty/guidance; never
  write customer sources
- Plugin **self-checks** a license key; core never validates licenses; **not** a
  free CLI built-in
- Update README / Paid #6 in `docs/ROADMAP.md`

**Assumptions (from Harry):**

1. **C** — Ollama / OpenAI-compatible localhost **and** Docker via configurable
   URL (default localhost)
2. **A** — SQLite table + cosine in JS (no native ext)
3. **A** — New MCP tool `search_similar` (FTS stays)
4. **C** — Batch (`embed` / `run` hook) **and** lazy fill on search
5. Private opt-in plugin with license self-check

## Capabilities

### New Capabilities

- `vector-search`: paid local embedding index + cosine retrieval for cleaned
  documents, with license gate, batch/lazy embed, and `search_similar` MCP tool

### Modified Capabilities

- `mcp-server`: document `search_similar` when the vector plugin is loaded
- `plugin-system`: vector-search is opt-in paid (not a default built-in)
- `config` (light): starter/docs for `plugins:` + search-vector settings
  (baseUrl, model, dimensions, license env)
- `document-search` (light): clarify FTS remains default; vector path is
  additive via paid plugin (no FTS behavior change)

## Impact

- Code: new `packages/search-vector` (npm `@hoanghainh/knot-sync-search-vector`);
  small store/CLI hooks so free path never requires embeddings; MCP tool via
  plugin API
- Dependencies: prefer **Node built-in `fetch`** + pure JS cosine; **no native
  deps**; any helper must be MIT/BSD/Apache/ISC only and listed at design
- Ops: operator runs Ollama/Docker embedding model locally; enable via
  `plugins:` + license env
- Product: still read-only to sources; no telemetry; no cloud embeddings by
  default; MCP framing for hit snippets unchanged (untrusted content)

## Out of scope

- Replacing or removing FTS5 trigram search
- Cloud embedding APIs as the default/required path
- `sqlite-vec` / FAISS / native ANN indexes
- Hybrid rank fusion as a required v1 feature (may document later)
- Model-based guardrails (Paid #7); shipping model weights in npm
- Making search-vector a default built-in of the free published CLI
