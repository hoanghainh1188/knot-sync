# KnotSync (Tổng quan tiếng Việt)

KnotSync chuẩn hóa dữ liệu doanh nghiệp cũ (Excel, Word, PDF, thư mục chia sẻ,
PostgreSQL / MySQL…) và cung cấp cho AI agent qua
[MCP](https://modelcontextprotocol.io).

## Điều kiện

- Node.js ≥ 22.13
- Chạy **hoàn toàn trên máy của bạn** (không telemetry)
- Nguồn dữ liệu chỉ **đọc**, không ghi đè / không sửa file hay database khách hàng

## Cài đặt

```bash
npx @hoanghainh/knot-sync init --path /path/to/shared/folder
npx @hoanghainh/knot-sync scan
npx @hoanghainh/knot-sync run
npx @hoanghainh/knot-sync describe   # Nếu có SQL: tạo Semantic Catalog
npx @hoanghainh/knot-sync ui         # Duyệt catalog (chỉ 127.0.0.1)
npx @hoanghainh/knot-sync bench      # Token + độ chính xác suite (cục bộ)
npx @hoanghainh/knot-sync serve      # MCP (stdio)
```

Sau khi publish, kiểm tra:

```bash
npx @hoanghainh/knot-sync@0.1.0 --version
```

## Lệnh chính

| Lệnh | Mô tả |
|---|---|
| `init` | Tạo file cấu hình |
| `scan` | Kiểm kê nguồn (loại file, trùng, file cũ…) |
| `run` | Trích xuất văn bản/bảng vào store cục bộ |
| `describe` | Sinh/cập nhật Semantic Catalog cho SQL (`knot-sync.catalog.yaml`) |
| `ui` | UI cục bộ để duyệt catalog / lưu `reviewed` (127.0.0.1) |
| `bench` | Ước lượng token trước/sau làm sạch và độ chính xác suite (search/catalog) |
| `plugins` | Liệt kê plugin đã nạp |
| `serve` | Chạy MCP server (stdio) |

`bench` đọc store sau `scan` / `run`. Tuỳ chọn chạy `knot-sync.bench.yaml` cạnh
config (hoặc `--suite`). Không ghi vào thư mục/nguồn khách hàng.

### Ngôn ngữ thông báo

Hiện trợ giúp / lỗi bằng tiếng Việt:

```bash
npx @hoanghainh/knot-sync --help --lang vi
```

Hoặc cấu hình `cli.locale: vi` (`--lang` được ưu tiên hơn). Tên lệnh và khóa `--json` vẫn là tiếng Anh.

Chi tiết (tiếng Anh): [README.md](../../README.md) và
[docs/ROADMAP.md](../ROADMAP.md).
