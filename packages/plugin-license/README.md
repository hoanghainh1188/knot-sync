# @hoanghainh/knot-sync-plugin-license

Internal offline Ed25519 license token verification package used exclusively by KnotSync Paid plugins (`auth-oauth`, `catalog-llm`, `connector-sql-enterprise`, `extractor-housen`, `extractor-ocr`, `guard-llm`, `search-vector`).

- **Core remains 100% license-unaware**: `@hoanghainh/knot-sync-core` and the published `@hoanghainh/knot-sync` free CLI bundle never import or depend on this package.
- **Offline verification**: Uses Node.js built-in `node:crypto` Ed25519 signatures over `KS1.<payloadB64Url>.<sigB64Url>` tokens with zero network calls and zero third-party dependencies.
- **Private workspace package**: Bundled into each standalone Paid plugin deliverable by `scripts/bundle-paid-plugins.mjs`.
