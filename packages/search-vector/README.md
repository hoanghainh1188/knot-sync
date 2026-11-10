# @hoanghainh/knot-sync-search-vector

Opt-in **paid** plugin: local embedding index + cosine similarity search over
cleaned KnotSync documents.

- OpenAI-compatible HTTP embeddings (`/v1/embeddings`) — Ollama or Docker
- Default `baseUrl`: `http://127.0.0.1:11434/v1`
- SQLite `document_embeddings` table + pure JS cosine (no native extensions)
- MCP tools: `search_similar`, `embed_documents`
- CLI: `knot-sync embed` (requires plugin listed under `plugins:`)
- Soft-fail when the endpoint is down; FTS `search_documents` stays independent

## Enable

```yaml
plugins:
  - ../packages/search-vector/dist/index.js   # monorepo path example
search-vector:
  # model: nomic-embed-text
  # baseUrl: http://127.0.0.1:11434/v1          # Ollama
  # baseUrl: http://127.0.0.1:8080/v1           # Docker OpenAI-compatible
  # timeoutMs: 30000
  # maxChars: 8000
  # lazyMaxDocs: 20
  # embedOnRun: false
  # licenseEnv: KNOT_SYNC_SEARCH_VECTOR_LICENSE
  # licenseKey: knot-sync-search-vector-dev     # tests / local only
```

```bash
export KNOT_SYNC_SEARCH_VECTOR_LICENSE=your-key
knot-sync run
knot-sync embed
# then MCP search_similar via knot-sync serve
```

## License

Apache-2.0. This package is `"private": true`. The plugin self-checks its
license; KnotSync core never does.
