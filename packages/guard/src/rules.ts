import type { GuardRule } from "@hoanghainh/knot-sync-core";

function findPhrase(text: string, phrases: string[]): Array<{ start: number; end: number }> {
  const out: Array<{ start: number; end: number }> = [];
  for (const phrase of phrases) {
    // Allow flexible whitespace (PDF line breaks, double spaces) between words.
    const pattern = phrase
      .split(/\s+/)
      .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("\\s+");
    const re = new RegExp(pattern, "gi");
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      out.push({ start: m.index, end: m.index + m[0].length });
      if (m[0].length === 0) re.lastIndex += 1;
    }
  }
  return out;
}

const EN_PHRASES = [
  "ignore previous instructions",
  "ignore prior instructions",
  "disregard previous instructions",
  "disregard the above",
  "ignore all previous",
  "system prompt",
  "override your instructions",
];

const JA_PHRASES = [
  "以前の指示を無視",
  "以前の命令を無視",
  "システムプロンプト",
  "指示を無視して",
];

const VN_PHRASES = [
  "bỏ qua hướng dẫn trước",
  "bo qua huong dan truoc",
  "bỏ qua chỉ dẫn trước",
  "prompt hệ thống",
  "bo qua chi dan truoc",
];

/** Cf / bidi / zero-width controls commonly used to hide instructions. */
const CONTROL_RE =
  /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF\u00AD]/g;

export const instructionEnRule: GuardRule = {
  id: "instruction-en",
  find(text) {
    return findPhrase(text, EN_PHRASES);
  },
};

export const instructionJaRule: GuardRule = {
  id: "instruction-ja",
  find(text) {
    return findPhrase(text, JA_PHRASES);
  },
};

export const instructionVnRule: GuardRule = {
  id: "instruction-vn",
  find(text) {
    return findPhrase(text, VN_PHRASES);
  },
};

export const controlsRule: GuardRule = {
  id: "controls",
  find(text) {
    const out: Array<{ start: number; end: number }> = [];
    CONTROL_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = CONTROL_RE.exec(text)) !== null) {
      out.push({ start: m.index, end: m.index + m[0].length });
      if (m[0].length === 0) CONTROL_RE.lastIndex += 1;
    }
    return out;
  },
};

/**
 * Hidden-channel rule: normally a no-op on content.
 * applyGuardToDocument runs instruction+controls finders on metadata.guardHiddenText
 * and attributes those hits to this rule id when elevating risk.
 */
export const hiddenTextRule: GuardRule = {
  id: "hidden-text",
  find() {
    return [];
  },
};

export const ALL_RULES: GuardRule[] = [
  instructionEnRule,
  instructionJaRule,
  instructionVnRule,
  controlsRule,
  hiddenTextRule,
];

/** Detectors used when scanning extractor-provided hidden text. */
export const HIDDEN_CHANNEL_RULES: GuardRule[] = [
  instructionEnRule,
  instructionJaRule,
  instructionVnRule,
  controlsRule,
];
