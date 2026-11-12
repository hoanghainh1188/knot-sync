# Tasks: Cryptographic Plugin Licensing

## 1. Private License Verifier Package (`@hoanghainh/knot-sync-plugin-license`)

- [x] 1.1 Create private workspace package `packages/plugin-license` (`package.json`, `tsconfig.json`, `README.md`, `LICENSE`) and wire its project reference in root `tsconfig.json` and `pnpm install`; verify `packages/core/package.json` and free packages remain untouched with zero reference to `plugin-license`, and `pnpm build` compiles `packages/plugin-license`.
- [x] 1.2 Implement `KS1.<payloadB64Url>.<sigB64Url>` offline Ed25519 verification (`node:crypto`), payload claim validation (`licensee`, `plugins`, `exp`, `iat`), bundle-injectable public key support (`__KNOT_SYNC_EMBEDDED_PUBLIC_KEY__`), gated test sentinel resolution (`NODE_TEST_CONTEXT` / `KNOT_SYNC_ALLOW_TEST_LICENSE=1`), and actionable safe failure messages in `packages/plugin-license/src/`.
- [x] 1.3 Add `node:test` unit tests in `packages/plugin-license/src/plugin-license.test.ts` covering valid Ed25519 sign/verify, Japanese/Vietnamese UTF-8 `licensee` names, tampered signature/payload, malformed tokens, expired `exp`, plugin mismatch vs wildcard `"*"`, and sentinel rejection when `NODE_TEST_CONTEXT` / `KNOT_SYNC_ALLOW_TEST_LICENSE` are unset; verify tests pass with `node --test packages/plugin-license/dist/plugin-license.test.js`.

## 2. Upgrade Paid Plugins (#1–#7) to Ed25519 Verification

- [x] 2.1 Wire `@hoanghainh/knot-sync-plugin-license` (`workspace:*`) into `extractor-ocr`, `extractor-housen`, `connector-sql-enterprise`, `auth-oauth`, `catalog-llm`, `search-vector`, and `guard-llm` (`package.json`, `tsconfig.json`, and `license.ts`) so each Paid plugin validates signed `KS1` tokens against its canonical plugin ID while keeping existing unit-test sentinels gated cleanly and preserving existing `plugin.ts` public APIs.
- [x] 2.2 Update `packages/cli/src/main.ts` configuration error check to match `(err instanceof ConfigError || (err instanceof Error && err.name === "ConfigError"))` without adding any license awareness to `@hoanghainh/knot-sync-core`; verify with `pnpm build` and confirm `packages/core` contains zero license logic.
- [x] 2.3 Expand `node:test` suites across all seven Paid plugins (`extractor-ocr`, `extractor-housen`, `connector-sql-enterprise`, `auth-oauth`, `catalog-llm`, `search-vector`, `guard-llm`) to assert both gated sentinel behavior and real Ed25519 token pass/fail (valid, expired, wrong plugin, plain string rejection outside test sentinel mode); verify all suites pass under `pnpm test`.

## 3. Local Keygen / Signing Tool & Distributable Paid Bundle Scripts

- [x] 3.1 Create offline `scripts/license-tool.mjs` supporting `keygen`, `sign`, and `verify` subcommands via `node:crypto`, and update `.gitignore` so private signing keys (`*.license-private.pem`, `license-private.pem`, `.keys/`) and `dist/paid-plugins/` are ignored; verify `keygen` -> `sign` -> `verify` round-trip succeeds locally.
- [x] 3.2 Create `scripts/bundle-paid-plugins.mjs` and wire `bundle:paid` / `pack:paid` scripts in root `package.json` to output standalone self-contained ESM bundles (with optional `--public-key <file>` injection and `--pack` `.tgz` generation) under `dist/paid-plugins/<plugin>/` while keeping `packages/cli` free bundle (`pnpm bundle:cli`) unchanged.
- [x] 3.3 Add `node:test` integration tests in `scripts/cryptographic-licensing.test.mjs` verifying offline `license-tool.mjs` (`keygen`, `sign`, `verify` with JA/VI `licensee` names and expired failure exit code), standalone `bundle-paid-plugins.mjs` generation with an injected Ed25519 public key, dynamic `import()` of bundled Paid plugin `.mjs` artifacts, and verification that `bundle:cli` excludes `plugin-license` and Paid plugins; run `node --test scripts/cryptographic-licensing.test.mjs`.

## 4. Full Verification & Documentation

- [x] 4.1 Run full `pnpm test`, `pnpm licenses:check`, and `pnpm bundle:cli` to confirm all tests pass, zero GPL/AGPL dependencies exist, and the free CLI bundle remains license-unaware.
- [x] 4.2 Update `README.md` (Paid plugin licensing with signed `KS1` tokens, local `bundle:paid` / `license-tool.mjs` usage, and explicit note that core stays license-unaware) and update `docs/ROADMAP.md` (`cryptographic-plugin-licensing` status) so documented commands and statuses match implemented behavior.
