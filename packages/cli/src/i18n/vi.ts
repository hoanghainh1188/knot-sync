import type { MessageCatalog } from "./messages.js";

export const vi: MessageCatalog = {
  help: `KnotSync (knot-sync) {version}
Quét, làm sạch và phục vụ dữ liệu doanh nghiệp cũ cho agent AI qua MCP.
Mọi thứ chạy trên máy này. Nguồn chỉ được đọc, không bị thay đổi.

Cách dùng:
  knot-sync <command> [options]

Lệnh (theo quy trình):
  1. Thiết lập & Kiểm kê:
    init      Tạo file cấu hình trong thư mục hiện tại
    scan      Kiểm kê nguồn: loại file, kích thước, trùng lặp, file cũ

  2. Chuẩn bị dữ liệu:
    run       Trích xuất text/bảng từ lần scan gần nhất vào kho tài liệu
    describe  (SQL) Tạo/cập nhật knot-sync.catalog.yaml cho nguồn SQL
    ui        (SQL) Mở UI duyệt catalog cục bộ (chỉ 127.0.0.1)

  3. Phục vụ AI:
    serve     Khởi động MCP server (mặc định stdio; tùy chọn --http cho team/LAN)

  Tùy chọn / Bảo trì:
    bench     Đo giảm token và độ chính xác suite trên kho cục bộ
    optimize  Nén FTS5 và checkpoint WAL của kho (chạy khi không ghi)
    embed     Nhúng hàng loạt tài liệu cho tìm kiếm vector (cần plugin search-vector)
    plugins   Liệt kê plugin đã tải và điểm mở rộng

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

Tùy chọn bench:
  --json                In kết quả dạng JSON (khóa tiếng Anh)
  --suite <file>        Suite YAML (mặc định: knot-sync.bench.yaml cạnh config)

Tùy chọn ui:
  --port <number>       Cổng loopback (mặc định: 8787)

Tùy chọn serve:
  --http                   Phục vụ MCP qua HTTP (Streamable HTTP tại /mcp)
  --port <number>          Cổng HTTP (mặc định: 3000; ui cũng dùng)
  --host <address>         Địa chỉ bind HTTP (mặc định: 127.0.0.1)
  --sync-interval <giây>   Tự động scan+sync định kỳ nền (hoặc server.sync_interval_seconds)
  Env KNOT_SYNC_API_KEY    Bắt buộc khi dùng --http (Bearer token dùng chung)

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
  "scan.next":
    "Tiếp theo: chạy `knot-sync run` để trích xuất, làm sạch và che PII vào kho cục bộ (hoặc thêm `--report` để xuất HTML).",
  "run.noInventory":
    'Không tìm thấy kiểm kê scan trong {path}.\nChạy "knot-sync scan" trước, rồi "knot-sync run".',
  "run.complete":
    "run xong: {extracted} đã trích, {skipped} không đổi, {pruned} đã dọn, {failed} sự cố",
  "run.issuesHeader": "\nSự cố:",
  "run.andMoreIssues": "  … và {n} nữa",
  "run.documentsSaved": "Đã lưu tài liệu vào {path}",
  "run.next":
    "Tiếp theo: chạy `knot-sync serve` để kết nối AI agent qua MCP (hoặc `knot-sync bench` để đo mức giảm token).",
  "run.issueLicense":
    "Thiếu hoặc sai giấy phép OCR. Đặt KNOT_SYNC_OCR_LICENSE (hoặc extractor-ocr.licenseKey), rồi chạy lại knot-sync run.",
  "run.issueHousenLicense":
    "Thiếu hoặc sai giấy phép Housen Excel. Đặt KNOT_SYNC_HOUSEN_LICENSE (hoặc extractor-housen.licenseKey), rồi chạy lại knot-sync run.",
  "run.issueDocker":
    "OCR cần Docker. Cài/khởi động Docker, pull quay.io/docling-project/docling-serve-cpu:v1.38.2, rồi chạy lại knot-sync run.",
  "plugins.header":
    "Plugin đã tải (in-process, toàn quyền — chỉ cài plugin bạn tin tưởng):",
  "plugins.none": "  (không có)",
  "plugins.noExtensions": "(không có extension)",
  "serve.listening":
    "KnotSync MCP server trên stdio. Store: {store}. Audit: {audit}.",
  "serve.listeningHttp":
    "KnotSync MCP server tại http://{host}:{port}/mcp (Bearer). Store: {store}. Audit: {audit}.",
  "serve.invalidPort":
    'Giá trị --port "{value}" không hợp lệ. Dùng số nguyên từ 1 đến 65535.',
  "serve.invalidSyncInterval":
    'Giá trị --sync-interval "{value}" không hợp lệ. Dùng số giây dương.',
  "serve.catalogSuffix": " Catalog: {path}.",
  "serve.syncSuffix": " Đồng bộ định kỳ: mỗi {seconds} giây.",
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
  "bench.emptyStore":
    "Không có tài liệu trong {path}.\nChạy \"knot-sync scan\" rồi \"knot-sync run\" trước khi bench.",
  "bench.tokensHeader": "Ước lượng token (metadata cleaner)",
  "bench.tokensLine":
    "  before={before} after={after} saved={saved} ({pct}%) documents={documents} skipped={skipped}",
  "bench.noSuite":
    "Không có file suite (tuỳ chọn). Thêm knot-sync.bench.yaml cạnh config hoặc dùng --suite.",
  "bench.suiteHeader": "Suite: {path}",
  "bench.searchSummary": "Suite tìm kiếm (kho đã làm sạch): {passed} đạt, {failed} lỗi",
  "bench.catalogSummary":
    "Giải cột catalog: {passed} đạt, {failed} lỗi (before ok={before}, after ok={after})",
  "bench.catalogSkipped": "Bỏ qua suite catalog: {reason}",
  "optimize.done":
    "Đã tối ưu kho tại {path} (FTS optimize + WAL checkpoint).",
  "optimize.storeOpenFailed":
    'Không mở được kho tại {path} ({detail}).\nChạy "knot-sync init", "knot-sync scan", rồi "knot-sync run" trước, sau đó thử lại "knot-sync optimize".',
  "embed.done":
    "Đã nhúng vector: written={written}, skipped={skipped}, failed={failed}.",
  "embed.failed":
    "Nhúng vector thất bại ({detail}). Kiểm tra cấu hình search-vector, license và endpoint nhúng cục bộ, rồi thử lại.",
  "embed.pluginMissing":
    'Lệnh "embed" cần plugin search-vector.\nThêm packages/search-vector vào plugins:, đặt KNOT_SYNC_SEARCH_VECTOR_LICENSE, rồi thử lại.',
  "logging.unknownKey":
    'Khóa không hợp lệ "{key}" trong "logging". Chỉ cho phép: path, level.',
  "logging.invalidLevel":
    '"logging.level" phải là một trong: info, warn, error (nhận được {value}). Hãy sửa logging.level trong cấu hình.',
  "logging.emptyPath":
    '"logging.path" phải là chuỗi không rỗng. Đặt logging.path bên ngoài các nguồn đã cấu hình.',
  "logging.pathInsideSource":
    'Từ chối ghi system log bên trong đường dẫn nguồn "{src}". Đặt logging.path ra ngoài các nguồn đã cấu hình.',
  "logging.writeFailed":
    "Ghi system log thất bại: {detail}. Kết quả lệnh không đổi.",
};