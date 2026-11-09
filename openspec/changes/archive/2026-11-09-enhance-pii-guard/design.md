# Design

## Context

See proposal.md — Why. Today `packages/pii-basic` registers six `PiiRule`s and
`packages/guard` registers phrase/control/hidden rules. Apply pipelines
(`applyPiiToDocument`, `applyGuardToDocument`) already merge spans and honor
`pii.mode` / `guard.mode`. This change only adds rules + tests inside those
packages; plugin registration, store shapes, and CLI wiring stay the same.

## Goals / Non-Goals

**Goals:**

- Ship additional built-in rule ids with deterministic, offline detection
- Keep false-positive rate tolerable for JP/VN enterprise docs via labels/thresholds
- Preserve read-only sources and fully-local runtime (no network enrichment)

**Non-Goals:**

- Config knobs per rule (enable/disable) — later if needed
- ML/NER models or paid model-based guardrails
- Reworking salt, modes, or MCP framing

## Decisions

### 1. Extend existing plugins, no new packages

**Choice:** Add rules to `pii-basic` and `guard` `ALL_RULES` arrays.

**Alternatives:** New packages (`pii-regional`, `guard-exfil`) — rejected; increases
surface and publish complexity for rules that belong with the built-ins.

### 2. Vietnamese MST (`mst-vn`)

**Choice:** Detect 10-digit enterprise MST and 13-digit branch form
`NNNNNNNNNN-NNN` (hyphen optional after digit-mapping). Prefer matches adjacent to
labels `MST`, `Mã số thuế`, `税務`/`税号` optional but not required when digit
shape is unambiguous. Validate length/shape only (no remote tax registry).

**Alternatives:** Strict label-only — rejected; many scans lack labels. Full
checksum validation — out of scope unless a stable public algorithm is confirmed
in-repo later.

### 3. Bank account (`bank-account`)

**Choice:** Require a nearby label cue (`口座`, `口座番号`, `Số tài khoản`,
`STK`, `account number`, etc.) within a small character window, then capture a
digit run of documented length (e.g. 8–16 after ASCII digit mapping). Do not
claim bare long digit runs without cues (avoids order IDs / SKUs).

**Alternatives:** Prefix-only bank BIN tables — brittle across banks; use as
optional secondary cue only if listed in tests, not as sole trigger.

### 4. Person name (`person-name`)

**Choice:** Curated JP surname + given-name tokens and common VN family/middle/given
tokens; match only when a name label appears nearby (`氏名`, `名前`, `Họ tên`,
`Họ và tên`, `Full name`, etc.). Spec requires label-gating.

**Alternatives:** Match any dictionary hit — too many false positives on prose.

### 5. Guard: Base64 (`base64-payload`)

**Choice:** Regex for long `[A-Za-z0-9+/]+=*` runs with minimum length (e.g. ≥64
chars) and charset density; ignore short tokens. Elevate risk at least to `medium`
when present (apply layer already derives risk from findings — tune if needed).

**Alternatives:** Attempt decode + inspect — costlier and may false-positive on
binary-looking legit content; pattern-only is enough for open-core.

### 6. Guard: Markdown exfil (`md-exfil`)

**Choice:** Match `![…](http…)` and `[…](http…)` / `https` locally. Never fetch URLs.

### 7. Guard: Control flood (`controls-flood`)

**Choice:** Separate rule from per-character `controls`. Count control chars in a
sliding window (e.g. ≥8 controls within 32 chars, thresholds documented in code
comments/tests). One finding covering the flood span; risk higher than a single ZW.

**Alternatives:** Only bump risk inside `controls` apply logic — less visible in
`Document.guard` rule ids; prefer explicit rule id for audit clarity.

### 8. Read-only / fully local

Rules run only on in-memory document text during `run` / `scan --pii`. No writes
to sources; no outbound HTTP for validation or URL checks. Markdown “exfil”
detection is string matching only.

## Risks / Trade-offs

- **[False positives on MST/bank digits]** → Prefer label windows; document length
  bounds; conflict resolution vs `my-number`/`cccd`/`credit-card`
- **[Name dictionary maintenance]** → Keep lists small and curated in-repo; label gate
- **[Base64 FP on large tokens/hashes]** → High min length; tests with negatives
- **[Risk inflation]** → Flood + base64 should not mark every doc `high` without
  phrase hits; keep risk mapping conservative and tested

## Migration Plan

- No config migration; new rules activate with default plugins
- Existing stores keep old findings; re-`run` picks up new detections
- Rollback: revert package commits; no schema change

## Open Questions

None deferrable — thresholds (Base64 min length, flood window) are implementation
constants fixed in tasks/tests and may be tuned later without spec renames.
