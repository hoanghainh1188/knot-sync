# Design

## Context

See proposal.md — Why. Free search is FTS5 trigram in `packages/store-sqlite`
(`Store.search`). Paid catalog-llm already established local OpenAI-compatible
`fetch` + license self-check. Vector search follows that pattern for
**embeddings**, storing vectors in SQLite and ranking in JS.

## Goals / Non-Goals

**Goals:**

- Opt-in embeddings + `search_similar` MCP tool
- Local Ollama/Docker OpenAI-compatible embedding HTTP
- SQLite storage + pure JS cosine (no native ANN)
- Batch (`embed` / optional `run` hook) + lazy fill
- Free FTS path unchanged when plugin omitted

**Non-Goals:**

- Replacing FTS; hybrid fusion as required v1
- Native `sqlite-vec` / FAISS
- Cloud embedding defaults
- Shipping model weights

## Decisions

### 1. Package layout

**Choice:** `packages/search-vector`, npm `@hoanghainh/knot-sync-search-vector`,
`"private": true`. Plugin / settings key `search-vector`.

**Alternatives:** Fold into `store-sqlite` — rejected (forces paid path into
free store). Name `vector-search` package — docs alias OK; keep `search-vector`
beside search concerns.

### 2. Embedding HTTP

**Choice:** Node `fetch` to OpenAI-compatible embeddings endpoint
(`POST {baseUrl}/embeddings` with `model` + `input`). Default
`baseUrl` `http://127.0.0.1:11434/v1` (Ollama). Settings: `model`, `timeoutMs`,
optional `apiKeyEnv`, `maxChars` truncation for long cleaned text. **No new npm
deps** unless listed later (prefer zero).

### 3. Storage

**Choice:** Table in the **same** KnotSync SQLite file (plugin opens/ensures
schema), e.g. `document_embeddings(doc_id, model, dim, vector_json|blob,
content_hash, updated_at)`. Key by document id + model so model changes
re-embed. Content hash skip when unchanged. Cosine over all candidates with a
documented max scan / optional sourceId filter; v1 may brute-force with limit
cap (acceptable for local SME corpora).

**Alternatives:** Separate `.data/vectors.sqlite` — more join friction. Float
BLOB — fine; JSON array easier to debug in tests—pick BLOB or JSON at apply
(JSON OK for v1 clarity).

### 4. MCP + CLI

**Choice:**

- Register MCP tool `search_similar` `{ query, limit?, sourceId? }` via
  `registerMcpTool`
- CLI `knot-sync embed` (exit 2 / guidance if plugin absent): batch embed
  store documents
- Optional: after successful `run` extraction when plugin loaded, enqueue or
  call embed for changed docs (settings `embedOnRun` default false to keep
  `run` offline unless opted in)

### 5. Lazy embed

**Choice:** On `search_similar`, embed query text; for docs missing vectors,
embed up to `lazyMaxDocs` (settings, small default) then rank. Soft-fail
partial.

### 6. License

**Choice:** `KNOT_SYNC_SEARCH_VECTOR_LICENSE` / `licenseKey`; test sentinel
`knot-sync-search-vector-dev`. Same structural gate as other paid plugins.

### 7. Read-only / local

- Never write customer sources
- Network only to configured embedding URL when plugin active
- FTS never depends on embedding health
- Returned snippets framed as untrusted document content

## Risks / Trade-offs

| Risk | Mitigation |
| --- | --- |
| Brute-force cosine slow on large corpora | Cap candidates; document; later ANN out of scope |
| Model dimension mismatch | Store dim; reject/re-embed on change |
| PII in embed payload | Embed cleaned/masked store content only; truncate |
| Lazy embed latency | Timeout + lazyMaxDocs; prefer batch `embed` |

## Migration Plan

1. Add package + wire workspace; document plugins + env
2. Operators run local embedding model separately
3. Rollback: remove plugin entry—FTS-only restored; embedding table may remain
   inert

## Open Questions

None material (Harry locked 1C/2A/3A/4C/5). Exact default embedding model name
follows Ollama docs at apply time.
