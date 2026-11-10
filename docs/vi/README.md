# KnotSync (Tổng quan tiếng Việt)

KnotSync chuẩn hóa dữ liệu doanh nghiệp cũ (Excel, Word, PDF, thư mục chia sẻ,
PostgreSQL / MySQL…) và cung cấp cho AI agent qua
[MCP](https://modelcontextprotocol.io).

## Điều kiện

- Node.js ≥ 22.13
- Chạy **ưu tiên cục bộ** (không telemetry; free core không gọi mạng ra ngoài khi chạy)
- Plugin trả phí (tuỳ chọn) có thể gọi **Ollama / Docker / OCR cục bộ** trên máy hoặc LAN
- Nguồn dữ liệu chỉ **đọc**, không ghi đè / không sửa file hay database khách hàng
- Chỉ số hiệu quả (token, độ chính xác tìm kiếm…) đo bằng `knot-sync bench` trên
  dữ liệu của bạn — không dùng số % marketing chung
- Hiện tại: open-core v0.1–v0.3 và Paid #1–#7 đã xong. Tiếp theo: After v1.0 (write tools, có duyệt người). Chi tiết [docs/ROADMAP.md](../ROADMAP.md)

## Cài đặt

```bash
npx @hoanghainh/knot-sync init --path /path/to/shared/folder
npx @hoanghainh/knot-sync scan
npx @hoanghainh/knot-sync run
npx @hoanghainh/knot-sync describe   # Nếu có SQL: tạo Semantic Catalog
npx @hoanghainh/knot-sync ui         # Duyệt catalog (chỉ 127.0.0.1)
npx @hoanghainh/knot-sync bench      # Token + suite (cục bộ)
npx @hoanghainh/knot-sync optimize   # FTS / WAL khi máy rảnh
npx @hoanghainh/knot-sync serve      # MCP (stdio)
# Tuỳ chọn: export KNOT_SYNC_API_KEY=... && knot-sync serve --http
```

Sau khi publish, kiểm tra:

```bash
npx @hoanghainh/knot-sync@0.1.3 --version
```

## Lệnh chính

| Lệnh | Mô tả |
|---|---|
| `init` | Tạo file cấu hình |
| `scan` | Kiểm kê nguồn (loại file, trùng, file cũ…) |
| `run` | Trích xuất văn bản/bảng vào store cục bộ |
| `describe` | Sinh/cập nhật Semantic Catalog cho SQL (`knot-sync.catalog.yaml`) |
| `ui` | UI cục bộ để duyệt catalog / lưu `reviewed` (127.0.0.1) |
| `bench` | Ước lượng token trước/sau làm sạch và suite (search/catalog) |
| `optimize` | FTS5 optimize + WAL checkpoint cho store |
| `plugins` | Liệt kê plugin đã nạp |
| `serve` | Chạy MCP server (stdio, hoặc `--http` + API key) |
| `embed` | Nhúng vector hàng loạt (cần plugin `search-vector`) |

`bench` đọc store sau `scan` / `run`. Tuỳ chọn chạy `knot-sync.bench.yaml` cạnh
config (hoặc `--suite`). Không ghi vào thư mục/nguồn khách hàng. Kết quả phụ
thuộc dữ liệu; không có “% tiết kiệm token” cố định trên trang marketing.

Plugin trả phí (OCR / 方眼紙 / SQL doanh nghiệp / OAuth / catalog-llm /
search-vector / guard-llm) bật bằng `plugins:` + biến môi trường license. Chi tiết
tiếng Anh: bảng Paid plugins trong [README.md](../../README.md).

### Ngôn ngữ thông báo

Hiện trợ giúp / lỗi bằng tiếng Việt:

```bash
npx @hoanghainh/knot-sync --help --lang vi
```

Hoặc cấu hình `cli.locale: vi` (`--lang` được ưu tiên hơn). Tên lệnh và khóa `--json` vẫn là tiếng Anh.

Chi tiết (tiếng Anh): [README.md](../../README.md) và
[docs/ROADMAP.md](../ROADMAP.md).
