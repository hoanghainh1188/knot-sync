# @hoanghainh/knot-sync-catalog-llm

Opt-in **paid** plugin: local LLM suggestions for Semantic Catalog columns left
blank after free dictionaries / テーブル定義書 Excel.

- OpenAI-compatible HTTP (`/v1/chat/completions`) — Ollama or Docker inference
- Default `baseUrl`: `http://127.0.0.1:11434/v1` (Ollama)
- Fill-empty only; never sets `reviewed: true`
- Soft-fail when the endpoint is down; no writes to customer sources
- Samples omitted from prompts by default (`includeSamples: false`)

## Enable

```yaml
plugins:
  - ../packages/catalog-llm/dist/index.js   # monorepo path example
catalog-llm:
  # model: llama3.2
  # baseUrl: http://127.0.0.1:11434/v1          # Ollama
  # baseUrl: http://127.0.0.1:8080/v1           # Docker OpenAI-compatible
  # timeoutMs: 30000
  # includeSamples: false
  # licenseEnv: KNOT_SYNC_CATALOG_LLM_LICENSE
  # licenseKey: knot-sync-catalog-llm-dev       # tests / local only
```

```bash
export KNOT_SYNC_CATALOG_LLM_LICENSE=your-key
# optional if the local server requires a key:
# export KNOT_SYNC_CATALOG_LLM_API_KEY=...
knot-sync describe
knot-sync ui   # human review still required
```

## License

Apache-2.0. This package is `"private": true` (not published as a free npm
built-in). The plugin self-checks its license; KnotSync core never does.
