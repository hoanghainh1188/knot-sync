## ADDED Requirements

### Requirement: Offline Ed25519 token verification

Paid plugins SHALL validate license strings offline using Ed25519 signatures via Node.js built-in `node:crypto` with zero network calls or new third-party dependencies. Tokens MUST use the versioned `KS1.<payloadB64Url>.<sigB64Url>` format, signing and verifying the exact ASCII bytes of `<payloadB64Url>`.

#### Scenario: Valid Ed25519 token passes verification offline

- **GIVEN** a Paid plugin (`extractor-ocr`) configured with a valid `KS1` token signed by the matching Ed25519 private key for `"Công ty Thử Nghiệm"` and plugin `"extractor-ocr"`
- **WHEN** the plugin validates its license locally with no network access
- **THEN** verification succeeds and returns licensee `"Công ty Thử Nghiệm"`
- **AND** customer source folders remain unmodified

#### Scenario: Tampered or malformed token is rejected

- **GIVEN** a `KS1` token whose `<payloadB64Url>` was altered after signing or whose signature is invalid
- **WHEN** a Paid plugin validates the token
- **THEN** verification fails with an invalid signature or malformed reason
- **AND** arbitrary plain text strings fail verification in production mode

### Requirement: License payload claims and plugin scoping

A verified `KS1` payload MUST be a JSON object containing a non-empty `licensee` string, a non-empty string array `plugins`, and a finite positive Unix-epoch `exp` timestamp (seconds). Verification SHALL succeed only when current time is strictly before `exp` and `plugins` includes either the checking plugin ID or `"*"`.

#### Scenario: Japanese licensee with single-plugin grant enforced

- **GIVEN** a valid signed token with `licensee` `"株式会社サンプル"`, `plugins: ["extractor-ocr"]`, and future `exp`
- **WHEN** `extractor-ocr` and `extractor-housen` verify that same token
- **THEN** `extractor-ocr` accepts the license
- **AND** `extractor-housen` rejects the license as not granted for `extractor-housen`

#### Scenario: Wildcard grant unlocks multiple Paid plugins

- **GIVEN** a valid signed token with `plugins: ["*"]` and future `exp`
- **WHEN** `auth-oauth` and `search-vector` validate the token
- **THEN** both plugins accept the license

#### Scenario: Expired token fails validation

- **GIVEN** a cryptographically valid signed token whose `exp` timestamp is in the past
- **WHEN** a Paid plugin validates its license
- **THEN** verification fails with an expired reason

### Requirement: Core remains license-unaware

`@hoanghainh/knot-sync-core` and free built-in plugins MUST NOT import, reference, or invoke license verification logic or depend on the internal license helper package. Shared license verification SHALL live in a private workspace package (`@hoanghainh/knot-sync-plugin-license`) consumed exclusively by Paid plugins.

#### Scenario: Core and CLI bundle exclude Paid license code

- **GIVEN** `@hoanghainh/knot-sync-core` `package.json` and bundled CLI output (`packages/cli/dist/bin.js`)
- **WHEN** dependencies and core exports are inspected
- **THEN** `@hoanghainh/knot-sync-core` has zero dependency on `@hoanghainh/knot-sync-plugin-license` and exposes no license verification APIs

### Requirement: Gated test sentinel support

Legacy test sentinels (`knot-sync-*-dev`) MUST pass validation only when `NODE_TEST_CONTEXT` is set or `KNOT_SYNC_ALLOW_TEST_LICENSE=1` is explicitly configured in the environment. Default production execution without those flags MUST reject test sentinels just like any unsigned string.

#### Scenario: Unit test sentinel works inside Node test runner

- **GIVEN** a test running via `node --test` (`NODE_TEST_CONTEXT` set) passing `knot-sync-ocr-dev`
- **WHEN** `extractor-ocr` checks its license
- **THEN** license validation succeeds without requiring an Ed25519 key

#### Scenario: Test sentinel rejected in normal production runtime

- **GIVEN** a runtime environment where neither `NODE_TEST_CONTEXT` nor `KNOT_SYNC_ALLOW_TEST_LICENSE=1` is set
- **WHEN** a Paid plugin receives `"knot-sync-ocr-dev"` as its license key
- **THEN** validation fails with missing/invalid license guidance

### Requirement: Actionable verification failure diagnostics

License failure messages produced by Paid plugins MUST distinguish failure reasons (`missing`, `malformed`, `invalid_signature`, `expired`, `plugin_not_allowed`), name the expected environment variable and config `licenseKey` setting, and MUST NEVER log raw token signatures, private keys, or customer file contents.

#### Scenario: Expired token gives safe actionable guidance

- **GIVEN** an expired `KS1` token configured via `KNOT_SYNC_SQL_ENTERPRISE_LICENSE`
- **WHEN** `connector-sql-enterprise` fails license validation
- **THEN** the error mentions expiration and references `KNOT_SYNC_SQL_ENTERPRISE_LICENSE` / `connector-sql-enterprise.licenseKey`
- **AND** raw token contents are not echoed in the message

### Requirement: Local keygen and license signing CLI

The repository SHALL provide a local CLI script (`scripts/license-tool.mjs`) supporting offline Ed25519 `keygen`, `sign`, and `verify` operations using `node:crypto` without network access. Private keys generated for production issuance MUST remain untracked and never committed to git.

#### Scenario: Operator generates keys, signs, and verifies offline

- **WHEN** running `keygen`, `sign` (`--licensee "Công ty ABC" --plugins extractor-ocr --days 365`), and `verify` subcommands locally
- **THEN** a valid `KS1` token is emitted and passes offline `verify` with licensee `"Công ty ABC"` and expected expiry

### Requirement: Distributable Paid plugin bundling

The repository SHALL provide a build script (`scripts/bundle-paid-plugins.mjs`) that bundles all seven Paid plugins into standalone distributable ESM bundles (`index.mjs` and `package.json`, with optional `.tgz` archive) with workspace and pure-JS dependencies bundled, supporting build-time public key injection while leaving `@hoanghainh/knot-sync` npm package contents free-only.

#### Scenario: Distributable bundle runs with injected public key

- **WHEN** Paid plugins are bundled with a custom Ed25519 SPKI public key
- **THEN** each Paid plugin produces a standalone bundle in the Paid dist directory
- **AND** loading that bundle via KnotSync `plugins:` validates tokens signed by the matching private key
