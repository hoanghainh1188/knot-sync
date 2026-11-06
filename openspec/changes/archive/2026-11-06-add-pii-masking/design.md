# Design: add-pii-masking

## Context

`run` already extracts then cleans into `Document` before upsert. `PiiFinding`
and stub `PiiRule` exist in core. Product rules require PII to be maskable
before store/MCP, fully local, read-only on sources, no new native deps.

## Goals / Non-Goals

**Goals**

- Built-in `pii-basic` plugin with the six rule families from the proposal.
- Config `pii.mode` + optional salt path; apply after cleaners on `run`.
- Persist findings without raw values; never store unmasked PII.
- `scan --pii` estimate only.

**Non-Goals**

- NER / LLM detectors, reversible vault, HTML report chrome (later changes).

## Decisions

### 1. Package and plugin API

`packages/pii-basic` mirrors `cleaner-ja-vi`: workspace dep on core only.

```ts
export interface PiiRule {
  id: string;
  find(text: string): Array<{ start: number; end: number }>;
}
```

Host sets `rule` on each finding from the registration id. Plugin registers one
rule object per id (`email`, `phone-jp`, …) or one composite — prefer **one
registration per rule id** for `plugins` listing clarity.

Factory: `createPiiBasicPlugin(settings: PiiConfig): KnotSyncPlugin`.

### 2. Pipeline order on run

```
extract → cleaners → pii detect+apply → upsert
```

On PII failure: upsert error document without unmasked content (prefer empty
content + `metadata.status=error` + message), drop `sourceFileHash` so retry
works (same pattern as cleaner errors).

### 3. Applying modes

1. Collect findings from all rules on `content`, then on each table cell
   (record cell path in design only if needed; v0.1: re-scan cell strings and
   store findings only for `content` offsets OR flatten findings with
   content-relative offsets only — **decision:** run rules on `content` and on
   a synthetic join of table cells for detection, but apply transforms to
   `content` and each cell independently; `Document.pii` lists content-offset
   findings first; for table-only hits, use offsets into that cell and set
   `metadata.piiInTables: true` without storing cell coordinates of raw text.
   Simpler v0.1: **findings only for `content`**; still mask table cells in
   place without adding per-cell findings. Spec requires findings with
   positions — content is enough for MCP; tables still masked.

2. Merge overlapping content spans (longest wins, then earliest start).
3. Apply mode from end to start so offsets stay valid.
4. Rebuild `hash` with `sha256` of final content.

**mask:** replace span with `***` (cards: `****-****-****-` + last 4 if length ≥ 12).  
**hash:** `pii_` + base64url(hmac-sha256(salt, utf8(span))).slice(0, 16).  
**drop:** delete span; collapse spaces left behind with a light trim of
`[ \t]{2,}` around the hole.

### 4. Rule implementations (no deps)

| Rule | Approach |
|------|----------|
| email | Practical RFC-like regex; NFKC text already from cleaner |
| phone-jp | Patterns for 0X-XXXX-XXXX, +81, full-width digits |
| phone-vn | 0[3\|5\|7\|8\|9]xxxxxxxx, +84, landline 0xx |
| cccd | `(?<!\d)\d{12}(?!\d)` with optional spaces/dots every 3–4; normalize digits |
| my-number | 12 digits + official check-digit algorithm |
| credit-card | 13–19 digit runs (allow separators), Luhn, exclude CCCD/MyNumber already claimed |

### 5. Salt file

Default path: `<dirname(store.path)>/pii-salt` (binary/hex 32 bytes). Create with
`chmod` 0600 when possible. `pii.saltPath` overrides. Never log salt.

### 6. Config

Add `pii` to `CORE_TOP_LEVEL_KEYS`. Update reserved-keys wording like `cleaning`.

```ts
interface PiiConfig {
  mode: "mask" | "hash" | "drop";
  saltPath?: string; // absolute after load
}
```

### 7. scan --pii

After inventory (or while walking), for each file with ext in
`.txt .md .csv .tsv` and size ≤ 256 KiB, read UTF-8 (fatal decode → skip), run
detectors; if any hit, increment `piiLikelyFiles`. Do not open Office binaries
in v0.1 (false negatives OK for estimate). JSON field: `piiLikelyFiles` on each
source stats object; text line under Health.

### 8. Read-only / local

Rules and apply only touch in-memory strings and local salt/store files. No
network. Sources remain read-only (scan `--pii` reads only).

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| False positive CCCD vs other 12-digit ids | Prefer My Number check digit first; CCCD after; document limits |
| Table findings weak | Mask cells; content findings primary |
| Salt loss breaks hash stability | Document backup of `pii-salt` next to store |
| `--pii` misses Office PII | Accept for v0.1; note in README |

## Migration

Existing documents stay until re-`run`. Operators enable `pii:` and re-run.

## Open Questions

Resolved: no third-party deps; findings offsets on pre-mask content; Office not
sampled on `--pii` in v0.1.
