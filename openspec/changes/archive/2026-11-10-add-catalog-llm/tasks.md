# Tasks

## 1. Package skeleton and license

- [x] 1.1 Create `packages/catalog-llm` (private, plugin default export,
      `apiVersion` compatible) with settings parser + license self-check —
      verify unknown settings keys fail; missing license leaves LLM suggestions
      unusable; `knot-sync plugins` lists `catalog-llm` only when `plugins:`
      includes it
- [x] 1.2 Wire workspace/tsconfig references and README (license env, baseUrl
      for Ollama/Docker, model, timeouts, samples-off default) — verify package
      builds under `pnpm test` scope

## 2. Local chat client and CatalogSource

- [x] 2.1 Implement OpenAI-compatible `fetch` client (timeout, JSON parse,
      soft-fail messages) with injectable fetch for tests — verify mock
      success returns ja/vi labels for blank `TKSK`-style / `ma_xyz` columns;
      down/timeout soft-fails without throwing through describe
- [x] 2.2 Register CatalogSource + fill-empty integration with describe (skip
      when free labels present; never set `reviewed`) — verify dictionary-filled
      `TKSK_CD` / `得意先コード` is not overwritten; blank column gets LLM draft
      with `reviewed: false`; reviewed merge still preserves `reviewed: true`

## 3. Docs and roadmap

- [x] 3.1 Update starter comments / README / Paid #5 in `docs/ROADMAP.md`;
      document local Ollama + Docker URL examples; run full `pnpm test`

## Workflow follow-up

- Archive with `/opsx:archive add-catalog-llm` after apply review
- Commit / PR when Harry asks
