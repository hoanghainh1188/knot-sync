# Design: add-ja-vi-cleaning

## Context

`knot-sync run` already extracts Office/text into `Document` and upserts to
SQLite. The plugin host registers `Cleaner` stubs. Roadmap item
`cleaner-ja-vi` requires JP/VN normalization after extract, before PII/guard,
with original text retained and rough token metrics for a future `bench`.

Constraints from product rules: no network, no writes to sources, no new
third-party deps, Node ≥ 22.13 built-ins + workspace only, English CLI text.

**Read-only / local:** Cleaners only transform in-memory `Document` fields and
metadata written to the local SQLite store. They never open write handles on
source paths, never call `fetch`/HTTP, and introduce no telemetry.

## Goals / Non-Goals

**Goals**

- Built-in cleaner plugin with config toggles under `cleaning:`.
- Deterministic, pure-string transforms on `content` and table cell strings.
- Keep pre-clean text + token estimates on the stored document.
- Wire CLI `run` to call cleaners after successful extract.

**Non-Goals**

- Vendor tokenizers / `bench` CLI.
- OCR, binary re-decoding of Shift_JIS file bytes (extractors already produce
  Unicode strings).
- Layout reconstruction or paid 方眼紙 features.
- PII / injection plugins.

## Decisions

### 1. Package layout

`packages/cleaner-ja-vi` mirrors `extractor-office`: ESM, NodeNext, tests as
`*.test.ts`, depends on `@hoanghainh/knot-sync-core` via `workspace:*` only.

Export: `createJaViCleaner(settings?: CleaningSettings): Cleaner` and/or a
default plugin object `{ id: 'cleaner-ja-vi', clean }`.

### 2. Cleaner API shape

Extend core types so `Cleaner` is:

```ts
export interface Cleaner {
  readonly id: string;
  clean(document: Document): Document | Promise<Document>;
}
```

Host iterates `registry.cleaners` after extract; each result feeds the next.
Settings come from `config.cleaning` passed when constructing the built-in
(not from per-call args), so the CLI builds the cleaner with loaded config.

### 3. Original text and tokens

Convention (document metadata, no schema migration required if metadata is a
JSON blob today):

| Key | Meaning |
|-----|---------|
| `originalContent` | Extracted `content` before this cleaner ran (set once by ja-vi cleaner if absent) |
| `tokensBefore` | Estimate on text entering the cleaner |
| `tokensAfter` | Estimate on text after all enabled steps |

Table originals: optional `originalTables` JSON in metadata only if tables
changed; otherwise leave tables mutated in place and rely on `originalContent`
for body text. Prefer storing stringified tables snapshot when any cell changes
so traceability covers sheets.

Token heuristic (documented for `bench` later):

```
tokens ≈ ceil(codepoints / 4)
```

for the concatenated cleaned/original plain text (content + cell strings).
Not a Tiktoken clone; good enough for before/after ratios.

### 4. Step order

Apply enabled steps in fixed order:

1. `legacyVietnamese` — convert TCVN3/VNI → Unicode first so later NFKC sees
   real letters.
2. `nfkc` — `content.normalize('NFKC')` (and cells).
3. `wareki` — era → Gregorian, emit `YYYY-MM-DD` or year-only as appropriate.
4. `datesIso` — remaining Western/JP numeric date patterns → ISO.
5. `tokenReduce` — whitespace, empty rows, repeated headers/footers.

Order matters: legacy fonts before NFKC; wareki before generic dates so
`令和5年4月1日` becomes one ISO date rather than a broken partial match.

### 5. Wareki

Hard-code era start dates (civil calendar):

| Era | Start |
|-----|-------|
| 明治 | 1868-01-25 |
| 大正 | 1912-07-30 |
| 昭和 | 1926-12-25 |
| 平成 | 1989-01-08 |
| 令和 | 2019-05-01 |

Parse patterns like `令和\s*(\d+|元|[一二三四五六七八九十百]+)\s*年(?:\s*(\d+|[…])\s*月(?:\s*(\d+|[…])\s*日)?)?`.
`元` → 1. Kanji numerals: implement a small recursive/greedy parser for 1–99
(enough for era years); leave exotic forms unchanged.

Gregorian conversion: eraYear 1 maps to start year; add `(eraYear - 1)` to
start year, then apply month/day if present (clamp invalid dates → leave
match unchanged).

### 6. ISO dates

After wareki, regex-replace:

- `\d{4}[/-]\d{1,2}[/-]\d{1,2}` → zero-padded ISO
- `\d{4}年\d{1,2}月\d{1,2}日`
- Ambiguous `DD/MM/YYYY` vs `MM/DD/YYYY`: if day > 12 treat as DMY; if month
  > 12 treat as MDY; if both ≤ 12 leave unchanged (no locale guess).

### 7. TCVN3 / VNI

Maintain static char maps (TCVN3 and VNI Windows-ish glyph → Unicode) as
TypeScript const records in-repo (no deps). Detection: score how many mapped
legacy code points appear vs Vietnamese Unicode already present; convert only
if legacy score exceeds threshold (e.g. ≥ 3 mapped chars and legacy > unicode
diacritic count). Dual false positives: skip conversion.

### 8. Token reduction heuristics

- Replace `[ \t]+` with single space; collapse `(\r?\n){3,}` → `\n\n`.
- Tables: drop rows where every cell is empty/whitespace; drop trailing empty
  columns only if entire column empty across all rows.
- Repeated headers: split content on form-feed `\f` or lines equal to
  `---`/`___` page markers if present; otherwise split on `\n\n\n`. Among
  segments, if the first line of ≥3 segments is identical, strip that line
  from segments after the first. Same for last line → footer. If <3 segments,
  no strip.

### 9. Config types

```ts
export interface CleaningConfig {
  nfkc?: boolean;
  wareki?: boolean;
  datesIso?: boolean;
  legacyVietnamese?: boolean;
  tokenReduce?: boolean;
}
```

Normalize to all-`true` defaults in loader when section missing or key omitted.

### 10. CLI wiring

In `run` command after extract success:

```ts
let doc = extracted;
for (const cleaner of registry.cleaners) {
  doc = await cleaner.clean(doc);
}
await store.upsertDocument(doc);
```

Register `createJaViCleaner(config.cleaning)` in the default plugin list next
to extractors.

### 11. Errors

Wrap cleaner invocation in try/catch; on failure set `status: 'error'`,
`errorMessage` explaining step/plugin id and suggesting `cleaning:` toggles or
retry. Still upsert error document when that matches existing extract-error
behavior.

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| Ambiguous `01/02/2024` | Leave unchanged |
| VNI/TCVN3 false positive | Confidence threshold; tests with mixed Unicode |
| Metadata size (`originalContent`) | Accept duplicate text; documents are already full-text in FTS |
| Kanji numeral gaps | Leave unmatched substrings; extend tests as fixtures grow |
| NFKC changing meaning of some JP chars | Toggle `nfkc: false`; document in README |

## Migration Plan

No DB migration. Existing rows without `originalContent` stay as-is until next
`run` re-extracts/cleans. Operators re-run `knot-sync run` after upgrade.

## Open Questions

Resolved for this change:

- Token formula → codepoint/4.
- Original storage → metadata keys above.
- No new npm deps.

Deferred: exact tokenizer alignment when `bench` lands.
