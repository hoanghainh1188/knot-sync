import type { MessageCatalog } from "./messages.js";

export const vi: MessageCatalog = {
  help: `KnotSync (knot-sync) {version}
Quét, làm sạch và phục vụ dữ liệu doanh nghiệp cũ cho agent AI qua MCP.
Mọi thứ chạy trên máy này. Nguồn chỉ được đọc, không bị thay đổi.

Cách dùng:
  knot-sync <command> [options]

Lệnh:
  init      Tạo file cấu hình trong thư mục hiện tại
  scan      Kiểm kê nguồn: loại file, kích thước, trùng lặp, file cũ
  run       Trích xuất text/bảng từ lần scan gần nhất vào kho tài liệu
  describe  Tạo/cập nhật knot-sync.catalog.yaml cho nguồn SQL
  ui        Mở UI duyệt catalog cục bộ (chỉ 127.0.0.1)
  plugins   Liệt kê plugin đã tải và điểm mở rộng
  serve     Khởi động MCP server (chỉ stdio; cho Claude Desktop / Cursor / Claude Code)

Tùy chọn:
  -c, --config <file>   File cấu hình (mặc định: {configFile})
  --lang <en|ja|vi>     Ngôn ngữ thông báo CLI (mặc định: en, hoặc cli.locale / env)
  -h, --help            Hiện trợ giúp
  -v, --version         Hiện phiên bản

Tùy chọn init:
  --path <folder>       Thư mục cần quét (ghi vào cấu hình)
  --force               Ghi đè file cấu hình đã có

Tùy chọn scan:
  --json                In kết quả dạng JSON
  --pii                 Ước lượng số file text có vẻ chứa PII
  --report [file]       Ghi báo cáo HTML tự chứa (mặc định: ./knot-sync-scan-report.html)

Tùy chọn ui:
  --port <number>       Cổng loopback (mặc định: 8787)

plugins:
  Plugin chạy in-process với toàn quyền. Chỉ cài plugin bạn tin tưởng.
  Plugin trả phí tự kiểm tra license; lõi không kiểm tra.
`,
  "error.prefix": "Lỗi: {message}",
  "error.configPrefix": "Lỗi cấu hình: {message}",
  "error.catalogPrefix": "Lỗi catalog: {message}",
  "error.unknownCommand": 'Lệnh không tồn tại "{command}".',
  "error.invalidLang":
    'Giá trị --lang "{value}" không hợp lệ. Cho phép: en, ja, vi. Sửa --lang hoặc cli.locale.',
  "init.exists": "{path} đã tồn tại. Dùng --force để ghi đè.",
  "init.created": "Đã tạo {path}",
  "init.next": 'Tiếp theo: sửa "sources", rồi chạy: knot-sync scan',
  "scan.inventorySaved": "Đã lưu kiểm kê vào {path}",
  "scan.htmlReport": "Đã ghi báo cáo HTML vào {path}",
  "scan.progressFiles": "  [{sourceId}] {count} file…",
  "scan.sourceHeader": '\n■ Nguồn "{sourceId}": {files} file, {bytes}',
  "scan.byType": "\n  Theo loại:",
  "scan.health": "\n  Tình trạng:",
  "scan.dupCopies": "Bản sao trùng",
  "scan.olderThan": "Cũ hơn {years} năm",
  "scan.emptyFiles": "File rỗng",
  "scan.unreadable": "Không đọc được",
  "scan.likelyPii": "Có thể là PII (mẫu)",
  "scan.wasted": "{bytes} lãng phí",
  "scan.biggestDupes": "\n  Trùng lớn nhất:",
  "scan.andMorePaths": "      … và {n} nữa",
  "scan.couldNotRead": "\n  Không đọc được:",
  "scan.andMoreIssues": "    … và {n} nữa",
  "run.noInventory":
    'Không tìm thấy kiểm kê scan trong {path}.\nChạy "knot-sync scan" trước, rồi "knot-sync run".',
  "run.complete":
    "run xong: {extracted} đã trích, {skipped} không đổi, {failed} sự cố",
  "run.issuesHeader": "\nSự cố:",
  "run.andMoreIssues": "  … và {n} nữa",
  "run.documentsSaved": "Đã lưu tài liệu vào {path}",
  "plugins.header":
    "Plugin đã tải (in-process, toàn quyền — chỉ cài plugin bạn tin tưởng):",
  "plugins.none": "  (không có)",
  "plugins.noExtensions": "(không có extension)",
  "serve.listening":
    "KnotSync MCP server trên stdio. Store: {store}. Audit: {audit}.",
  "serve.catalogSuffix": " Catalog: {path}.",
  "describe.noSql":
    'Không có nguồn postgres/mysql. Thêm nguồn SQL kèm danh sách "allow", rồi chạy lại describe.',
  "describe.moreWarnings": "…và {n} cảnh báo bỏ qua sample nữa",
  "describe.wrote": "Đã ghi catalog {path}",
  "describe.counts": "Nguồn: {sources}, bảng: {tables}, cột: {columns}",
  "describe.next":
    "Tiếp theo: xem lại nhãn, đặt reviewed: true cho mục đã xác nhận, rồi knot-sync serve",
  "ui.listening":
    "UI duyệt catalog tại {url} (chỉ loopback). Nhấn Ctrl+C để dừng.",
  "ui.openHint": "Mở URL trên trình duyệt máy này. File catalog: {path}",
};