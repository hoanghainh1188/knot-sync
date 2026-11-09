# Tasks

## 1. Store batch upserts

- [x] 1.1 Add `DEFAULT_UPSERT_CHUNK = 500` and `Store.upsertDocuments(docs,
      options?)` using chunked `tx()` + shared insert SQL — verify unit tests
      batch Japanese docs then `search("請求書")` hits
- [x] 1.2 Cover mid-batch failure: throw inside a chunk rolls back that
      transaction only — verify in `store.test.ts`; run store package tests
- [x] 1.3 Update `knot-sync run` to buffer upserts and flush via
      `upsertDocuments` — verify existing CLI/run tests still pass (add a small
      assertion if needed)

## 2. Store optimize + CLI

- [x] 2.1 Add `Store.optimize()` running FTS5 `optimize` and
      `PRAGMA wal_checkpoint(TRUNCATE)` — verify with a store containing JP
      content that search still works after optimize
- [x] 2.2 Add `knot-sync optimize` command (parseArgs, help, exit codes) wired
      to config + `Store.optimize()` — verify help lists `optimize` and missing
      store exits 1 with actionable text
- [x] 2.3 Add en/ja/vi i18n strings for optimize help/success/errors — verify
      `--lang ja` / `--lang vi` show localized prose with English command token

## 3. Load/stress script and docs

- [x] 3.1 Add offline `scripts/store-load-stress` (or equivalent) generating
      ≥50k docs with JP/VN titles, searching, printing latency/memory; add
      opt-in `pnpm` script — verify script `--help`/`--count` and a short smoke
      with small `--count` in a node:test or documented manual check
- [x] 3.2 Update root README / package docs for `optimize` and batching; mark
      `scale-sqlite-store` done in `docs/ROADMAP.md`
- [x] 3.3 Run full `pnpm test` and confirm all suites pass

## Workflow follow-up

- Archive with `/opsx:archive scale-sqlite-store` after apply review
- Commit / PR when Harry asks
