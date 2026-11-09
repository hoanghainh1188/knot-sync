# @hoanghainh/knot-sync-store-sqlite

SQLite document store with FTS5 trigram search.

## Scaling helpers

- `upsertDocuments(docs, { chunkSize? })` — batched writes (default **500**/tx); used by `knot-sync run`
- `optimize()` — FTS5 `optimize` + `PRAGMA wal_checkpoint(TRUNCATE)`; exposed as `knot-sync optimize`
- Dev load script: `pnpm store:stress` / `pnpm store:stress:smoke` (`scripts/store-load-stress.mjs`)

Part of [KnotSync](https://github.com/hoanghainh1188/knot-sync). See the
repository root README for install and usage.

**License:** Apache-2.0  
**Version:** 0.1.1
