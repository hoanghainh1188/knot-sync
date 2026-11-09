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
const CONTROL_SOURCE =
  "[\\u200B-\\u200F\\u202A-\\u202E\\u2060-\\u2064\\u2066-\\u2069\\uFEFF\\u00AD]";

function controlRe(): RegExp {
  return new RegExp(CONTROL_SOURCE, "g");
}

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
    const re = controlRe();
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      out.push({ start: m.index, end: m.index + m[0].length });
      if (m[0].length === 0) re.lastIndex += 1;
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

function pushMatches(
  text: string,
  re: RegExp,
  out: Array<{ start: number; end: number }>,
): void {
  re.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    out.push({ start: m.index, end: m.index + m[0].length });
    if (m[0].length === 0) re.lastIndex += 1;
  }
}

/** Minimum Base64-looking run length (chars) for `base64-payload`. */
export const BASE64_MIN_LENGTH = 64;

export const base64PayloadRule: GuardRule = {
  id: "base64-payload",
  find(text) {
    const out: Array<{ start: number; end: number }> = [];
    const re = /[A-Za-z0-9+/]{64,}={0,2}/g;
    let m: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((m = re.exec(text)) !== null) {
      if (m[0].length < BASE64_MIN_LENGTH) continue;
      // Require mixed alphabet so pure hex hashes are less likely to match.
      if (!/[A-Za-z]/.test(m[0]) || !/[0-9+/]/.test(m[0])) continue;
      out.push({ start: m.index, end: m.index + m[0].length });
    }
    return out;
  },
};

/** Markdown image/link with http(s) destination (pattern-only; no fetch). */
export const mdExfilRule: GuardRule = {
  id: "md-exfil",
  find(text) {
    const out: Array<{ start: number; end: number }> = [];
    const re = /!?\[[^\]]*]\(\s*https?:\/\/[^)\s]+\)/gi;
    pushMatches(text, re, out);
    return out;
  },
};

/** Flood: ≥ FLOOD_MIN_CONTROLS control chars inside FLOOD_WINDOW. */
export const FLOOD_WINDOW = 32;
export const FLOOD_MIN_CONTROLS = 8;

export const controlsFloodRule: GuardRule = {
  id: "controls-flood",
  find(text) {
    const positions: number[] = [];
    const re = controlRe();
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      positions.push(m.index);
      if (m[0].length === 0) re.lastIndex += 1;
    }
    if (positions.length < FLOOD_MIN_CONTROLS) return [];

    const out: Array<{ start: number; end: number }> = [];
    let i = 0;
    while (i < positions.length) {
      let j = i;
      while (
        j + 1 < positions.length &&
        positions[j + 1]! - positions[i]! < FLOOD_WINDOW
      ) {
        j++;
      }
      const count = j - i + 1;
      if (count >= FLOOD_MIN_CONTROLS) {
        const start = positions[i]!;
        const end = positions[j]! + 1;
        out.push({ start, end });
        i = j + 1;
      } else {
        i++;
      }
    }
    return out;
  },
};

export const ALL_RULES: GuardRule[] = [
  instructionEnRule,
  instructionJaRule,
  instructionVnRule,
  controlsRule,
  controlsFloodRule,
  base64PayloadRule,
  mdExfilRule,
  hiddenTextRule,
];

/** Detectors used when scanning extractor-provided hidden text. */
export const HIDDEN_CHANNEL_RULES: GuardRule[] = [
  instructionEnRule,
  instructionJaRule,
  instructionVnRule,
  controlsRule,
];
