import {
  sha256,
  type Document,
  type GuardConfig,
  type GuardFinding,
  type GuardRisk,
  type GuardRule,
  type TableData,
} from "@hoanghainh/knot-sync-core";
import { HIDDEN_CHANNEL_RULES, controlsRule } from "./rules.js";

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

export function collectFindings(text: string, rules: Iterable<GuardRule>): Span[] {
  const spans: Span[] = [];
  for (const rule of rules) {
    if (rule.id === "hidden-text") continue; // content channel only
    for (const hit of rule.find(text)) {
      if (hit.end > hit.start && hit.start >= 0 && hit.end <= text.length) {
        spans.push({ rule: rule.id, start: hit.start, end: hit.end });
      }
    }
  }
  return mergeSpans(spans);
}

export function computeRisk(
  contentFindings: Span[],
  hiddenFindings: Span[],
): GuardRisk {
  if (hiddenFindings.length > 0) return "high";
  const families = new Set(
    contentFindings
      .map((f) => f.rule)
      .filter((r) => r.startsWith("instruction-")),
  );
  if (families.size >= 2) return "high";
  if (families.size === 1) return "medium";
  if (
    contentFindings.some(
      (f) =>
        f.rule === "controls-flood" ||
        f.rule === "base64-payload" ||
        f.rule === "md-exfil",
    )
  ) {
    return "medium";
  }
  if (contentFindings.some((f) => f.rule === "controls")) return "low";
  return "none";
}

export function stripSpans(text: string, spans: Span[]): string {
  if (spans.length === 0) return text;
  const ordered = [...spans].sort((a, b) => b.start - a.start);
  let out = text;
  for (const s of ordered) {
    out = out.slice(0, s.start) + out.slice(s.end);
  }
  return out.replace(/[ \t]{2,}/g, " ");
}

/**
 * Strip controls first so they cannot hide instruction phrases, then strip
 * remaining findings. Repeat a few times for nested / overlapping phrases.
 */
export function stripInjection(text: string, rules: Iterable<GuardRule>): string {
  const ruleList = [...rules];
  let out = text;
  for (let i = 0; i < 4; i++) {
    const controlSpans = collectFindings(out, [controlsRule]);
    if (controlSpans.length > 0) out = stripSpans(out, controlSpans);
    const spans = collectFindings(out, ruleList);
    if (spans.length === 0) break;
    out = stripSpans(out, spans);
  }
  return out;
}

function stripTables(tables: TableData[], rules: Iterable<GuardRule>): TableData[] {
  return tables.map((t) => ({
    ...t,
    headers: t.headers.map((h) => stripInjection(h, rules)),
    rows: t.rows.map((row) => row.map((cell) => stripInjection(cell, rules))),
  }));
}

function scrubStringField(
  metadata: Document["metadata"],
  key: string,
  rules: GuardRule[],
  mode: GuardConfig["mode"],
): void {
  const value = metadata[key];
  if (typeof value !== "string") return;
  if (mode === "strip") {
    metadata[key] = stripInjection(value, rules);
  } else if (mode === "block") {
    delete metadata[key];
  }
}

/** Detect + apply guard rules. Findings are content (or hidden) offsets pre-transform. */
export function applyGuardToDocument(
  document: Document,
  rules: Iterable<GuardRule>,
  config: GuardConfig,
): Document {
  const ruleList = [...rules];
  const contentSpans = collectFindings(document.content, ruleList);

  const hiddenRaw =
    typeof document.metadata.guardHiddenText === "string"
      ? document.metadata.guardHiddenText
      : "";
  const hiddenSpans: Span[] = [];
  if (hiddenRaw) {
    for (const hit of collectFindings(hiddenRaw, HIDDEN_CHANNEL_RULES)) {
      hiddenSpans.push({
        rule: "hidden-text",
        start: hit.start,
        end: hit.end,
      });
    }
  }

  const findings: GuardFinding[] = [
    ...contentSpans.map((s) => ({ rule: s.rule, start: s.start, end: s.end })),
    ...hiddenSpans.map((s) => ({ rule: s.rule, start: s.start, end: s.end })),
  ];
  const risk = computeRisk(contentSpans, hiddenSpans);
  const metadata: Document["metadata"] = {
    ...document.metadata,
    guardRisk: risk,
  };
  if (hiddenSpans.length > 0) metadata.guardInHidden = true;

  if (config.mode === "flag" || findings.length === 0) {
    // Do not persist the raw hidden channel (may carry PII / injection payload).
    delete metadata.guardHiddenText;
    return {
      ...document,
      guard: findings,
      metadata,
      hash: sha256(document.content),
    };
  }

  if (config.mode === "strip") {
    const content = stripInjection(document.content, ruleList);
    const tables = stripTables(document.tables, ruleList);
    delete metadata.guardHiddenText;
    scrubStringField(metadata, "originalContent", ruleList, "strip");
    scrubStringField(metadata, "originalTables", ruleList, "strip");
    return {
      ...document,
      content,
      tables,
      guard: findings,
      metadata,
      hash: sha256(content),
    };
  }

  // block: medium/high risk only (controls-only stays flag-like empty? No —
  // design wants block on injection). Spec scenarios use instruction phrases.
  // Controls-only (low) does not block ready content.
  if (risk === "none" || risk === "low") {
    delete metadata.guardHiddenText;
    return {
      ...document,
      guard: findings,
      metadata,
      hash: sha256(document.content),
    };
  }

  const {
    sourceFileHash: _drop,
    originalContent: _oc,
    originalTables: _ot,
    guardHiddenText: _ht,
    ...restMeta
  } = metadata;
  void _drop;
  void _oc;
  void _ot;
  void _ht;
  return {
    ...document,
    content: "",
    tables: [],
    guard: findings,
    metadata: {
      ...restMeta,
      guardRisk: risk,
      status: "error",
      errorMessage:
        `Prompt-injection guard blocked this document (risk=${risk}, findings=${findings.length}). ` +
        `Review the source file, or set guard.mode to flag/strip, then retry "knot-sync run".`,
    },
    hash: sha256(""),
  };
}
