# Tasks

## 1. PII: MST and bank-account rules

- [x] 1.1 Add `mst-vn` rule in `packages/pii-basic` for 10-digit enterprise and
      13-digit branch MST (ASCII digit mapping, hyphen optional); register in
      `ALL_RULES` — verify with unit cases for `0312345678` and `0312345678-001`
- [x] 1.2 Add `bank-account` rule requiring nearby JP/VN/EN account labels and
      an 8–16 digit run; register in `ALL_RULES` — verify `Số tài khoản: …` and
      `口座番号: …` hit, and bare digits without a label do not
- [x] 1.3 Extend `pii-basic.test.ts` for overlap preference vs `my-number` /
      `cccd` / `credit-card` where spans collide — verify `pnpm --filter
      @hoanghainh/knot-sync-pii-basic test` (or repo `pnpm test`) passes new cases

## 2. PII: Label-gated person-name heuristics

- [x] 2.1 Add curated JP/VN name token lists and `person-name` rule that matches
      only near name labels (`氏名`, `Họ tên`, …) — verify `Họ tên: Nguyễn Văn An`
      and `氏名: 山田 太郎` produce findings
- [x] 2.2 Negative cases: dictionary tokens without labels must not match —
      verify in `pii-basic.test.ts`; run package/repo tests

## 3. Guard: Base64, markdown exfil, control flood

- [x] 3.1 Add `base64-payload` rule (min length constant, charset check) to
      `packages/guard` and register it — verify long Base64 hits and short tokens
      do not
- [x] 3.2 Add `md-exfil` for `![…](http…)` and `[…](http…)` with no network I/O —
      verify image and link cases in `guard.test.ts`
- [x] 3.3 Add `controls-flood` (sliding-window threshold) distinct from
      per-character `controls` — verify flood elevates risk vs a single ZW;
      run guard/package tests

## 4. Docs and roadmap

- [x] 4.1 Document new rule ids in `packages/pii-basic/README.md` and
      `packages/guard/README.md` (and root README if it lists rules) — verify
      docs mention MST, bank-account, person-name, base64-payload, md-exfil,
      controls-flood
- [x] 4.2 Mark `enhance-pii-guard` done in `docs/ROADMAP.md` — verify table status
- [x] 4.3 Run full `pnpm test` and confirm all suites pass

## Workflow follow-up

- Archive with `/opsx:archive enhance-pii-guard` after apply review
- Commit / PR when Harry asks
