# Proposal: Cryptographic Plugin Licensing

## Why

The seven Paid plugins (`extractor-ocr`, `extractor-housen`, `connector-sql-enterprise`, `auth-oauth`, `catalog-llm`, `search-vector`, and `guard-llm`) currently gate their functionality using a trivial `value.trim() !== ""` check in each plugin's `license.ts`. Any arbitrary non-empty string unlocks Paid features, and there is no licensee identity binding, plugin scoping, expiration control, or standalone Paid plugin distribution artifact. Upgrading to offline Ed25519-signed license tokens verified via Node.js built-in `node:crypto` makes Paid plugin licensing cryptographically enforceable while preserving KnotSync's 100% local, zero-telemetry guarantee and keeping `@hoanghainh/knot-sync-core` completely license-unaware.

## What Changes

- **BREAKING**: Upgrade all seven Paid plugins (`auth-oauth`, `catalog-llm`, `connector-sql-enterprise`, `extractor-housen`, `extractor-ocr`, `guard-llm`, `search-vector`) from non-empty string license checks to offline Ed25519 signature verification against `licensee`, `plugins`, and `exp` claims using `node:crypto`. Arbitrary strings are rejected in production.
- Add an internal, private workspace package `@hoanghainh/knot-sync-plugin-license` (`packages/plugin-license`, `"private": true`) providing Ed25519 token verification, claim validation, actionable failure reasons (`missing`, `malformed`, `invalid_signature`, `expired`, `plugin_not_allowed`), and public key resolution.
- Keep `@hoanghainh/knot-sync-core` and the published free `@hoanghainh/knot-sync` CLI bundle 100% free of license verification logic or Paid license dependencies.
- Gate existing per-plugin test sentinels (`knot-sync-*-dev`) so they succeed ONLY under `node --test` (`NODE_TEST_CONTEXT`) or when `KNOT_SYNC_ALLOW_TEST_LICENSE=1` is explicitly set; reject them by default in normal runtime.
- Add a local operator/vendor CLI script (`scripts/license-tool.mjs`) for offline Ed25519 keypair generation (`keygen`), license token signing (`sign`), and offline token inspection/verification (`verify`). Private signing keys are never committed to the repository.
- Add a distributable Paid plugin bundle script (`scripts/bundle-paid-plugins.mjs`, wired to root `package.json` `bundle:paid` / `pack:paid`) that builds standalone self-contained ESM bundles (`.mjs` + `package.json`, optional `.tgz` tarball) for all seven Paid plugins with workspace and pure-JS dependencies bundled and build-time public key injection supported.
- Update `CLI` error classification if needed without adding license logic to core (ensure `ConfigError` from separately bundled plugins is recognized consistently via `err.name === "ConfigError"`).
- Update `README.md` and `docs/ROADMAP.md` (`cryptographic-plugin-licensing` status and Paid licensing usage instructions).

### Out of Scope

- Online license servers, telemetry, HTTP phone-home checks, or automatic over-the-network renewal (violates KnotSync's strictly offline local-first architecture).
- Remote certificate revocation lists (CRLs) or online token blacklists.
- Hardware/machine fingerprinting, MAC binding, or usage/seat-count metering.
- GUI license entry panels in `@hoanghainh/knot-sync-ui` (deferred beyond v1.0 scope).
- Publishing Paid plugin packages to the public npm registry (`@hoanghainh/knot-sync` remains the single public npm package per `npm-release`).

## Capabilities

### New Capabilities

- `plugin-licensing`: Offline Ed25519 signed license token format, claim validation (`licensee`, `plugins`, `exp`), private Paid-only verifier package, test-sentinel runtime gating, local keygen/signing tooling, and standalone Paid plugin bundle generation.

### Modified Capabilities

- _(None — existing `ocr-docling`, `housen-excel`, `enterprise-sql`, `mcp-oauth`, `catalog-llm`, `vector-search`, `model-guardrails`, `plugin-system`, and `npm-release` specs already require each Paid plugin to validate its own license while keeping core license-unaware, without prescribing a non-empty string heuristic.)_

## Dependencies

- **None** — Zero new third-party dependencies. Cryptographic signing and verification use Node.js built-in `node:crypto` (Ed25519, available in Node >= 22.13). Paid bundle generation reuses the existing root `devDependency` `esbuild` (`Apache-2.0` / `MIT`).

## Impact

- **New workspace package**: `packages/plugin-license` (`@hoanghainh/knot-sync-plugin-license`, `"private": true`).
- **Modified Paid packages (7)**: `packages/auth-oauth`, `packages/catalog-llm`, `packages/connector-sql-enterprise`, `packages/extractor-housen`, `packages/extractor-ocr`, `packages/guard-llm`, `packages/search-vector` (update `license.ts`, `package.json`, `tsconfig.json`, and tests).
- **Modified CLI**: `packages/cli/src/main.ts` (`ConfigError` name fallback check only — remains 100% license-unaware).
- **Unchanged core**: `packages/core` remains completely untouched with zero knowledge of licenses or Paid plugins.
- **New scripts & npm scripts**: `scripts/license-tool.mjs`, `scripts/bundle-paid-plugins.mjs`, `package.json`, `tsconfig.json` project references, `README.md`, `docs/ROADMAP.md`.
