# Cẩm nang Triển khai Pilot Doanh nghiệp KnotSync (3 Bước)

> **Ngôn ngữ:** [English](../PILOT_PLAYBOOK.md) · [日本語](../ja/PILOT_PLAYBOOK.md) · Tiếng Việt

Tài liệu này hướng dẫn đội ngũ IT nội bộ và SIer triển khai thử nghiệm KnotSync trong **5 ngày** dưới dạng **máy chủ LAN dùng chung** (Model B), đảm bảo không chỉnh sửa dữ liệu gốc và không gửi dữ liệu ra ngoài Internet.

## Cam kết Bảo mật & Chỉ đọc (Read-Only)

- **Gắn ổ đĩa chỉ đọc ở mức OS (`:ro`)**: Trong [deploy/docker-compose.lan.yml](../../deploy/docker-compose.lan.yml), thư mục tài liệu khách hàng và file `knot-sync.config.yaml` được mount `:ro` (chỉ đọc). KnotSync không bao giờ ghi đè, di chuyển hay xoá file nguồn.
- **Container non-root**: [Dockerfile](../../Dockerfile) chính thức chạy bằng user không đặc quyền `node`.
- **100% cục bộ / offline**: Sau khi kéo Docker image, toàn bộ quá trình quét, che PII, lập chỉ mục SQLite FTS và các tuỳ chọn OCR (`docling-serve-cpu`) hoặc LLM nội bộ (`ollama`) đều chạy hoàn toàn trong mạng LAN.

---

## Bước 1 (Ngày 1): Kiểm kê Dữ liệu & Báo cáo Rủi ro PII

Chạy quét chỉ đọc ban đầu để thống kê số lượng file, file lỗi/rỗng và ước lượng dữ liệu nhạy cảm (PII) trước khi mở cho AI:

```bash
npx @hoanghainh/knot-sync scan --config knot-sync.config.yaml --pii --report
```

- Lệnh xuất ra file báo cáo HTML offline tự chứa (`./knot-sync-scan-report.html`).
- Cùng bộ phận nghiệp vụ và bảo mật rà soát báo cáo để chốt `pii.rules`, `pii.allowlist`, và `source.allow`.

---

## Bước 2 (Ngày 2–3): Chuẩn hoá Semantic Catalog (Cơ sở dữ liệu / ERP)

Nếu doanh nghiệp có bảng SQL/ERP với tên cột viết tắt khó hiểu (ví dụ `TKSK_CD`, `ma_kh`), hãy tạo bản nháp Semantic Catalog và duyệt cùng trưởng bộ phận:

```bash
npx @hoanghainh/knot-sync describe --config knot-sync.config.yaml
npx @hoanghainh/knot-sync ui --config knot-sync.config.yaml
```

- Mở giao diện cục bộ (`http://127.0.0.1:3939`) để duyệt nhãn nghiệp vụ tiếng Việt, tiếng Nhật, tiếng Anh, danh sách giá trị hợp lệ, khoá ngoại `references`, và các `lookupJoins` đã duyệt (`reviewed: true`).
- Các mục có `reviewed: true` trong `knot-sync.catalog.yaml` sẽ được giữ nguyên ở những lần chạy `describe` sau.

---

## Bước 3 (Ngày 4–5): Khởi chạy Máy chủ MCP LAN cho Nhóm

1. **Cấu hình biến môi trường (`deploy/.env`)**:
   ```bash
   cp deploy/.env.example deploy/.env
   # Đặt KNOT_SYNC_API_KEY (ví dụ: openssl rand -hex 32)
   # Đặt KNOT_SYNC_SOURCES_DIR và KNOT_SYNC_CONFIG
   mkdir -p deploy/.data && chown 1000:1000 deploy/.data
   ```

2. **Khởi động dịch vụ LAN**:
   ```bash
   # Cấu hình cơ bản (mount :ro chỉ đọc, chạy `serve --http --host 0.0.0.0 --port 3940 --sync-interval 300`)
   docker compose -f deploy/docker-compose.lan.yml up -d

   # Tuỳ chọn: bật thêm Docling OCR offline và/hoặc Ollama nội bộ
   docker compose -f deploy/docker-compose.lan.yml --profile ocr --profile local-ai up -d
   ```

3. **Kiểm tra trạng thái healthcheck**:
   ```bash
   docker compose -f deploy/docker-compose.lan.yml ps
   ```

4. **Kết nối từ máy nhân viên (Claude Desktop / Cursor)**:
   Trỏ MCP client tới `http://<lan-server-ip>:3940/mcp` kèm Bearer token:
   ```json
   {
     "mcpServers": {
       "knot-sync-lan": {
         "url": "http://192.168.1.50:3940/mcp",
         "headers": {
           "Authorization": "Bearer <KNOT_SYNC_API_KEY>"
         }
       }
     }
   }
   ```
