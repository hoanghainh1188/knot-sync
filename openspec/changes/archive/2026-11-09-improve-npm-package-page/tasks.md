# Tasks

## 1. Registry metadata and README sync

- [x] 1.1 Add `repository` and `homepage` to `packages/cli/package.json` (GitHub
      `hoanghainh1188/knot-sync`); optionally tighten `description` / `keywords`
      without unverified percentages — verify fields with
      `node -e "console.log(require('./packages/cli/package.json').repository)"`
- [x] 1.2 Update `scripts/bundle-cli.mjs` (and/or
      `scripts/with-cli-publish-manifest.mjs`) to copy root `README.md` into
      `packages/cli/README.md` before pack; fix relative lang links in root
      README to absolute GitHub URLs if they would break on npmjs — verify by
      running the copy path and confirming `packages/cli/README.md` matches
      root substance (Quickstart + JP/VN mentions)
- [x] 1.3 Extend `packages/cli/src/pack-publish.test.ts` so the packed tarball
      asserts README markers (`Quickstart`, `npx @hoanghainh/knot-sync`,
      Japanese/Vietnamese cues) and packed `package.json` retains `repository`
      + `homepage` — verify with `pnpm test` (or the CLI pack test file)

## 2. Version bump and docs

- [x] 2.1 Bump `@hoanghainh/knot-sync` to `0.1.2` (and any mirrored version
      strings / npm-release spec mentions that still hard-code `0.1.1`) —
      verify `packages/cli/package.json` version is `0.1.2` and
      `knot-sync --version` after build prints `0.1.2`
- [x] 2.2 Add a `CHANGELOG.md` entry for `0.1.2` (npm page README + metadata)
      and update `docs/ROADMAP.md` / root `README.md` status notes for this
      change — verify changelog names the npm README improvement
- [x] 2.3 Run full `pnpm test` and confirm pack test + existing suites pass

## Workflow follow-up

- After merge: tag `v0.1.2` for trusted-publisher publish; verify npmjs shows
  the full README and `npx @hoanghainh/knot-sync@0.1.2 --version`.
- Archive the change with `/opsx:archive` once landed.
