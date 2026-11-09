/** Curated Japanese surnames (kanji) for label-gated person-name heuristics. */
export const JP_SURNAMES = [
  "山田",
  "佐藤",
  "鈴木",
  "高橋",
  "田中",
  "伊藤",
  "渡辺",
  "中村",
  "小林",
  "加藤",
] as const;

/** Curated Japanese given names. */
export const JP_GIVEN = [
  "太郎",
  "花子",
  "一郎",
  "次郎",
  "美咲",
  "健太",
  "翔太",
  "陽子",
] as const;

/** Common Vietnamese family names (canonical + ASCII fold). */
export const VN_FAMILY = [
  "Nguyễn",
  "Nguyen",
  "Trần",
  "Tran",
  "Lê",
  "Le",
  "Phạm",
  "Pham",
  "Hoàng",
  "Hoang",
  "Huỳnh",
  "Huynh",
  "Phan",
  "Vũ",
  "Vu",
  "Võ",
  "Vo",
  "Đặng",
  "Dang",
  "Bùi",
  "Bui",
  "Đỗ",
  "Do",
  "Hồ",
  "Ho",
  "Ngô",
  "Ngo",
  "Dương",
  "Duong",
] as const;

/** Common Vietnamese middle / given tokens. */
export const VN_GIVEN = [
  "Văn",
  "Van",
  "Thị",
  "Thi",
  "Hữu",
  "Huu",
  "Đức",
  "Duc",
  "Minh",
  "An",
  "Anh",
  "Linh",
  "Hà",
  "Ha",
  "Nam",
  "Lan",
] as const;

/** Labels that gate person-name detection (case-insensitive for Latin). */
export const NAME_LABELS = [
  "氏名",
  "名前",
  "姓名",
  "Họ tên",
  "Ho ten",
  "Họ và tên",
  "Ho va ten",
  "Full name",
  "Name:",
] as const;
