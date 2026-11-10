import ExcelJS from "exceljs";

/** Sparse JP leave-application form (方眼紙-style). */
export async function buildFormXlsx(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet("申請");
  sheet.mergeCells("A1:D1");
  sheet.getCell("A1").value = "休暇届";
  sheet.getCell("A3").value = "氏名";
  sheet.getCell("B3").value = "山田太郎";
  sheet.getCell("A4").value = "期間";
  sheet.getCell("B4").value = "2024-05-01";
  sheet.getCell("A5").value = "所属";
  sheet.getCell("B5").value = "経理部";
  sheet.getCell("A6").value = "請求日";
  sheet.getCell("B6").value = "2024-04-28";
  sheet.getCell("A8").value = "理由";
  sheet.getCell("B8").value = "私用";
  // Leave many empty cells in the used range
  sheet.getCell("D10").value = "";
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Dense rectangular data table — should stay on office extract. */
export async function buildDenseTableXlsx(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet("Sheet1");
  const rows = [
    ["氏名", "部署", "金額", "mã KH"],
    ["A", "営業", "100", "KH-1"],
    ["B", "経理", "200", "KH-2"],
    ["C", "人事", "300", "KH-3"],
    ["D", "開発", "400", "KH-4"],
    ["E", "営業", "500", "KH-5"],
    ["F", "経理", "600", "KH-6"],
    ["G", "人事", "700", "KH-7"],
  ];
  for (const row of rows) sheet.addRow(row);
  return Buffer.from(await wb.xlsx.writeBuffer());
}
