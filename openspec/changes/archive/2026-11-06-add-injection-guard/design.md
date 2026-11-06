# Design: add-injection-guard

## Context

`run` already does extract → clean → PII → upsert. Core has a stub `GuardRule`
(`id` only) and a `guard-rule` registry. See proposal.md for motivation.
Constraints: read-only sources, fully local (no network), no new third-party
deps, plugins only for pipeline features.

## Goals / Non-Goals

**Goals**

- Executable `GuardRule.find`, built-in `packages/guard`, config `guard.mode`.
- Persist `Document.guard` findings + risk; apply flag/strip/block on `run`.
- Best-effort hidden-text channel from the office extractor when styles expose it.

**Non-Goals**

- MCP framing of untrusted content (later `add-mcp-server`).
- Model-based detectors; perfect Office style coverage.

## Decisions

### 1. Package and GuardRule API

Package `packages/guard` (`@hoanghainh/knot-sync-guard`), workspace dep on core
only. Factory `createGuardPlugin(settings: GuardConfig): KnotSyncPlugin`.

```ts
export interface GuardRule {
  id: string;
  find(text: string): Array<{ start: number; end: number }>;
}

export type GuardMode = "flag" | "strip" | "block";
export type GuardRisk = "none" | "low" | "medium" | "high";

export interface GuardFinding {
  rule: string;
  start: number;
  end: number;
}

export interface GuardConfig {
  mode: GuardMode; // default flag
}

export interface Document {
  // ...
  guard: GuardFinding[];
  // risk lives in metadata.guardRisk (string) OR a top-level field —
  // decision: metadata.guardRisk for minimal schema churn, plus Document.guard[]
}
```

**Alternative considered:** top-level `Document.risk`. Rejected for v0.1 to keep
the Document surface close to `pii`; MCP can read `metadata.guardRisk`.

Register **one rule object per id** for `plugins` listing clarity:
`instruction-en`, `instruction-ja`, `instruction-vn`, `controls`, `hidden-text`
(hidden-text may only fire when scanning the hidden metadata channel).

### 2. Pipeline order on run

```
extract → cleaners → pii → guard detect+apply → upsert
```

Guard runs **after** PII so strip/block operate on the same text the agent would
otherwise see (masked PII already applied). On guard apply failure: same error
document pattern as PII (empty content, `status=error`, drop `sourceFileHash`,
strip originals that could carry injection).

**block mode:** if risk is `medium` or `high` (instruction phrases and/or hidden
channel), upsert error/blocked document; keep `Document.guard` and
`metadata.guardRisk` on that row; do not leave ready injected content in
`content`/`tables`. Controls-only (`low`) does not block — too many false
positives on JP/VN Office paste.

### 3. Applying modes

1. Collect findings from all rules on `content`; scan table cells for strip/block
   transforms; scan `metadata.guardHiddenText` (string) for detection only
   (contributes to risk/findings with offsets into that hidden string stored as
   findings with `rule` still set — **decision:** hidden-channel findings use
   offsets into `guardHiddenText` and set `metadata.guardInHidden=true`; content
   findings remain content offsets, same split as PII table handling).
2. Merge overlapping **content** spans (longest, then earliest start).
3. Compute risk: `none` if empty; `low` if only `controls`; `medium` if any
   instruction-* on content; `high` if any hit from hidden channel or multiple
   instruction families.
4. `flag`: set `guard` + `guardRisk`, leave text.
5. `strip`: remove content/table spans and control chars from end→start; clear
   `guardHiddenText` after recording findings; rebuild `hash`.
6. `block`: if findings non-empty, force error upsert path (empty content/tables).

### 4. Rule implementations (no deps)

| Rule id | Approach |
|---------|----------|
| `instruction-en` | Case-insensitive phrases: ignore previous/prior instructions, disregard above, system prompt, you are now, etc. |
| `instruction-ja` | Phrases including `以前の指示を無視`, `以前の命令を無視`, `システムプロンプト` |
| `instruction-vn` | Phrases including `bỏ qua hướng dẫn trước`, `bỏ qua chỉ dẫn trước`, `prompt hệ thống` (NFKC already from cleaner) |
| `controls` | Unicode Cf/bidi: U+200B–U+200F, U+202A–U+202E, U+2060–U+2064, U+FEFF, etc. |
| `hidden-text` | Run instruction + controls detectors on `metadata.guardHiddenText` only |

Phrase lists live as constants in the package; extendable later via custom
plugins, not config regex in v0.1.

### 5. Hidden text from extractor

Metadata key: `guardHiddenText` (string). `extractor-office` **best-effort for
xlsx**: when iterating cells, if exceljs reports `font.hidden` or font color that
is white/near-white on a white/near-white fill (simple ARGB checks), append the
cell string to a hidden buffer (newline-separated). Docx/PDF: leave unset unless
trivial; do not invent hidden text.

Guard never writes sources; extractor only reads workbook bytes.

### 6. Config

Add `guard` to reserved core keys (with `pii`, `cleaning`, …).

```ts
interface GuardConfig {
  mode: "flag" | "strip" | "block";
}
```

Default when omitted: `{ mode: "flag" }`.

### 7. Store

Add `guard_json TEXT NOT NULL` on `documents`. On open, if column missing,
`ALTER TABLE documents ADD COLUMN guard_json TEXT NOT NULL DEFAULT '[]'`.
Serialize `Document.guard` like `pii`. Empty array for legacy rows.

### 8. Read-only / local

Rules and apply touch only in-memory strings and the local SQLite store. No
network. Sources remain read-only.

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| False positives on “system prompt” in legitimate docs | Curated phrase list; `flag` default; operators can strip/block consciously |
| Missed Office hidden styles | Document best-effort; no claim of completeness |
| Existing SQLite DBs without `guard_json` | ALTER on open with default `[]` |
| Strip breaks surrounding JP/VN text | Collapse only `[ \t]{2,}` once after all removals (same lesson as PII drop) |

## Migration Plan

- New installs: schema includes `guard_json`.
- Existing stores: ALTER on next CLI open; re-`run` to populate findings.
- Rollback: remove package/wiring; old column can remain unused.
