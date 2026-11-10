# @hoanghainh/knot-sync-guard-llm

Opt-in **paid** plugin: local-LLM document enricher that adds injection-guard and
PII findings **after** deterministic rules on `knot-sync run`.

- OpenAI-compatible HTTP (`/v1/chat/completions`) — Ollama or Docker inference
- Default `baseUrl`: `http://127.0.0.1:11434/v1` (Ollama)
- Additive findings merged into `Document.guard` / `Document.pii`
- Reuses existing `guard.mode` / `pii.mode` (flag/strip/block, mask/hash/drop)
- Soft-fail when the endpoint is down; no writes to customer sources

## Enable

```yaml
plugins:
  - ../packages/guard-llm/dist/index.js   # monorepo path example
guard-llm:
  # model: llama3.2
  # baseUrl: http://127.0.0.1:11434/v1          # Ollama
  # baseUrl: http://127.0.0.1:8080/v1           # Docker OpenAI-compatible
  # timeoutMs: 30000
  # maxChars: 8000
  # licenseEnv: KNOT_SYNC_GUARD_LLM_LICENSE
  # licenseKey: knot-sync-guard-llm-dev         # tests / local only
```

```bash
export KNOT_SYNC_GUARD_LLM_LICENSE=your-key
# optional if the local server requires a key:
# export KNOT_SYNC_GUARD_LLM_API_KEY=...
knot-sync run
```

## License

Apache-2.0. This package is `"private": true` (not published as a free npm
built-in). The plugin self-checks its license; KnotSync core never does.
