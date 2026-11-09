import type { PiiRule } from "@hoanghainh/knot-sync-core";
import {
  JP_GIVEN,
  JP_SURNAMES,
  NAME_LABELS,
  VN_FAMILY,
  VN_GIVEN,
} from "./names.js";

function pushMatches(text: string, re: RegExp, out: Array<{ start: number; end: number }>): void {
  re.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    out.push({ start: m.index, end: m.index + m[0].length });
    if (m[0].length === 0) re.lastIndex += 1;
  }
}

/** Look-back window (chars) for label cues before a candidate span. */
const LABEL_WINDOW = 40;

function labelBefore(
  text: string,
  index: number,
  labels: readonly string[],
): boolean {
  const start = Math.max(0, index - LABEL_WINDOW);
  const window = text.slice(start, index);
  const lower = window.toLowerCase();
  for (const label of labels) {
    if (label.toLowerCase() !== label) {
      if (window.includes(label)) return true;
    }
    if (lower.includes(label.toLowerCase())) return true;
  }
  return false;
}

const MST_LABELS = ["MST", "Mã số thuế", "Ma so thue", "税号", "税務番号"] as const;
const BANK_LABELS = [
  "口座番号",
  "口座",
  "Số tài khoản",
  "So tai khoan",
  "STK",
  "account number",
  "Account No",
  "A/C",
] as const;

/** Digits only, mapping full-width ０-９ → 0-9. */
export function toAsciiDigits(s: string): string {
  return s.replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xff10 + 0x30));
}

export function myNumberCheckDigit(elevenDigits: string): number {
  let sum = 0;
  for (let i = 0; i < 11; i++) {
    const n = i + 1;
    const q = n <= 6 ? n + 1 : n - 5;
    sum += Number(elevenDigits[i]) * q;
  }
  const c = 11 - (sum % 11);
  return c >= 10 ? 0 : c;
}

export function isValidMyNumber(twelveDigits: string): boolean {
  if (!/^\d{12}$/.test(twelveDigits)) return false;
  return myNumberCheckDigit(twelveDigits.slice(0, 11)) === Number(twelveDigits[11]);
}

/** Build a valid 12-digit My Number for tests from any 11-digit prefix. */
export function makeValidMyNumber(elevenDigits: string): string {
  if (!/^\d{11}$/.test(elevenDigits)) throw new Error("need 11 digits");
  return elevenDigits + String(myNumberCheckDigit(elevenDigits));
}

export function luhnOk(digits: string): boolean {
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = Number(digits[i]);
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

export const emailRule: PiiRule = {
  id: "email",
  find(text) {
    const out: Array<{ start: number; end: number }> = [];
    pushMatches(text, /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, out);
    return out;
  },
};

export const phoneJpRule: PiiRule = {
  id: "phone-jp",
  find(text) {
    const out: Array<{ start: number; end: number }> = [];
    const mapped = [...text].map((ch) => toAsciiDigits(ch)).join("");
    // Require +81 or hyphenated domestic form so bare VN mobiles are not claimed.
    const re =
      /(?:\+81[- ]?(?:0)?\d{1,4}[- ]?\d{1,4}[- ]?\d{3,4}|0\d{1,4}-\d{1,4}-\d{3,4})/g;
    let m: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((m = re.exec(mapped)) !== null) {
      const span = m[0];
      const digits = span.replace(/\D/g, "");
      if (digits.length < 10 || digits.length > 13) continue;
      out.push({ start: m.index, end: m.index + span.length });
    }
    return out;
  },
};

export const phoneVnRule: PiiRule = {
  id: "phone-vn",
  find(text) {
    const mapped = [...text].map((ch) => toAsciiDigits(ch)).join("");
    const out: Array<{ start: number; end: number }> = [];
    // Digit boundary so SKU/order numbers are not partially claimed.
    const re = /(?<!\d)(?:\+84[- ]?|0)(?:3|5|7|8|9)\d{8}|(?<!\d)(?:\+84[- ]?|0)\d{9,10}(?!\d)/g;
    let m: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((m = re.exec(mapped)) !== null) {
      const digits = m[0].replace(/\D/g, "");
      const national = digits.startsWith("84") ? "0" + digits.slice(2) : digits;
      if (national.length < 10 || national.length > 11) continue;
      if (!/^0[3-9]/.test(national) && !/^0\d{9,10}$/.test(national)) continue;
      // Defer to MST / bank-account when those labels sit nearby.
      if (labelBefore(mapped, m.index, MST_LABELS)) continue;
      if (labelBefore(mapped, m.index, BANK_LABELS)) continue;
      out.push({ start: m.index, end: m.index + m[0].length });
    }
    return out;
  },
};

export const cccdRule: PiiRule = {
  id: "cccd",
  find(text) {
    const mapped = [...text].map((ch) => toAsciiDigits(ch)).join("");
    const out: Array<{ start: number; end: number }> = [];
    const re = /(?<!\d)(?:\d[\s.-]?){11}\d(?!\d)/g;
    let m: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((m = re.exec(mapped)) !== null) {
      const digits = m[0].replace(/\D/g, "");
      if (digits.length !== 12) continue;
      if (isValidMyNumber(digits)) continue; // prefer my-number rule
      if (labelBefore(mapped, m.index, BANK_LABELS)) continue;
      out.push({ start: m.index, end: m.index + m[0].length });
    }
    return out;
  },
};

export const myNumberRule: PiiRule = {
  id: "my-number",
  find(text) {
    const mapped = [...text].map((ch) => toAsciiDigits(ch)).join("");
    const out: Array<{ start: number; end: number }> = [];
    const re = /(?<!\d)(?:\d[\s.-]?){11}\d(?!\d)/g;
    let m: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((m = re.exec(mapped)) !== null) {
      const digits = m[0].replace(/\D/g, "");
      if (digits.length !== 12) continue;
      if (!isValidMyNumber(digits)) continue;
      out.push({ start: m.index, end: m.index + m[0].length });
    }
    return out;
  },
};

export const creditCardRule: PiiRule = {
  id: "credit-card",
  find(text) {
    const mapped = [...text].map((ch) => toAsciiDigits(ch)).join("");
    const out: Array<{ start: number; end: number }> = [];
    // Digit runs may be longer than one card; try Luhn windows 19→13.
    const re = /(?<!\d)(?:\d[ -]?)+(?!\d)/g;
    let m: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((m = re.exec(mapped)) !== null) {
      const span = m[0];
      const digitOffsets: number[] = [];
      for (let i = 0; i < span.length; i++) {
        if (/\d/.test(span[i]!)) digitOffsets.push(i);
      }
      if (digitOffsets.length < 13) continue;

      let best: { start: number; end: number } | null = null;
      for (let len = Math.min(19, digitOffsets.length); len >= 13; len--) {
        for (let i = 0; i + len <= digitOffsets.length; i++) {
          const digits = digitOffsets
            .slice(i, i + len)
            .map((off) => span[off]!)
            .join("");
          if (!luhnOk(digits)) continue;
          const charStart = digitOffsets[i]!;
          const charEnd = digitOffsets[i + len - 1]! + 1;
          const absStart = m.index + charStart;
          const absEnd = m.index + charEnd;
          if (!best || absEnd - absStart > best.end - best.start) {
            best = { start: absStart, end: absEnd };
          } else if (
            best &&
            absEnd - absStart === best.end - best.start &&
            absStart < best.start
          ) {
            best = { start: absStart, end: absEnd };
          }
        }
        if (best) break;
      }
      if (best) out.push(best);
    }
    return out;
  },
};

/**
 * Vietnamese tax code (MST): 10-digit enterprise (label-gated) or
 * 13-digit branch `NNNNNNNNNN-NNN` (hyphen optional; distinctive shape).
 */
export const mstVnRule: PiiRule = {
  id: "mst-vn",
  find(text) {
    const mapped = [...text].map((ch) => toAsciiDigits(ch)).join("");
    const out: Array<{ start: number; end: number }> = [];

    // Branch form must include a hyphen/dash so bare 13-digit SKUs are not claimed.
    const branchRe = /(?<!\d)\d{10}\s*[-–]\s*\d{3}(?!\d)/g;
    let m: RegExpExecArray | null;
    branchRe.lastIndex = 0;
    while ((m = branchRe.exec(mapped)) !== null) {
      const digits = m[0].replace(/\D/g, "");
      if (digits.length !== 13) continue;
      out.push({ start: m.index, end: m.index + m[0].length });
    }

    const enterpriseRe = /(?<!\d)\d{10}(?!\d)/g;
    enterpriseRe.lastIndex = 0;
    while ((m = enterpriseRe.exec(mapped)) !== null) {
      // Skip if already covered by a branch match.
      const start = m.index;
      const end = m.index + m[0].length;
      if (out.some((s) => !(end <= s.start || start >= s.end))) continue;
      if (!labelBefore(mapped, start, MST_LABELS)) continue;
      out.push({ start, end });
    }
    return out;
  },
};

/** Bank account digit runs near JP/VN/EN account labels (8–16 digits). */
export const bankAccountRule: PiiRule = {
  id: "bank-account",
  find(text) {
    const mapped = [...text].map((ch) => toAsciiDigits(ch)).join("");
    const out: Array<{ start: number; end: number }> = [];
    const re = /(?<!\d)(?:\d[\s-]?){7,15}\d(?!\d)/g;
    let m: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((m = re.exec(mapped)) !== null) {
      const digits = m[0].replace(/\D/g, "");
      if (digits.length < 8 || digits.length > 16) continue;
      // Prefer MST for 10-digit / 13-digit tax shapes when MST label present,
      // and skip hyphenated 10+3 branch forms entirely (mst-vn owns them).
      // MST branch form NNNNNNNNNN-NNN is owned by mst-vn.
      if (digits.length === 13 && mapped.slice(m.index, m.index + m[0].length).includes("-")) {
        continue;
      }
      if (digits.length === 10 && labelBefore(mapped, m.index, MST_LABELS)) continue;
      if (!labelBefore(mapped, m.index, BANK_LABELS)) continue;
      out.push({ start: m.index, end: m.index + m[0].length });
    }
    return out;
  },
};

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findLabelSites(text: string): number[] {
  const sites: number[] = [];
  const lower = text.toLowerCase();
  for (const label of NAME_LABELS) {
    const isLatin = /^[\x00-\x7F]+$/.test(label);
    let from = 0;
    while (from < text.length) {
      const at = isLatin ? lower.indexOf(label.toLowerCase(), from) : text.indexOf(label, from);
      if (at < 0) break;
      let i = at + label.length;
      while (i < text.length && /[\s:：\-–]/.test(text[i]!)) i++;
      sites.push(i);
      from = at + label.length;
    }
  }
  return sites;
}

/**
 * Label-gated JP/VN personal names using curated surname/given dictionaries.
 */
export const personNameRule: PiiRule = {
  id: "person-name",
  find(text) {
    const out: Array<{ start: number; end: number }> = [];
    const familySorted = [...VN_FAMILY].sort((a, b) => b.length - a.length);
    const givenSorted = [...VN_GIVEN].sort((a, b) => b.length - a.length);
    const givenAndFamily = [...givenSorted, ...familySorted];
    for (const i of findLabelSites(text)) {
      const windowEnd = Math.min(text.length, i + 40);
      const window = text.slice(i, windowEnd);

      let matched = false;
      for (const sur of JP_SURNAMES) {
        if (!window.startsWith(sur)) continue;
        let end = i + sur.length;
        const rest = text.slice(end, windowEnd);
        const space = rest.match(/^\s+/);
        if (space) {
          const afterSpace = rest.slice(space[0].length);
          for (const given of JP_GIVEN) {
            if (afterSpace.startsWith(given)) {
              end = end + space[0].length + given.length;
              break;
            }
          }
        }
        out.push({ start: i, end });
        matched = true;
        break;
      }
      if (matched) continue;

      const winLower = window.toLowerCase();
      let cursor = 0;
      while (cursor < window.length && /\s/.test(window[cursor]!)) cursor++;
      let familyHit: string | null = null;
      for (const fam of familySorted) {
        if (winLower.startsWith(fam.toLowerCase(), cursor)) {
          familyHit = window.slice(cursor, cursor + fam.length);
          cursor += fam.length;
          break;
        }
      }
      if (!familyHit) continue;
      const parts = [familyHit];
      while (cursor < window.length && parts.length < 4) {
        if (!/\s/.test(window[cursor]!)) break;
        while (cursor < window.length && /\s/.test(window[cursor]!)) cursor++;
        let next: string | null = null;
        for (const tok of givenAndFamily) {
          if (winLower.startsWith(tok.toLowerCase(), cursor)) {
            next = window.slice(cursor, cursor + tok.length);
            cursor += tok.length;
            break;
          }
        }
        if (!next) break;
        parts.push(next);
      }
      if (parts.length < 2) continue;
      const re = new RegExp(parts.map((p) => escapeRe(p)).join("\\s+"));
      const hm = re.exec(window);
      if (hm) out.push({ start: i + hm.index, end: i + hm.index + hm[0].length });
    }
    return out;
  },
};export const ALL_RULES: PiiRule[] = [
  emailRule,
  phoneJpRule,
  phoneVnRule,
  myNumberRule,
  cccdRule,
  creditCardRule,
  mstVnRule,
  bankAccountRule,
  personNameRule,
];
