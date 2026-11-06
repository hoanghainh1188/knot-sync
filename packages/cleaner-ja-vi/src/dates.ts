function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function isValidYmd(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** Normalize common Western / JP numeric dates to ISO 8601 calendar forms. */
export function convertDatesIso(text: string): string {
  let out = text;

  // YYYY年M月D日
  out = out.replace(
    /(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/g,
    (_m, ys: string, ms: string, ds: string) => {
      const y = Number(ys);
      const mo = Number(ms);
      const d = Number(ds);
      if (!isValidYmd(y, mo, d)) return _m;
      return `${y}-${pad2(mo)}-${pad2(d)}`;
    },
  );

  // YYYY年M月
  out = out.replace(/(\d{4})\s*年\s*(\d{1,2})\s*月(?!\s*\d)/g, (_m, ys: string, ms: string) => {
    const y = Number(ys);
    const mo = Number(ms);
    if (mo < 1 || mo > 12) return _m;
    return `${y}-${pad2(mo)}`;
  });

  // YYYY/M/D or YYYY-M-D (ASCII separators) — avoid matching already-ISO when day present
  out = out.replace(
    /(?<!\d)(\d{4})[/-](\d{1,2})[/-](\d{1,2})(?!\d)/g,
    (_m, ys: string, ms: string, ds: string) => {
      const y = Number(ys);
      const mo = Number(ms);
      const d = Number(ds);
      if (!isValidYmd(y, mo, d)) return _m;
      return `${y}-${pad2(mo)}-${pad2(d)}`;
    },
  );

  // DD-MM-YYYY or DD/MM/YYYY when unambiguous (day>12 or month>12)
  out = out.replace(
    /(?<!\d)(\d{1,2})([/-])(\d{1,2})\2(\d{4})(?!\d)/g,
    (match, aRaw: string, _sep: string, bRaw: string, yRaw: string) => {
      const a = Number(aRaw);
      const b = Number(bRaw);
      const y = Number(yRaw);
      let day: number;
      let month: number;
      if (a > 12 && b >= 1 && b <= 12) {
        day = a;
        month = b;
      } else if (b > 12 && a >= 1 && a <= 12) {
        month = a;
        day = b;
      } else {
        return match; // ambiguous
      }
      if (!isValidYmd(y, month, day)) return match;
      return `${y}-${pad2(month)}-${pad2(day)}`;
    },
  );

  return out;
}
