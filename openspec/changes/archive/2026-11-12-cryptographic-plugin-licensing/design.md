# Design: Cryptographic Plugin Licensing

## Context

KnotSync's seven Paid plugins currently perform independent `value.trim() !== ""` checks in per-plugin `license.ts` files (`auth-oauth`, `catalog-llm`, `connector-sql-enterprise`, `extractor-housen`, `extractor-ocr`, `guard-llm`, `search-vector`). Per `openspec/specs/plugin-system/spec.md` and `openspec/config.yaml`, `@hoanghainh/knot-sync-core` MUST NEVER check licenses or import license code. Meanwhile, Paid plugins currently declare `workspace:*` dependencies, preventing operators from loading them standalone outside the monorepo without a bundling step. See `proposal.md` for motivation and scope.

## Goals / Non-Goals

**Goals:**
- Provide cryptographically verifiable offline Ed25519 tokens (`KS1.<payloadB64Url>.<sigB64Url>`) using Node.js built-in `node:crypto` only.
- Extract shared license token parsing, signature checking, claim verification, and diagnostic formatting into a private workspace package (`@hoanghainh/knot-sync-plugin-license`) used ONLY by the 7 Paid plugins.
- Keep `@hoanghainh/knot-sync-core`, built-in plugins, and `@hoanghainh/knot-sync` (npm free CLI tarball) 100% license-unaware.
- Preserve existing per-plugin test sentinels strictly for automated tests (`NODE_TEST_CONTEXT` or `KNOT_SYNC_ALLOW_TEST_LICENSE=1`).
- Provide offline `scripts/license-tool.mjs` (`keygen`, `sign`, `verify`) and `scripts/bundle-paid-plugins.mjs` for standalone distribution.
- Preserve strict **read-only** customer source access and **100% offline/local** runtime operation.

**Non-Goals:**
- Online verification endpoints, license servers, telemetry, revocation APIs, or GUI license dialogs.
- Hardware binding or usage metering.
- Publishing Paid packages to public npm.

## Decisions

### 1. Token Format (`KS1`) & Signing Scheme
- **Format**: `KS1.<payloadB64Url>.<sigB64Url>`
  - Prefix `KS1.` explicitly versions the token format so malformed strings and test sentinels fail fast before decoding, and future versions (`KS2`) remain possible.
  - `<payloadB64Url>`: unpadded base64url of compact UTF-8 JSON:
    ```json
    {
      "licensee": "Công ty ABC",
      "plugins": ["extractor-ocr", "extractor-housen"],
      "exp": 1893456000,
      "iat": 1762900000
    }
    ```
  - `<sigB64Url>`: unpadded base64url of 64-byte Ed25519 signature computed over exact ASCII bytes `Buffer.from(payloadB64Url, "utf8")` via `crypto.sign(null, messageBytes, privateKey)`.
- **Why sign `payloadB64Url` bytes rather than parsed JSON?** Signing the encoded segment eliminates canonical-JSON re-serialization bugs across locales, Unicode strings (Japanese/Vietnamese `licensee`), and key ordering.
- **Claims**:
  - `licensee`: non-empty string after trim.
  - `plugins`: non-empty `string[]`; verification passes only when `plugins.includes(pluginId)` or `plugins.includes("*")`, where `pluginId` matches each Paid plugin's canonical name (`auth-oauth`, `catalog-llm`, `connector-sql-enterprise`, `extractor-housen`, `extractor-ocr`, `guard-llm`, `search-vector`).
  - `exp`: finite positive number (Unix epoch seconds). Token is valid only when `nowSeconds < exp` (`nowSeconds = Math.floor(nowMs / 1000)`).
  - `iat`: optional finite non-negative number (Unix epoch seconds).

### 2. Shared Private Verifier Package (Zero Core Contamination)
- **Choice**: Create `packages/plugin-license` (`@hoanghainh/knot-sync-plugin-license`, `"private": true`) exporting:
  - `verifyLicenseToken(token, options)` → structured discriminated result `{ valid: true, licensee, plugins, exp, iat? }` or `{ valid: false, reason, detail }` (`reason`: `"missing" | "malformed" | "invalid_signature" | "expired" | "plugin_not_allowed"`).
  - `resolveAndVerifyPluginLicense(options)` handling lookup (`settings.licenseKey` then `env[settings.licenseEnv]`), gated test-sentinel check, Ed25519 verification, and standardized actionable error formatting.
  - `DEFAULT_LICENSE_PUBLIC_KEY_PEM` (defined via build-time injectable placeholder or env override `KNOT_SYNC_LICENSE_PUBLIC_KEY` / explicit `publicKey` parameter for tests — see Decision 3).
- **Why a separate workspace package vs adding to `@hoanghainh/knot-sync-core`?** `core` MUST remain 100% license-unaware per OpenSpec architecture rules. Having `@hoanghainh/knot-sync-plugin-license` depended on ONLY by the 7 Paid `package.json` files guarantees `core`, free built-ins, and `packages/cli` free bundle (`bundle-cli.mjs`) never import or bundle a single byte of license code.
- **Why vs duplicating crypto code in 7 files?** Single verifier guarantees uniform signature, expiration, base64url parsing, and constant-safe diagnostics across all 7 plugins with zero code duplication.

### 3. Key Management & Public Key Resolution
- **Private key**: Generated locally via `node scripts/license-tool.mjs keygen --out-dir <path>`. Operators/maintainers keep private keys outside the repo (add `.keys/` / `*.license-key.pem` patterns to `.gitignore` and never commit private keys).
- **Public key resolution priority** in Paid plugin verifier:
  1. Explicit `options.publicKey` parameter (unit tests pass ephemeral test SPKI PEM or `KeyObject`).
  2. Bundle-injected public key (`__KNOT_SYNC_EMBEDDED_PUBLIC_KEY__` substituted via `esbuild` `define` during `scripts/bundle-paid-plugins.mjs --public-key <pem-file>` or `KNOT_SYNC_LICENSE_PUBLIC_KEY_FILE` env var).
  3. Monorepo development public key constant fallback / optional test-mode env override (`KNOT_SYNC_LICENSE_PUBLIC_KEY` only honored when set by operator or tests for self-hosted custom keypairs? Decision: keep bundled vendor public key as default in production and allow `options.publicKey` in tests plus bundle-time replacement! Supporting an unverified env override of the public key in production would let any user replace the public key with their own self-signed key — **DO NOT** allow env public-key override in production unless `NODE_TEST_CONTEXT` or `KNOT_SYNC_ALLOW_TEST_LICENSE=1`!).
- **CRITICAL security invariant**: Never commit a working private key to the repo. When `bundle-paid-plugins.mjs` runs for a commercial release, it requires `--public-key <file>` (or `KNOT_SYNC_LICENSE_PUBLIC_KEY_FILE`) — or cleanly embeds a clearly labeled dev/non-commercial default public key with a warning unless `--public-key` is supplied — so public source never leaks a production signing key while local builds still bundle cleanly.

### 4. Test Sentinel Gating
- Existing constants (`OCR_TEST_LICENSE_SENTINEL`, etc.) and exports stay intact so all existing unit test imports compile unchanged.
- `resolveAndVerifyPluginLicense` accepts `value === testSentinel` ONLY when:
  - `process.env.NODE_TEST_CONTEXT !== undefined` (set automatically by `node --test`), OR
  - `env.KNOT_SYNC_ALLOW_TEST_LICENSE === "1"`.
- In standard production CLI/server execution (neither variable set), `value === "knot-sync-ocr-dev"` falls through to Ed25519 token verification, fails with `malformed`, and is rejected cleanly.

### 5. CLI Compatibility Without Core License Awareness
- `packages/cli/src/main.ts` currently classifies configuration errors via `if (err instanceof ConfigError)`. When a Paid plugin is loaded from a standalone bundle (`.mjs`) that bundled its own copy of `@hoanghainh/knot-sync-core`, throwing its bundled `ConfigError` fails cross-realm `instanceof ConfigError` checks in CLI!
- **Minimal fix**: In `packages/cli/src/main.ts`, treat `(err instanceof ConfigError || (err instanceof Error && err.name === "ConfigError"))` identically as a config error. This touches zero license logic and keeps core completely generic.

### 6. Local Keygen & Distributable Bundle Scripts
- **`scripts/license-tool.mjs`**: Zero-dependency Node script (`node:crypto`, `node:fs`, `node:util` `parseArgs`):
  - `keygen --out <dir>` → writes `license-private.pem` (`0o600` mode, PKCS8) and `license-public.pem` (SPKI).
  - `sign --private-key <path> --licensee <name> --plugins <id1,id2|*> (--exp <unix> | --days <n>)` → prints `KS1.<payload>.<sig>`.
  - `verify --public-key <path> --token <token> [--plugin <id>]` → exits 0 with decoded JSON on valid token, non-zero with exact failure reason otherwise.
- **`scripts/bundle-paid-plugins.mjs`**:
  - Iterates all 7 Paid plugins, compiles ESM bundles with `esbuild` targeting `node22`, format `esm`:
    - Bundles all `@hoanghainh/knot-sync-*` workspace deps AND pure-JS third-party deps (`jose`, `exceljs`, `tedious`), injecting `createRequire` banner for CJS interop (`tedious` / `exceljs`), keeping only `node:*` built-ins external.
    - Injects `--public-key <path>` via `esbuild` `define` if provided.
    - Emits `dist/paid-plugins/<plugin>/index.mjs`, standalone `package.json` (`"main": "./index.mjs"`, `"type": "module"`, `"private": true`), `LICENSE` note, and optional `--pack` flag running `npm pack` to produce `<plugin>-<version>.tgz`.
  - Runs outside `packages/cli/dist/` so `bundle:cli` / `pack:cli` npm tarballs never include Paid plugin bundles.

### 7. Read-Only & Fully-Local Guarantees
- **Read-only**: All signature checks operate strictly in memory on license strings; customer document roots and SQL sources are never touched.
- **Fully local**: Zero HTTP calls, zero NTP lookups, zero telemetry, zero remote JWKS/revocation calls during license check. Keygen and signing scripts run 100% offline.

## Risks / Trade-offs

- **[Risk] Clock skew on offline hosts** → Accept Unix seconds comparison (`nowSeconds < exp`) cleanly; recommend generous enterprise expiry dates (e.g., +365 days) in `license-tool.mjs` defaults and clearly report UTC expiration timestamp on `expired` failures.
- **[Risk] CJS dynamic `require()` inside bundled `exceljs` or `tedious`** → Inject standard ESM `createRequire(import.meta.url)` banner in `bundle-paid-plugins.mjs` and add an automated test in the task plan that actually `import()`s each generated `dist/paid-plugins/*/index.mjs` standalone bundle and verifies plugin registration + Ed25519 token check!
- **[Risk] Accidental private key commit** → Add key patterns (`*.license-private.pem`, `.keys/`, `license-private.pem`) to `.gitignore` and never generate keys inside git-tracked directories in tests (`os.tmpdir()` only).

## Migration Plan

1. Add `@hoanghainh/knot-sync-plugin-license` and wire workspace references.
2. Migrate all 7 Paid plugins to use `@hoanghainh/knot-sync-plugin-license`; existing `node --test` suites continue passing via gated test sentinels, plus add Ed25519 positive/negative tests (valid, expired, wrong-plugin, tampered, JA/VI licensee, production-mode sentinel rejection) to every plugin suite.
3. Add `scripts/license-tool.mjs` and `scripts/bundle-paid-plugins.mjs` with dedicated tests including importing bundled standalone `.mjs` outputs.
4. Update `README.md` (Paid plugin license token usage) and `docs/ROADMAP.md` (`cryptographic-plugin-licensing` -> `done`).
5. Backward-compatibility note in release notes / `README.md`: plain placeholder strings previously accepted by Paid plugins will be rejected after this change; operators must obtain a signed `KS1` license token (or set `KNOT_SYNC_ALLOW_TEST_LICENSE=1` exclusively for local dev testing with `knot-sync-*-dev`).
