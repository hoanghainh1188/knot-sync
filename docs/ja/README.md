# KnotSync（日本語概要）

KnotSync は、社内に散らばったレガシーデータ（Excel、Word、PDF、共有フォルダ、
PostgreSQL / MySQL など）を整理し、[MCP](https://modelcontextprotocol.io) 経由で
AI エージェントに渡すためのツールです。

## 前提

- Node.js 22.13 以上
- **完全にローカル**で動作します（テレメトリなし）
- データソースは**読み取り専用**です。ファイルやデータベースの内容を変更しません

## インストール

```bash
npx @hoanghainh/knot-sync init --path /path/to/shared/folder
npx @hoanghainh/knot-sync scan
npx @hoanghainh/knot-sync run
npx @hoanghainh/knot-sync describe   # SQL ソースがある場合：Semantic Catalog
npx @hoanghainh/knot-sync serve      # MCP（stdio）
```

公開後の確認例:

```bash
npx @hoanghainh/knot-sync@0.1.0 --version
```

## 主なコマンド

| コマンド | 説明 |
|---|---|
| `init` | 設定ファイルを作成 |
| `scan` | ソースの棚卸し（種類・重複・古いファイルなど） |
| `run` | テキスト／表を抽出してローカルストアへ |
| `describe` | SQL 向け Semantic Catalog（`knot-sync.catalog.yaml`）を生成・更新 |
| `plugins` | 読み込み済みプラグインを表示 |
| `serve` | MCP サーバー（stdio）を起動 |

詳細（英語）: リポジトリ直下の [README.md](../../README.md) と
[docs/ROADMAP.md](../ROADMAP.md)。
