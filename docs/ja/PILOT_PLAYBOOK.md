# KnotSync エンタープライズ・パイロット導入プレイブック（3ステップ）

> **言語:** [English](../PILOT_PLAYBOOK.md) · 日本語 · [Tiếng Việt](../vi/PILOT_PLAYBOOK.md)

本プレイブックは、情シス（情報システム部門）および SIer 向けに、顧客ファイルや基幹 DB を一切変更せず **社内 LAN サーバー（Model B）** として 5 日間で試験導入するための標準手順です。

## セキュリティと読み取り専用の保証

- **OS レベルの読み取り専用（`:ro`）**: [deploy/docker-compose.lan.yml](../../deploy/docker-compose.lan.yml) では顧客フォルダおよび `knot-sync.config.yaml` を `:ro`（読み取り専用）でマウントします。元データの書き換え・移動・削除は一切行いません。
- **非 root コンテナ**: 公式 [Dockerfile](../../Dockerfile) は非特権ユーザー `node` で実行されます。
- **完全ローカル / オフライン**: コンテナイメージ取得後は、スキャン、PII マスク、SQLite FTS 検索、およびオプションの OCR（`docling-serve-cpu`）・ローカル LLM（`ollama`）を含め外部通信を行いません。

---

## ステップ 1（1 日目）: データ棚卸し＆PII リスクレポート

AI エージェントへ公開する前に、読み取り専用スキャンでファイル件数・破損状況・個人情報（PII）の検出見込みを確認します。

```bash
npx @hoanghainh/knot-sync scan --config knot-sync.config.yaml --pii --report
```

- 自己完結型のオフライン HTML レポート（`./knot-sync-scan-report.html`）が生成されます。
- 部門責任者・セキュリティ担当者とレポートを確認し、`pii.rules`、`pii.allowlist`、`source.allow` の範囲を合意します。

---

## ステップ 2（2〜3 日目）: セマンティックカタログ整備（基幹 DB / ERP）

`TKSK_CD` や `ma_kh` などの難解な物理カラム名を含む DB を連携する場合、カタログ下書きを生成し業務担当者と確認します。

```bash
npx @hoanghainh/knot-sync describe --config knot-sync.config.yaml
npx @hoanghainh/knot-sync ui --config knot-sync.config.yaml
```

- ローカル UI（`http://127.0.0.1:3939`）で日本語・ベトナム語・英語の業務名、区分値、外部キー `references`、および事前承認済み `lookupJoins`（`reviewed: true`）を確認します。
- `reviewed: true` とした項目は次回の `describe` 再実行でも上書きされません。

---

## ステップ 3（4〜5 日目）: 社内 LAN MCP サーバーの展開

1. **環境変数ファイル（`deploy/.env`）の準備**:
   ```bash
   cp deploy/.env.example deploy/.env
   # KNOT_SYNC_API_KEY を設定（例: openssl rand -hex 32）
   # KNOT_SYNC_SOURCES_DIR と KNOT_SYNC_CONFIG を設定
   mkdir -p deploy/.data && chown 1000:1000 deploy/.data
   ```

2. **LAN アプライアンスの起動**:
   ```bash
   # 基本構成（読み取り専用 :ro マウント、`serve --http --host 0.0.0.0 --port 3940 --sync-interval 300` を起動）
   docker compose -f deploy/docker-compose.lan.yml up -d

   # オプション: オフライン Docling OCR / ローカル Ollama を有効化
   docker compose -f deploy/docker-compose.lan.yml --profile ocr --profile local-ai up -d
   ```

3. **ヘルスチェック確認**:
   ```bash
   docker compose -f deploy/docker-compose.lan.yml ps
   ```

4. **Claude Desktop / Cursor からの接続設定**:
   社内端末の MCP クライアントから `http://<lan-server-ip>:3940/mcp` へ Bearer トークン付きで接続します。
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
