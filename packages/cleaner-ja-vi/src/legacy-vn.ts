/**
 * TCVN3 (ABC) → Unicode as Latin-1 code points.
 * Distinctive tone letters drive detection; ©/®/French accents alone do not.
 */
export const TCVN3_TO_UNICODE: Record<string, string> = {
  "\u00A8": "ă",
  "\u00A9": "â",
  "\u00AA": "ê",
  "\u00AB": "ô",
  "\u00AC": "ơ",
  "\u00AD": "ư",
  "\u00AE": "đ",
  "\u00A1": "Ă",
  "\u00A2": "Â",
  "\u00A3": "Ê",
  "\u00A4": "Ô",
  "\u00A5": "Ơ",
  "\u00A6": "Ư",
  "\u00A7": "Đ",
  "\u00B5": "à",
  "\u00B8": "á",
  "\u00B6": "ả",
  "\u00B7": "ã",
  "\u00B9": "ạ",
  "\u00BB": "ằ",
  "\u00BE": "ắ",
  "\u00BC": "ẳ",
  "\u00BD": "ẵ",
  "\u00C6": "ặ",
  "\u00C7": "ầ",
  "\u00CA": "ấ",
  "\u00C8": "ẩ",
  "\u00C9": "ẫ",
  "\u00CB": "ậ",
  "\u00CC": "è",
  "\u00D0": "é",
  "\u00CE": "ẻ",
  "\u00CF": "ẽ",
  "\u00D1": "ẹ",
  "\u00D2": "ề",
  "\u00D5": "ế",
  "\u00D3": "ể",
  "\u00D4": "ễ",
  "\u00D6": "ệ",
  "\u00D7": "ì",
  "\u00DD": "í",
  "\u00D8": "ỉ",
  "\u00DC": "ĩ",
  "\u00DE": "ị",
  "\u00DF": "ò",
  "\u00E3": "ó",
  "\u00E1": "ỏ",
  "\u00E2": "õ",
  "\u00E4": "ọ",
  "\u00E5": "ồ",
  "\u00E8": "ố",
  "\u00E6": "ổ",
  "\u00E7": "ỗ",
  "\u00E9": "ộ",
  "\u00EA": "ờ",
  "\u00ED": "ớ",
  "\u00EB": "ở",
  "\u00EC": "ỡ",
  "\u00EE": "ợ",
  "\u00EF": "ù",
  "\u00F3": "ú",
  "\u00F1": "ủ",
  "\u00F2": "ũ",
  "\u00F4": "ụ",
  "\u00F5": "ừ",
  "\u00F8": "ứ",
  "\u00F6": "ử",
  "\u00F7": "ữ",
  "\u00F9": "ự",
  "\u00FA": "ỳ",
  "\u00FD": "ý",
  "\u00FB": "ỷ",
  "\u00FC": "ỹ",
  "\u00FE": "ỵ",
};

/**
 * Only these TCVN3 code points count toward detection. Everything else in the
 * map (é, ç, ©, ®, German Ö…) is too common in Western European text.
 */
const DISTINCTIVE_TCVN3 = new Set([
  "\u00A8", // ¨ → ă
  "\u00AA", // ª → ê
  "\u00AB", // « → ô
  "\u00AC", // ¬ → ơ
  "\u00AD", // SHY → ư
  "\u00B5", // µ → à
  "\u00B6", // ¶ → ả
  "\u00B7", // · → ã
  "\u00B8", // ¸ → á
  "\u00B9", // ¹ → ạ
  "\u00BB", // » → ằ
  "\u00BC", // ¼ → ẳ
  "\u00BD", // ½ → ẵ
  "\u00BE", // ¾ → ắ
  "\u00C6", // Æ → ặ
  "\u00D7", // × → ì
  "\u00D8", // Ø → ỉ
  "\u00DE", // Þ → ị
  "\u00DF", // ß → ò
]);

/**
 * VNI-Windows digraphs (length ≥ 2 only) using ø ù û õ ï tone letters.
 * Single-char remaps are avoided so Western text is not mangled.
 */
function vniPairs(): [string, string][] {
  const raw: [string, string][] = [
    ["aâø", "ầ"],
    ["aâù", "ấ"],
    ["aâû", "ẩ"],
    ["aâõ", "ẫ"],
    ["aâï", "ậ"],
    ["eêø", "ề"],
    ["eêù", "ế"],
    ["eêû", "ể"],
    ["eêõ", "ễ"],
    ["eêï", "ệ"],
    ["oôø", "ồ"],
    ["oôù", "ố"],
    ["oôû", "ổ"],
    ["oôõ", "ỗ"],
    ["oôï", "ộ"],
    ["âø", "ầ"],
    ["âù", "ấ"],
    ["âû", "ẩ"],
    ["âõ", "ẫ"],
    ["âï", "ậ"],
    ["êø", "ề"],
    ["êù", "ế"],
    ["êû", "ể"],
    ["êõ", "ễ"],
    ["êï", "ệ"],
    ["ôø", "ồ"],
    ["ôù", "ố"],
    ["ôû", "ổ"],
    ["ôõ", "ỗ"],
    ["ôï", "ộ"],
    ["öø", "ừ"],
    ["öù", "ứ"],
    ["öû", "ử"],
    ["öõ", "ữ"],
    ["öï", "ự"],
    ["æø", "ằ"],
    ["æù", "ắ"],
    ["æû", "ẳ"],
    ["æõ", "ẵ"],
    ["æï", "ặ"],
    ["øø", "ờ"],
    ["øù", "ớ"],
    ["øû", "ở"],
    ["øõ", "ỡ"],
    ["øï", "ợ"],
    ["aø", "à"],
    ["aù", "á"],
    ["aû", "ả"],
    ["aõ", "ã"],
    ["aï", "ạ"],
    ["eø", "è"],
    ["eù", "é"],
    ["eû", "ẻ"],
    ["eõ", "ẽ"],
    ["eï", "ẹ"],
    ["iø", "ì"],
    ["iù", "í"],
    ["iû", "ỉ"],
    ["iõ", "ĩ"],
    ["iï", "ị"],
    ["oø", "ò"],
    ["où", "ó"],
    ["oû", "ỏ"],
    ["oõ", "õ"],
    ["oï", "ọ"],
    ["uø", "ù"],
    ["uù", "ú"],
    ["uû", "ủ"],
    ["uõ", "ũ"],
    ["uï", "ụ"],
    ["yø", "ỳ"],
    ["yù", "ý"],
    ["yû", "ỷ"],
    ["yõ", "ỹ"],
    ["yï", "ỵ"],
    ["aâ", "â"],
    ["eê", "ê"],
    ["oô", "ô"],
    ["aæ", "ă"],
  ];
  const seen = new Set<string>();
  const out: [string, string][] = [];
  for (const p of raw.sort((a, b) => b[0].length - a[0].length)) {
    if (p[0].length < 2 || seen.has(p[0])) continue;
    seen.add(p[0]);
    out.push(p);
  }
  return out;
}

const VNI_PAIRS = vniPairs();

function convertTcvn3(text: string): string {
  let out = "";
  for (const ch of text) out += TCVN3_TO_UNICODE[ch] ?? ch;
  return out;
}

function tcvn3DistinctiveScore(text: string): number {
  let n = 0;
  for (const ch of text) {
    if (DISTINCTIVE_TCVN3.has(ch)) n += 1;
  }
  return n;
}

function convertVni(text: string): string {
  let i = 0;
  let out = "";
  while (i < text.length) {
    let hit = false;
    for (const [from, to] of VNI_PAIRS) {
      if (text.startsWith(from, i)) {
        out += to;
        i += from.length;
        hit = true;
        break;
      }
    }
    if (!hit) {
      out += text[i];
      i += 1;
    }
  }
  return out;
}

function vniScore(text: string): number {
  let n = 0;
  for (const [from] of VNI_PAIRS) {
    let idx = 0;
    while ((idx = text.indexOf(from, idx)) !== -1) {
      n += 1;
      idx += from.length;
    }
  }
  return n;
}

function unicodeVnDiacriticCount(text: string): number {
  let n = 0;
  for (const ch of text) {
    // Skip glyphs that are TCVN3 code points — they are not Unicode Vietnamese yet.
    if (Object.hasOwn(TCVN3_TO_UNICODE, ch)) continue;
    if (
      /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđÀÁẢÃẠĂẰẮẲẴẶÂẦẤẨẪẬÈÉẺẼẸÊỀẾỂỄỆÌÍỈĨỊÒÓỎỌÔỒỐỔỖỘƠỜỚỞỠỢÙÚỦŨỤƯỪỨỬỮỰỲÝỶỸỴĐ]/.test(
        ch,
      )
    ) {
      n += 1;
    }
  }
  return n;
}

export type LegacyVnMode = "none" | "tcvn3" | "vni";

export function detectLegacyVietnamese(text: string): LegacyVnMode {
  const distinctive = tcvn3DistinctiveScore(text);
  const vScore = vniScore(text);
  const uni = unicodeVnDiacriticCount(text);

  // Prefer VNI when digraph score is strong — VNI uses Latin-1 letters that
  // also appear in the TCVN3 map (ê/ù/…), so checking TCVN3 first would mangle it.
  if (vScore >= 3 && vScore > uni) return "vni";
  // Distinctive glyphs (µ ¶ · ¸ …) — ignore ©/café collisions for the score.
  if (distinctive >= 2 && distinctive > uni) return "tcvn3";
  return "none";
}

export function convertLegacyVietnamese(
  text: string,
  mode: LegacyVnMode = detectLegacyVietnamese(text),
): string {
  if (mode === "tcvn3") return convertTcvn3(text);
  if (mode === "vni") return convertVni(text);
  return text;
}

export function encodeTcvn3ForTest(unicode: string): string {
  const rev = new Map<string, string>();
  for (const [tcvn, uni] of Object.entries(TCVN3_TO_UNICODE)) {
    if (!rev.has(uni)) rev.set(uni, tcvn);
  }
  let out = "";
  for (const ch of unicode) out += rev.get(ch) ?? ch;
  return out;
}

export function encodeVniForTest(unicode: string): string {
  const rev = new Map<string, string>();
  for (const [from, to] of VNI_PAIRS) {
    if (!rev.has(to)) rev.set(to, from);
  }
  let out = "";
  for (const ch of unicode) out += rev.get(ch) ?? ch;
  return out;
}
