import type { PiiRule } from "@hoanghainh/knot-sync-core";

function pushMatches(text: string, re: RegExp, out: Array<{ start: number; end: number }>): void {
  re.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    out.push({ start: m.index, end: m.index + m[0].length });
    if (m[0].length === 0) re.lastIndex += 1;
  }
}

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

export const ALL_RULES: PiiRule[] = [
  emailRule,
  phoneJpRule,
  phoneVnRule,
  myNumberRule,
  cccdRule,
  creditCardRule,
];
