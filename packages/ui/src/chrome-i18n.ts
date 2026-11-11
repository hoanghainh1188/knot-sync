export type UiLocale = "en" | "ja" | "vi";

type Dict = Record<string, string>;

const en: Dict = {
  title: "KnotSync — Catalog review",
  subtitle: "Review Semantic Catalog labels. Sources are never modified.",
  contextBanner:
    "Give abbreviated database columns (like TKSK_CD or ma_kh) human business labels so AI agents write accurate SQL queries. Edits save only to knot-sync.catalog.yaml — your source databases are never modified.",
  loading: "Loading catalog…",
  loadError: "Could not load catalog",
  save: "Save",
  saving: "Saving…",
  saved: "Saved",
  saveError: "Save failed",
  filterUnreviewed: "Unreviewed only",
  sources: "Sources",
  tables: "Tables",
  columns: "Columns",
  empty: "No catalog entries. Run knot-sync describe first.",
  labelJa: "Label (ja)",
  labelVi: "Label (vi)",
  labelEn: "Label (en)",
  description: "Description",
  values: "Values (comma-separated)",
  pii: "PII",
  expose: "Expose",
  reviewed: "Reviewed",
  physical: "Physical name",
  selectColumn: "Select a column to edit",
  reviewedBadge: "reviewed",
  unreviewedBadge: "needs review",
};

const ja: Dict = {
  ...en,
  title: "KnotSync — カタログレビュー",
  subtitle: "Semantic Catalog のラベルを確認します。ソースは変更しません。",
  contextBanner:
    "略称の DB 列名（TKSK_CD や ma_kh など）に業務上の日本語／ベトナム語ラベルを付け、AI が正しい SQL を生成できるようにする画面です。変更は knot-sync.catalog.yaml のみに保存され、元のデータベースは変更されません。",
  loading: "カタログを読み込み中…",
  loadError: "カタログを読めませんでした",
  save: "保存",
  saving: "保存中…",
  saved: "保存しました",
  saveError: "保存に失敗しました",
  filterUnreviewed: "未レビューのみ",
  sources: "ソース",
  tables: "テーブル",
  columns: "列",
  empty: "カタログが空です。先に knot-sync describe を実行してください。",
  labelJa: "ラベル (ja)",
  labelVi: "ラベル (vi)",
  labelEn: "ラベル (en)",
  description: "説明",
  values: "値（カンマ区切り）",
  pii: "PII",
  expose: "公開",
  reviewed: "レビュー済み",
  physical: "物理名",
  selectColumn: "編集する列を選んでください",
  reviewedBadge: "確認済",
  unreviewedBadge: "要確認",
};

const vi: Dict = {
  ...en,
  title: "KnotSync — Duyệt catalog",
  subtitle: "Xem lại nhãn Semantic Catalog. Nguồn không bị sửa.",
  contextBanner:
    "Đặt nhãn tiếng người cho các cột database viết tắt (như TKSK_CD hoặc ma_kh) để AI viết câu truy vấn SQL chính xác. Thay đổi chỉ lưu vào file knot-sync.catalog.yaml — database gốc không bao giờ bị sửa.",
  loading: "Đang tải catalog…",
  loadError: "Không tải được catalog",
  save: "Lưu",
  saving: "Đang lưu…",
  saved: "Đã lưu",
  saveError: "Lưu thất bại",
  filterUnreviewed: "Chỉ chưa duyệt",
  sources: "Nguồn",
  tables: "Bảng",
  columns: "Cột",
  empty: "Catalog trống. Chạy knot-sync describe trước.",
  labelJa: "Nhãn (ja)",
  labelVi: "Nhãn (vi)",
  labelEn: "Nhãn (en)",
  description: "Mô tả",
  values: "Giá trị (cách nhau bởi dấu phẩy)",
  pii: "PII",
  expose: "Expose",
  reviewed: "Đã duyệt",
  physical: "Tên vật lý",
  selectColumn: "Chọn một cột để sửa",
  reviewedBadge: "đã duyệt",
  unreviewedBadge: "cần duyệt",
};

const catalogs: Record<UiLocale, Dict> = { en, ja, vi };

export function resolveUiLocale(search: string): UiLocale {
  const q = search.startsWith("?") ? search.slice(1) : search;
  const params = new URLSearchParams(q);
  const lang = params.get("lang");
  if (lang === "ja" || lang === "vi" || lang === "en") return lang;
  return "en";
}

export function uiT(locale: UiLocale, key: string): string {
  return catalogs[locale][key] ?? catalogs.en[key] ?? key;
}

/** Columns visible when unreviewed-only filter is on. */
export function filterColumnNames(
  columns: Record<string, { reviewed: boolean }>,
  unreviewedOnly: boolean,
): string[] {
  return Object.keys(columns).filter((name) => {
    if (!unreviewedOnly) return true;
    return !columns[name]?.reviewed;
  });
}
