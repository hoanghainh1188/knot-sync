# Design

## Context

See proposal.md for motivation. Runtime already implements the inventory we
want to freeze: CLI commands in `packages/cli` help/`main.ts`, top-level config
keys in `packages/core` config parsing, MCP URIs/tools in `packages/mcp-server`,
and `PLUGIN_API_VERSION = 1` in core. Paid plugins are already `private: true`
and documented with license envs; the gap is an explicit **not on npm** contract
plus a single stability section operators can trust before tagging 1.0.0.

This change is documentation + OpenSpec contract only. It must not alter scan,
run, store, or MCP behavior, and must keep sources read-only and the free core
offline (no new network calls or telemetry).

## Goals / Non-Goals

**Goals:**

- Publish a durable `public-contract` spec that matches observed 0.2.0 behavior
- Make Paid distribution unambiguous on the npm-facing README and in ja/vi
- Record SemVer rules so a later `1.0.0` tag is a promise, not a surprise
- Keep apply work small: docs edits + lightweight tests that assert doc strings
  / help still list the stable surface

**Non-Goals:**

- Bumping `packages/cli` to `1.0.0` or creating git tag `v1.0.0`
- Changing CLI parsers, MCP registrations, or plugin host version number
- Publishing paid packages to npm
- Customer pilot / bench on real data (separate prep item)

## Decisions

### 1. Spec-first freeze, no runtime “stability mode”

- **Choice:** Encode the contract in OpenSpec + README; do not add a runtime
  feature flag or version negotiation beyond existing `apiVersion`.
- **Why:** The surface already exists; a second runtime gate would risk drift
  and is unnecessary for a docs/contract prep.
- **Alternatives:** Generate a machine-readable `public-api.json` from code —
  deferred; help/tests already cover the important names.

### 2. Inventory source of truth

- **Choice:** Treat current help text (`packages/cli/src/i18n/en.ts`), MCP
  registrations, and `PLUGIN_API_VERSION` as the factual inventory; README
  stability section summarizes, specs own the normative list.
- **Why:** Avoid inventing names that are not shipped; keep apply as sync-docs.
- **Alternatives:** Hard-code a duplicate list only in README — rejected because
  archive needs a capability.

### 3. Paid wording

- **Choice:** One explicit sentence in English README Paid section: plugins are
  **not** separate npm packages; enable via monorepo `plugins:` + license env.
  Mirror in `docs/ja` and `docs/vi`. Keep the existing plugin table and env
  names.
- **Why:** Table alone still looks like “packages you install from npm.”
- **Alternatives:** Publish paid packages privately on npm — out of scope and
  contradicted by current `private: true` packaging.

### 4. Tests without behavior change

- **Choice:** Extend existing CLI/README or docs tests to assert presence of
  stability / Paid-not-on-npm phrases and that help still lists stable
  commands. No new dependencies.
- **Why:** Spec scenarios must be checkable; `pnpm test` stays the gate.
- **Alternatives:** Manual checklist only — too weak for archive.

### 5. Version / CHANGELOG

- **Choice:** Do not bump package version. Optionally add an Unreleased /
  docs-only note under CHANGELOG that this prep landed without a release.
- **Why:** Separates “contract ready” from “1.0 published.”
- **Alternatives:** Ship as `0.2.1` docs patch — optional later if Harry wants a
  registry refresh; not required by this change.

## Risks / Trade-offs

- **[Risk] Docs drift from code after future features** → Mitigation: any
  rename of stable names must update `public-contract` in the same change;
  README points to SemVer major bump.
- **[Risk] Readers think 1.0 is already released** → Mitigation: stability
  section MUST NOT claim 1.0.0 is published while version &lt; 1.0.0.
- **[Risk] Paid wording confuses license buyers** → Mitigation: keep table of
  seven plugins and license env names; only clarify distribution channel.
- **Read-only / local:** Docs-only edits; no source writes; no new network
  clients.

## Migration Plan

1. Apply doc edits on a branch; run `pnpm test`.
2. Archive the change into `openspec/specs/` after review.
3. Later (separate change/release): pilot → bump to `1.0.0` → tag/publish.

Rollback: revert the docs commit; no data migration.

## Open Questions

None for this change. Tagging `1.0.0` remains a separate decision after a real
pilot.
