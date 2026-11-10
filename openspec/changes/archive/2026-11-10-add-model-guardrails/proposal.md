# Proposal

## Why

Free KnotSync already applies deterministic PII and injection-guard rules
(phrases, controls, Base64, markdown exfil, etc.). Subtle prompt-injection and
sensitive-content cases still slip through. Paid roadmap **Model-based
guardrails** adds a local-LLM second pass so operators can catch those cases
without cloud APIs—while free core stays rule-only and offline.

## What Changes

- Add an **opt-in paid plugin** package that, after rule-based PII then guard on
  `run`, calls a **local** OpenAI-compatible HTTP endpoint (Ollama or Docker;
  configurable `baseUrl`, default localhost) to propose **additional** guard
  and/or PII findings
- **Merge** model findings into `Document.guard` / `Document.pii`, then apply
  existing **`guard.mode`** / **`pii.mode`** (flag/strip/block and mask/hash/drop)
  to those new findings—no separate plugin action modes
- Soft-fail when unlicensed, timed out, or local endpoint down: keep
  rule-based results; do not abort `run`; never write customer sources
- Plugin **self-checks** a license key; core never validates licenses; **not** a
  free CLI built-in
- Extend the plugin host with a small **document-enricher** (or equivalent)
  registration so the model pass is not forced into sync `GuardRule.find` /
  `PiiRule.find` (those remain no-network)
- Update README / Paid #7 in `docs/ROADMAP.md`

**Assumptions (from Harry):**

1. **A** — Local OpenAI-compatible `baseUrl` (Ollama/Docker), default loopback
2. **C** — Model covers both injection/guard **and** PII/sensitive content
3. **A** — Runs **after** rule-based PII→guard; findings are **additive**
4. **A** — Merge into `Document.guard` / `Document.pii`; reuse existing modes
5. **A** — Paid opt-in plugin + license + soft-fail

## Capabilities

### New Capabilities

- `model-guardrails`: paid local-LLM enricher that adds guard/PII findings after
  rule-based apply, with license gate, soft-fail, and existing mode reuse

### Modified Capabilities

- `plugin-system`: model-guardrails is opt-in paid; document-enricher (or
  equivalent) extension point for async post-rule enrichment
- `injection-guard` (light): clarify rule-based path remains default; model
  findings may append and feed the same `guard.mode`
- `pii-masking` (light): clarify rule-based path remains default; model
  findings may append and feed the same `pii.mode`
- `config` (light): starter/docs for `plugins:` + guard-llm settings (baseUrl,
  model, timeouts, maxChars, license env)—secrets stay env-only
- `document-extraction` (light): pipeline notes that optional model enricher
  runs after PII→guard when the plugin is loaded

## Impact

- Code: new `packages/guard-llm` (npm `@hoanghainh/knot-sync-guard-llm`); core
  plugin-host enricher registry; CLI `run` calls enrichers after rule apply;
  free path unchanged when plugin omitted
- Dependencies: prefer **Node built-in `fetch`** to local OpenAI-compatible
  chat/completions; **no native deps**; any helper must be MIT/BSD/Apache/ISC
  only and listed at design (**none planned**)
- Ops: operator runs Ollama/Docker chat model locally; enable via `plugins:` +
  license env + base URL/model settings
- Product: still read-only to sources; no telemetry; no cloud LLM by default;
  MCP untrusted framing unchanged

## Out of scope

- Replacing or removing deterministic guard / PII rules
- Cloud LLM APIs as the default or required path
- Separate plugin action modes (flag/strip/block/mask) distinct from
  `guard.mode` / `pii.mode`
- Shipping model weights inside the npm package
- Making guard-llm a default built-in of the free published CLI
- Training/fine-tuning tooling; remote model marketplaces
