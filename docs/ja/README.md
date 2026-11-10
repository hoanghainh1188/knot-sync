# KnotSync（日本語概要）

KnotSync は、社内に散らばったレガシーデータ（Excel、Word、PDF、共有フォルダ、
PostgreSQL / MySQL など）を整理し、[MCP](https://modelcontextprotocol.io) 経由で
AI エージェントに渡すためのツールです。

## 前提

- Node.js 22.13 以上
- **完全にローカル**で動作します（テレメトリなし・実行時の外向き通信なし）
- データソースは**読み取り専用**です。ファイルやデータベースの内容を変更しません
- 効果指標（トークン削減・検索精度など）は公開の平均値ではなく、手元の
  `knot-sync bench` で測ってください

## インストール

```bash
npx @hoanghainh/knot-sync init --path /path/to/shared/folder
npx @hoanghainh/knot-sync scan
npx @hoanghainh/knot-sync run
npx @hoanghainh/knot-sync describe   # SQL ソースがある場合：Semantic Catalog
npx @hoanghainh/knot-sync ui         # カタログレビュー（127.0.0.1 のみ）
npx @hoanghainh/knot-sync bench      # トークン見積もりとスイート（ローカル）
npx @hoanghainh/knot-sync optimize   # FTS / WAL 整理（アイドル時）
npx @hoanghainh/knot-sync serve      # MCP（stdio）
# 任意: export KNOT_SYNC_API_KEY=... && knot-sync serve --http
```

公開後の確認例:

```bash
npx @hoanghainh/knot-sync@0.1.3 --version
```

## 主なコマンド

| コマンド | 説明 |
|---|---|
| `init` | 設定ファイルを作成 |
| `scan` | ソースの棚卸し（種類・重複・古いファイルなど） |
| `run` | テキスト／表を抽出してローカルストアへ |
| `describe` | SQL 向け Semantic Catalog（`knot-sync.catalog.yaml`）を生成・更新 |
| `ui` | ローカル UI でカタログを確認・`reviewed` を保存（127.0.0.1） |
| `bench` | クリーニング前後のトークン見積もりとスイート（検索／カタログ） |
| `optimize` | ストアの FTS5 optimize と WAL チェックポイント |
| `plugins` | 読み込み済みプラグインを表示 |
| `serve` | MCP サーバー（stdio、または `--http` + API キー） |

`bench` は `scan` / `run` 後のストアを読みます。任意で設定と同じ場所の
`knot-sync.bench.yaml`（または `--suite`）を実行します。ソースへは書き込みません。
結果はデータ依存です。マーケティング用の固定％は掲載しません。

### メッセージ言語

ヘルプやエラーを日本語にする例:

```bash
npx @hoanghainh/knot-sync --help --lang ja
```

設定の `cli.locale: ja` でも同様（`--lang` が優先）。コマンド名や `--json` のキーは英語のままです。

詳細（英語）: リポジトリ直下の [README.md](../../README.md) と
[docs/ROADMAP.md](../ROADMAP.md)。
