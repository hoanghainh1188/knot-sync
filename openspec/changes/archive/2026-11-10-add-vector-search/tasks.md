# Tasks

## 1. Package skeleton and license

- [x] 1.1 Create `packages/search-vector` (private, plugin default export,
      `apiVersion` compatible) with settings parser + license self-check —
      verify unknown settings keys fail; missing license leaves embed /
      `search_similar` unusable; `knot-sync plugins` lists `search-vector` only
      when `plugins:` includes it
- [x] 1.2 Wire workspace/tsconfig references and README (license env, baseUrl
      for Ollama/Docker, model, timeouts, embedOnRun/lazyMaxDocs) — verify
      package builds under `pnpm test` scope

## 2. Embeddings store, client, and retrieval

- [x] 2.1 Implement OpenAI-compatible embeddings `fetch` client + pure JS
      cosine + SQLite embedding table helpers (injectable fetch/db for tests) —
      verify mock embed stores vector for a JP doc; cosine ranks paraphrase
      query above unrelated; down/timeout soft-fails
- [x] 2.2 Register MCP `search_similar` + batch `embed` CLI (and optional
      embedOnRun hook) with lazy fill — verify tool absent without plugin;
      licensed path returns framed hits; FTS `search_documents` still works
      when endpoint is down; source folders unchanged

## 3. Docs and roadmap

- [x] 3.1 Update starter comments / README / Paid #6 in `docs/ROADMAP.md`;
      document Ollama + Docker embedding URL examples; run full `pnpm test`

## Workflow follow-up

- Archive with `/opsx:archive add-vector-search` after apply review
- Commit / PR when Harry asks
