import { createHmac } from "node:crypto";
import {
  sha256,
  type Document,
  type PiiConfig,
  type PiiFinding,
  type PiiMode,
  type PiiRule,
  type TableData,
} from "@hoanghainh/knot-sync-core";
import { loadOrCreateSalt } from "./salt.js";

export interface Span {
  rule: string;
  start: number;
  end: number;
}

export function mergeSpans(spans: Span[]): Span[] {
  const sorted = [...spans].sort((a, b) => {
    const lenA = a.end - a.start;
    const lenB = b.end - b.start;
    if (lenB !== lenA) return lenB - lenA;
    return a.start - b.start;
  });
  const accepted: Span[] = [];
  for (const s of sorted) {
    if (accepted.some((a) => !(s.end <= a.start || s.start >= a.end))) continue;
    accepted.push(s);
  }
  return accepted.sort((a, b) => a.start - b.start);
}

export function collectFindings(text: string, rules: Iterable<PiiRule>): Span[] {
  const spans: Span[] = [];
  for (const rule of rules) {
    for (const hit of rule.find(text)) {
      if (hit.end > hit.start && hit.start >= 0 && hit.end <= text.length) {
        spans.push({ rule: rule.id, start: hit.start, end: hit.end });
      }
    }
  }
  return mergeSpans(spans);
}

function redactToken(original: string, rule: string): string {
  if (rule === "credit-card") {
    const digits = original.replace(/\D/g, "");
    if (digits.length >= 4) return `****-****-****-${digits.slice(-4)}`;
  }
  return "***";
}

function hashToken(original: string, salt: Buffer): string {
  const dig = createHmac("sha256", salt).update(original, "utf8").digest("base64url");
  return `pii_${dig.slice(0, 16)}`;
}

export function applyModeToText(
  text: string,
  spans: Span[],
  mode: PiiMode,
  salt: Buffer | null,
): string {
  if (spans.length === 0) return text;
  const ordered = [...spans].sort((a, b) => b.start - a.start);
  let out = text;
  for (const s of ordered) {
    const original = out.slice(s.start, s.end);
    let replacement = "";
    if (mode === "mask") replacement = redactToken(original, s.rule);
    else if (mode === "hash") {
      if (!salt) throw new Error("hash mode requires a salt");
      replacement = hashToken(original, salt);
    } else replacement = "";
    out = out.slice(0, s.start) + replacement + out.slice(s.end);
  }
  // Collapse spaces once after all drops so earlier span offsets stay valid.
  if (mode === "drop") {
    out = out.replace(/[ \t]{2,}/g, " ");
  }
  return out;
}

function maskTables(
  tables: TableData[],
  rules: Iterable<PiiRule>,
  mode: PiiMode,
  salt: Buffer | null,
): { tables: TableData[]; anyHit: boolean } {
  let anyHit = false;
  const next = tables.map((t) => ({
    ...t,
    headers: t.headers.map((h) => {
      const spans = collectFindings(h, rules);
      if (spans.length) anyHit = true;
      return applyModeToText(h, spans, mode, salt);
    }),
    rows: t.rows.map((row) =>
      row.map((cell) => {
        const spans = collectFindings(cell, rules);
        if (spans.length) anyHit = true;
        return applyModeToText(cell, spans, mode, salt);
      }),
    ),
  }));
  return { tables: next, anyHit };
}

/** Detect + apply PII rules to a document. Findings are content offsets pre-mask. */
export function applyPiiToDocument(
  document: Document,
  rules: Iterable<PiiRule>,
  config: PiiConfig,
): Document {
  const ruleList = [...rules];
  const contentSpans = collectFindings(document.content, ruleList);
  const salt = config.mode === "hash" ? loadOrCreateSalt(config.saltPath) : null;

  const findings: PiiFinding[] = contentSpans.map((s) => ({
    rule: s.rule,
    start: s.start,
    end: s.end,
  }));

  const content = applyModeToText(document.content, contentSpans, config.mode, salt);
  const { tables, anyHit } = maskTables(document.tables, ruleList, config.mode, salt);

  const metadata = scrubMetadataPii(
    { ...document.metadata },
    ruleList,
    config.mode,
    salt,
  );
  if (anyHit) metadata.piiInTables = true;

  // Ensure no original emails/numbers linger — callers must not re-attach content.
  return {
    ...document,
    content,
    tables,
    pii: findings,
    metadata,
    hash: sha256(content),
  };
}

/** Mask cleaner originals so the store never keeps unmasked PII copies. */
function scrubMetadataPii(
  metadata: Document["metadata"],
  rules: PiiRule[],
  mode: PiiMode,
  salt: Buffer | null,
): Document["metadata"] {
  if (typeof metadata.originalContent === "string") {
    const spans = collectFindings(metadata.originalContent, rules);
    metadata.originalContent = applyModeToText(
      metadata.originalContent,
      spans,
      mode,
      salt,
    );
  }
  if (typeof metadata.originalTables === "string") {
    try {
      const parsed = JSON.parse(metadata.originalTables) as TableData[];
      if (Array.isArray(parsed)) {
        metadata.originalTables = JSON.stringify(
          maskTables(parsed, rules, mode, salt).tables,
        );
      }
    } catch {
      delete metadata.originalTables;
    }
  }
  return metadata;
}

/** True if any rule finds a hit (for scan --pii). */
export function textHasPii(text: string, rules: Iterable<PiiRule>): boolean {
  return collectFindings(text, rules).length > 0;
}
