# Tasks

## 1. Package skeleton, license, and enricher API

- [x] 1.1 Add `DocumentEnricher` + `registerDocumentEnricher` to core plugin host
      (map on host; duplicate id fails) — verify with a unit test that a test
      plugin registers and appears on the host; sync GuardRule/PiiRule contracts
      unchanged
- [x] 1.2 Create `packages/guard-llm` (private, plugin default export,
      `apiVersion` compatible) with settings parser + license self-check —
      verify unknown settings keys fail; missing license leaves enrich as
      no-op; `knot-sync plugins` lists `guard-llm` only when `plugins:` includes
      it; wire workspace/tsconfig

## 2. LLM client, merge, and run hook

- [x] 2.1 Implement OpenAI-compatible chat `fetch` client + JSON findings
      parse/clamp + merge into `Document.guard`/`Document.pii` with mode apply
      for new spans (injectable fetch) — verify mock LLM adds JP guard finding
      under `flag` and VN PII span under `mask`; invalid JSON / HTTP error
      soft-fails without dropping rule findings
- [x] 2.2 Wire CLI `run` to call registered document enrichers after
      rule-based PII→guard and before upsert — verify enricher sees post-rule
      doc; source folders unchanged; run continues when enricher soft-fails

## 3. Docs and roadmap

- [x] 3.1 Update starter comments / README / Paid #7 in `docs/ROADMAP.md`;
      document Ollama + Docker chat URL examples; run full `pnpm test`

## Workflow follow-up

- Archive with `/opsx:archive add-model-guardrails` after apply review
- Commit / PR when Harry asks
