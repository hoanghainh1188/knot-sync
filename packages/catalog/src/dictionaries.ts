import { readFile } from "node:fs/promises";
import { parse } from "yaml";
import { CatalogError } from "./load.js";
import { emptyLabel, type CatalogLabel } from "./types.js";

/** Built-in romaji / Japanese ERP abbreviations (uppercase keys). */
export const ROMAJI_DICT: Record<string, { ja: string; en?: string }> = {
  CD: { ja: "コード", en: "code" },
  NM: { ja: "名称", en: "name" },
  KBN: { ja: "区分", en: "category" },
  KIN: { ja: "金額", en: "amount" },
  YMD: { ja: "年月日", en: "date" },
  TKSK: { ja: "得意先", en: "customer" },
  URI: { ja: "売上", en: "sales" },
  SYH: { ja: "商品", en: "product" },
  NO: { ja: "番号", en: "number" },
  DT: { ja: "日付", en: "date" },
  FLG: { ja: "フラグ", en: "flag" },
  RYK: { ja: "略称", en: "abbr" },
  ADR: { ja: "住所", en: "address" },
  TEL: { ja: "電話", en: "phone" },
};

/** Built-in unaccented Vietnamese abbreviations (lowercase keys). */
export const VI_DICT: Record<string, { vi: string; en?: string }> = {
  ma: { vi: "mã", en: "code" },
  ten: { vi: "tên", en: "name" },
  kh: { vi: "khách hàng", en: "customer" },
  nv: { vi: "nhân viên", en: "employee" },
  hd: { vi: "hóa đơn", en: "invoice" },
  sl: { vi: "số lượng", en: "quantity" },
  dg: { vi: "đơn giá", en: "unit price" },
  tt: { vi: "thanh toán", en: "payment" },
  ngay: { vi: "ngày", en: "date" },
  so: { vi: "số", en: "number" },
  dia: { vi: "địa chỉ", en: "address" },
  chi: { vi: "chi", en: "debit" },
  thu: { vi: "thu", en: "credit" },
};

export type CustomerDict = Record<string, Partial<CatalogLabel>>;

/** Split physical names on `_` / camelCase / digit boundaries. */
export function tokenizePhysicalName(name: string): string[] {
  const withBreaks = name
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .replace(/([0-9])([A-Za-z])/g, "$1_$2")
    .replace(/([A-Za-z])([0-9])/g, "$1_$2");
  return withBreaks
    .split(/[_\s.-]+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

function joinJa(parts: string[]): string {
  return parts.join("");
}

function joinVi(parts: string[]): string {
  return parts.join(" ");
}

function joinEn(parts: string[]): string {
  return parts.join(" ");
}

/** Suggest labels from built-in romaji dictionary. */
export function suggestFromRomaji(physicalName: string): CatalogLabel {
  const tokens = tokenizePhysicalName(physicalName);
  const ja: string[] = [];
  const en: string[] = [];
  let hit = false;
  for (const t of tokens) {
    const key = t.toUpperCase();
    const entry = ROMAJI_DICT[key];
    if (entry) {
      hit = true;
      ja.push(entry.ja);
      if (entry.en) en.push(entry.en);
    } else {
      ja.push(t);
      en.push(t);
    }
  }
  if (!hit) return emptyLabel();
  return { ja: joinJa(ja), vi: "", en: joinEn(en) };
}

/** Suggest labels from built-in Vietnamese dictionary. */
export function suggestFromVietnamese(physicalName: string): CatalogLabel {
  const tokens = tokenizePhysicalName(physicalName);
  const vi: string[] = [];
  const en: string[] = [];
  let hit = false;
  for (const t of tokens) {
    const key = t.toLowerCase();
    const entry = VI_DICT[key];
    if (entry) {
      hit = true;
      vi.push(entry.vi);
      if (entry.en) en.push(entry.en);
    } else {
      vi.push(t);
      en.push(t);
    }
  }
  if (!hit) return emptyLabel();
  return { ja: "", vi: joinVi(vi), en: joinEn(en) };
}

/** Merge customer dictionary over a physical name. */
export function suggestFromCustomerDict(
  physicalName: string,
  dict: CustomerDict,
): CatalogLabel {
  const direct = dict[physicalName] ?? dict[physicalName.toLowerCase()];
  if (direct) {
    return {
      ja: direct.ja ?? "",
      vi: direct.vi ?? "",
      en: direct.en ?? "",
    };
  }
  const tokens = tokenizePhysicalName(physicalName);
  const ja: string[] = [];
  const vi: string[] = [];
  const en: string[] = [];
  let hit = false;
  for (const t of tokens) {
    const entry = dict[t] ?? dict[t.toLowerCase()] ?? dict[t.toUpperCase()];
    if (entry) {
      hit = true;
      ja.push(entry.ja ?? t);
      vi.push(entry.vi ?? t);
      en.push(entry.en ?? t);
    } else {
      ja.push(t);
      vi.push(t);
      en.push(t);
    }
  }
  if (!hit) return emptyLabel();
  return { ja: joinJa(ja), vi: joinVi(vi), en: joinEn(en) };
}

/** Load a customer dictionary YAML/JSON: token → {ja?,vi?,en?}. */
export async function loadCustomerDictionary(path: string): Promise<CustomerDict> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch {
    throw new CatalogError(
      `Customer dictionary not found: ${path}. Fix catalog.dictionary or remove it from config.`,
    );
  }
  let raw: unknown;
  try {
    raw = parse(text);
  } catch (err) {
    throw new CatalogError(`Invalid dictionary YAML: ${(err as Error).message}`);
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new CatalogError("Customer dictionary must be a YAML object of token → labels.");
  }
  const out: CustomerDict = Object.create(null);
  for (const [token, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === "string") {
      out[token] = { ja: value, vi: value, en: value };
      continue;
    }
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new CatalogError(
        `Dictionary entry "${token}" must be a string or {ja,vi,en} object.`,
      );
    }
    const o = value as Record<string, unknown>;
    const label: Partial<CatalogLabel> = {};
    for (const k of ["ja", "vi", "en"] as const) {
      if (o[k] !== undefined) {
        if (typeof o[k] !== "string") {
          throw new CatalogError(`Dictionary "${token}".${k} must be a string.`);
        }
        label[k] = o[k] as string;
      }
    }
    out[token] = label;
  }
  return out;
}

/** Combine romaji + Vietnamese suggestions (non-empty fields win left-to-right). */
export function combineLabels(...labels: CatalogLabel[]): CatalogLabel {
  const out = emptyLabel();
  for (const l of labels) {
    if (l.ja) out.ja = l.ja;
    if (l.vi) out.vi = l.vi;
    if (l.en) out.en = l.en;
  }
  return out;
}
