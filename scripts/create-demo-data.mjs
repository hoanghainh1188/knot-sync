#!/usr/bin/env node
/**
 * Generate a local, synthetic Japanese + Vietnamese demo dataset into
 * `examples/.demo-data/` so evaluators can run `scan`, `run`, and `ui`
 * end-to-end without committing binary Office blobs.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const requireFromExtractor = createRequire(
  join(repoRoot, "packages/extractor-office/package.json"),
);
const ExcelJS = requireFromExtractor("exceljs");

/**
 * Compute Japanese My Number check digit for an 11-digit base string.
 * @param {string} base11
 * @returns {string}
 */
function buildSyntheticMyNumber(base11) {
  let sum = 0;
  for (let n = 1; n <= 11; n += 1) {
    const p = Number(base11[11 - n]);
    const q = n <= 6 ? n + 1 : n - 5;
    sum += p * q;
  }
  const rem = sum % 11;
  const check = rem <= 1 ? 0 : 11 - rem;
  return `${base11}${check}`;
}

/**
 * Create the demo directory and sample files.
 * @param {string} [targetDir]
 * @returns {Promise<string>} Absolute path to generated directory.
 */
export async function createDemoData(
  targetDir = join(repoRoot, "examples/.demo-data"),
) {
  const jaDir = join(targetDir, "営業");
  const viDir = join(targetDir, "Phòng Kế toán");
  await mkdir(jaDir, { recursive: true });
  await mkdir(viDir, { recursive: true });

  // 1. Japanese Excel workbook with Wareki dates, full-width text, blank rows, and synthetic My Number.
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("契約一覧");
  ws.addRow(["契約番号", "取引先名", "契約日", "金額", "担当者マイナンバー"]);
  ws.addRow([
    "J-2024-001",
    "ＡＢＣ株式会社",
    "令和6年4月1日",
    "１５０００００",
    buildSyntheticMyNumber("12345678901"),
  ]);
  ws.addRow([]);
  ws.addRow([]);
  ws.addRow([
    "J-2024-002",
    "ＸＹＺ商事",
    "平成31年3月15日",
    "８０００００",
    "sales-demo@example.jp",
  ]);
  await wb.xlsx.writeFile(join(jaDir, "契約一覧_2024.xlsx"));

  // 2. Vietnamese legacy TCVN3 text report with synthetic CCCD and phone.
  const tcvn3Report = [
    "B¸o c¸o doanh thu Hµ Néi: NguyÔn V¨n A ®· ký hîp ®ång",
    "CCCD: 079123456789",
    "SDT: 0912345678",
    "Email: ketoan@example.vn",
  ].join("\n");
  await writeFile(join(viDir, "bao_cao_tcvn3.txt"), tcvn3Report, "utf8");

  // 3. Clean UTF-8 CSV customer list.
  const csvRows = [
    "ma_kh,ten_kh,ngay_ky,ghi_chu",
    "KH001,Công ty ABC,2024/04/01,Hợp đồng bảo trì năm 2024",
    "KH002,Công ty XYZ,2024/05/10,Gia hạn hệ thống",
  ].join("\n");
  await writeFile(join(viDir, "danh_sach_khach_hang.csv"), csvRows, "utf8");

  return targetDir;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = await createDemoData();
  console.log(`Demo data created in ${out}`);
}
