import {
  sha256,
  type Document,
  type DocumentEnrichContext,
  type DocumentEnricher,
  type GuardFinding,
  type GuardRisk,
  type PiiFinding,
} from "@hoanghainh/knot-sync-core";
import { computeRisk, stripSpans } from "@hoanghainh/knot-sync-guard";
import { applyModeToText, loadOrCreateSalt } from "@hoanghainh/knot-sync-pii-basic";
import { analyzeViaChat, GuardLlmSoftFail, type FetchLike, type ModelFindingRaw } from "./client.js";
import { GUARD_LLM_ENRICHER_ID } from "./constants.js";
import { licenseMissingMessage, verifyGuardLlmLicense } from "./license.js";
import type { GuardLlmSettings } from "./settings.js";

export interface CreateGuardLlmEnricherOptions {
  settings: GuardLlmSettings;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: FetchLike;
  onSoftFail?: (message: string) => void;
}

interface ResolvedSpan {
  kind: "guard" | "pii";
  rule: string;
  start: number;
  end: number;
}

const RISK_RANK: Record<GuardRisk, number> = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
};

function maxRisk(a: GuardRisk, b: GuardRisk): GuardRisk {
  return RISK_RANK[a] >= RISK_RANK[b] ? a : b;
}

function overlaps(
  a: { start: number; end: number },
  b: { start: number; end: number },
): boolean {
  return !(a.end <= b.start || a.start >= b.end);
}

function resolveSpans(
  windowText: string,
  raw: ModelFindingRaw[],
  existing: Array<{ start: number; end: number }>,
): ResolvedSpan[] {
  const out: ResolvedSpan[] = [];
  for (const item of raw) {
    let start = item.start;
    let end = item.end;
    if (
      (typeof start !== "number" || typeof end !== "number") &&
      typeof item.quote === "string" &&
      item.quote.length > 0
    ) {
      const idx = windowText.indexOf(item.quote);
      if (idx >= 0) {
        start = idx;
        end = idx + item.quote.length;
      }
    }
    if (typeof start !== "number" || typeof end !== "number") continue;
    const s = Math.max(0, Math.floor(start));
    const e = Math.min(windowText.length, Math.floor(end));
    if (e <= s) continue;
    const span = { start: s, end: e };
    if (existing.some((x) => overlaps(x, span))) continue;
    if (out.some((x) => overlaps(x, span))) continue;
    out.push({ kind: item.kind, rule: item.rule, start: s, end: e });
  }
  return out;
}

function applyNewFindings(
  document: Document,
  spans: ResolvedSpan[],
  ctx: DocumentEnrichContext,
): Document {
  if (spans.length === 0) return document;

  const guardNew = spans.filter((s) => s.kind === "guard");
  const piiNew = spans.filter((s) => s.kind === "pii");

  let content = document.content;
  let metadata: Document["metadata"] = { ...document.metadata };
  const guard: GuardFinding[] = [
    ...(document.guard ?? []),
    ...guardNew.map((s) => ({ rule: s.rule, start: s.start, end: s.end })),
  ];
  const pii: PiiFinding[] = [
    ...(document.pii ?? []),
    ...piiNew.map((s) => ({ rule: s.rule, start: s.start, end: s.end })),
  ];

  if (piiNew.length > 0) {
    const salt =
      ctx.pii.mode === "hash" ? loadOrCreateSalt(ctx.pii.saltPath) : null;
    content = applyModeToText(
      content,
      piiNew.map((s) => ({ rule: s.rule, start: s.start, end: s.end })),
      ctx.pii.mode,
      salt,
      ctx.pii.tokenFormat,
    );
  }

  if (guardNew.length > 0) {
    const priorRisk =
      typeof metadata.guardRisk === "string" &&
      (metadata.guardRisk === "none" ||
        metadata.guardRisk === "low" ||
        metadata.guardRisk === "medium" ||
        metadata.guardRisk === "high")
        ? metadata.guardRisk
        : "none";
    // Model injection findings elevate at least to medium (like instruction-*).
    const modelRisk: GuardRisk = "medium";
    const fromRules = computeRisk(
      guard
        .filter((f) => f.rule !== "hidden-text")
        .map((f) => ({ rule: f.rule, start: f.start, end: f.end })),
      guard
        .filter((f) => f.rule === "hidden-text")
        .map((f) => ({ rule: f.rule, start: f.start, end: f.end })),
    );
    const risk = maxRisk(maxRisk(priorRisk, fromRules), modelRisk);
    metadata = { ...metadata, guardRisk: risk };

    if (ctx.guard.mode === "strip") {
      content = stripSpans(
        content,
        guardNew.map((s) => ({ rule: s.rule, start: s.start, end: s.end })),
      );
    } else if (ctx.guard.mode === "block" && (risk === "medium" || risk === "high")) {
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
        pii,
        guard,
        metadata: {
          ...restMeta,
          guardRisk: risk,
          status: "error",
          errorMessage:
            `Prompt-injection guard blocked this document after model enrich ` +
            `(risk=${risk}, findings=${guard.length}). ` +
            `Review the source file, or set guard.mode to flag/strip, then retry "knot-sync run".`,
        },
        hash: sha256(""),
      };
    }
  }

  return {
    ...document,
    content,
    pii,
    guard,
    metadata,
    hash: sha256(content),
  };
}

export function createGuardLlmEnricher(
  options: CreateGuardLlmEnricherOptions,
): DocumentEnricher {
  const { settings } = options;
  const env = options.env ?? process.env;
  const onSoftFail = options.onSoftFail;

  return {
    id: GUARD_LLM_ENRICHER_ID,
    async enrich(document, ctx) {
      const licenseRes = verifyGuardLlmLicense(settings, env);
      if (!licenseRes.valid) {
        onSoftFail?.(licenseMissingMessage(settings.licenseEnv, licenseRes));
        return document;
      }

      const full = document.content ?? "";
      if (!full.trim()) return document;
      const windowText =
        full.length <= settings.maxChars ? full : full.slice(0, settings.maxChars);

      let raw: ModelFindingRaw[];
      try {
        raw = await analyzeViaChat({
          settings,
          windowText,
          env,
          fetchImpl: options.fetchImpl,
        });
      } catch (err) {
        if (err instanceof GuardLlmSoftFail) {
          onSoftFail?.(err.message);
          return document;
        }
        throw err;
      }

      const existing = [
        ...(document.guard ?? []),
        ...(document.pii ?? []),
      ].map((f) => ({ start: f.start, end: f.end }));
      const spans = resolveSpans(windowText, raw, existing);
      return applyNewFindings(document, spans, ctx);
    },
  };
}
