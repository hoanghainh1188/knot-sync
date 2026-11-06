/** Era civil start dates (year, month, day). */
const ERAS: { name: string; y: number; m: number; d: number }[] = [
  { name: "令和", y: 2019, m: 5, d: 1 },
  { name: "平成", y: 1989, m: 1, d: 8 },
  { name: "昭和", y: 1926, m: 12, d: 25 },
  { name: "大正", y: 1912, m: 7, d: 30 },
  { name: "明治", y: 1868, m: 1, d: 25 },
];

const KANJI_DIGITS: Record<string, number> = {
  〇: 0,
  零: 0,
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
};

/** Parse kanji numerals up to 99 (e.g. 三十一 → 31). Returns null if unsupported. */
export function parseKanjiNumeral(s: string): number | null {
  if (!s) return null;
  if (s === "十") return 10;
  if (/^\d+$/.test(s)) return Number(s);

  let total = 0;
  let current = 0;
  for (const ch of s) {
    if (ch === "十") {
      total += (current === 0 ? 1 : current) * 10;
      current = 0;
      continue;
    }
    if (ch === "百") {
      total += (current === 0 ? 1 : current) * 100;
      current = 0;
      continue;
    }
    const d = KANJI_DIGITS[ch];
    if (d === undefined) return null;
    current = current * 10 + d;
  }
  return total + current;
}

function parseYearPart(raw: string): number | null {
  if (raw === "元") return 1;
  return parseKanjiNumeral(raw);
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Convert wareki dates in text to Gregorian ISO fragments.
 * Full dates → YYYY-MM-DD; year+month → YYYY-MM; year only → YYYY.
 */
export function convertWareki(text: string): string {
  const eraAlt = ERAS.map((e) => e.name).join("|");
  const yearPart = `(?:\\d+|元|[一二三四五六七八九十百〇零]+)`;
  const mdPart = `(?:\\d+|[一二三四五六七八九十]+)`;
  const re = new RegExp(
    `(${eraAlt})\\s*(${yearPart})\\s*年(?:\\s*(${mdPart})\\s*月(?:\\s*(${mdPart})\\s*日)?)?`,
    "g",
  );

  return text.replace(re, (match, eraName: string, yRaw: string, mRaw?: string, dRaw?: string) => {
    const era = ERAS.find((e) => e.name === eraName);
    if (!era) return match;
    const eraYear = parseYearPart(yRaw);
    if (eraYear === null || eraYear < 1) return match;

    const gregYear = era.y + (eraYear - 1);
    if (mRaw === undefined) return String(gregYear);

    const month = parseKanjiNumeral(mRaw);
    if (month === null || month < 1 || month > 12) return match;

    if (dRaw === undefined) return `${gregYear}-${pad2(month)}`;

    const day = parseKanjiNumeral(dRaw);
    if (day === null || day < 1 || day > daysInMonth(gregYear, month)) return match;
    return `${gregYear}-${pad2(month)}-${pad2(day)}`;
  });
}
