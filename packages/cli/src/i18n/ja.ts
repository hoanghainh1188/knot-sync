import type { MessageCatalog } from "./messages.js";

export const ja: MessageCatalog = {
  help: `KnotSync (knot-sync) {version}
レガシー企業データを整理し、MCP 経由で AI エージェントに提供します。
すべてこのマシン上で動作します。ソースは読み取り専用で、変更しません。

使い方:
  knot-sync <command> [options]

コマンド:
  init      カレントフォルダに設定ファイルを作成
  scan      ソースを棚卸し（種類・サイズ・重複・古いファイル）
  run       直近の scan 結果からテキスト/表を抽出してドキュメントストアへ
  describe  SQL ソース向け knot-sync.catalog.yaml を生成/更新
  ui        ローカルのカタログレビュー UI を開く（127.0.0.1 のみ）
  bench     ローカルストアでトークン削減とスイート精度を計測
  optimize  FTS5 を最適化しストアの WAL をチェックポイント（アイドル時に実行）
  plugins   読み込み済みプラグインと拡張ポイントを一覧
  serve     MCP サーバーを開始（既定は stdio。チーム向けに --http 可）

オプション:
  -c, --config <file>   設定ファイル（既定: {configFile}）
  --lang <en|ja|vi>     CLI メッセージ言語（既定: en、または cli.locale / 環境変数）
  -h, --help            ヘルプを表示
  -v, --version         バージョンを表示

init オプション:
  --path <folder>       スキャン対象フォルダ（設定に書き込み）
  --force               既存の設定ファイルを上書き

scan オプション:
  --json                結果を JSON で出力
  --pii                 テキストファイルに PII らしき内容がある件数を推定
  --report [file]       自己完結 HTML レポートを出力（既定: ./knot-sync-scan-report.html）

bench オプション:
  --json                結果を JSON で出力（キーは英語）
  --suite <file>        ベンチスイート YAML（既定: 設定と同じ場所の knot-sync.bench.yaml）

ui オプション:
  --port <number>       ループバックのポート（既定: 8787）

serve オプション:
  --http                HTTP で MCP を提供（/mcp の Streamable HTTP）
  --port <number>       HTTP ポート（既定: 3000。ui でも使用）
  --host <address>      待ち受けアドレス（既定: 127.0.0.1）
  環境変数 KNOT_SYNC_API_KEY  --http 時に必須の共有 Bearer トークン

plugins:
  プラグインはプロセス内でフル権限で動作します。信頼できるものだけ入れてください。
  有料プラグインは自身でライセンスを確認します。コアは確認しません。
`,
  "error.prefix": "エラー: {message}",
  "error.configPrefix": "設定エラー: {message}",
  "error.catalogPrefix": "カタログエラー: {message}",
  "error.unknownCommand": '不明なコマンド "{command}" です。',
  "error.invalidLang":
    '不正な --lang "{value}" です。許可値: en, ja, vi。--lang または cli.locale を修正してください。',
  "init.exists": "{path} は既に存在します。上書きするには --force を使ってください。",
  "init.created": "{path} を作成しました",
  "init.next": '次: "sources" を編集してから knot-sync scan を実行してください',
  "scan.inventorySaved": "インベントリを {path} に保存しました",
  "scan.htmlReport": "HTML レポートを {path} に書きました",
  "scan.progressFiles": "  [{sourceId}] {count} ファイル…",
  "scan.sourceHeader": '\n■ ソース "{sourceId}": {files} ファイル、{bytes}',
  "scan.byType": "\n  種類別:",
  "scan.health": "\n  健全性:",
  "scan.dupCopies": "重複コピー",
  "scan.olderThan": "{years} 年より古い",
  "scan.emptyFiles": "空ファイル",
  "scan.unreadable": "読めない",
  "scan.likelyPii": "PII の可能性（サンプル）",
  "scan.wasted": "{bytes} の無駄",
  "scan.biggestDupes": "\n  最大の重複:",
  "scan.andMorePaths": "      … ほか {n} 件",
  "scan.couldNotRead": "\n  読めなかったもの:",
  "scan.andMoreIssues": "    … ほか {n} 件",
  "run.noInventory":
    '{path} に scan インベントリがありません。\n先に "knot-sync scan" を実行してから "knot-sync run" してください。',
  "run.complete":
    "run 完了: 抽出 {extracted}、変更なし {skipped}、問題 {failed}",
  "run.issuesHeader": "\n問題:",
  "run.andMoreIssues": "  … ほか {n} 件",
  "run.documentsSaved": "ドキュメントを {path} に保存しました",
  "plugins.header":
    "読み込み済みプラグイン（プロセス内・フル権限 — 信頼できるものだけインストール）:",
  "plugins.none": "  （なし）",
  "plugins.noExtensions": "（拡張なし）",
  "serve.listening":
    "KnotSync MCP サーバー（stdio）。ストア: {store}。監査: {audit}。",
  "serve.listeningHttp":
    "KnotSync MCP サーバー http://{host}:{port}/mcp（Bearer 認証）。ストア: {store}。監査: {audit}。",
  "serve.invalidPort":
    '不正な --port "{value}" です。1〜65535 の整数を指定してください。',
  "serve.catalogSuffix": " カタログ: {path}。",
  "describe.noSql":
    "postgres/mysql ソースがありません。allow リスト付きの SQL ソースを追加してから describe を再実行してください。",
  "describe.moreWarnings": "…ほかサンプル省略警告 {n} 件",
  "describe.wrote": "カタログを書きました {path}",
  "describe.counts": "ソース: {sources}、テーブル: {tables}、列: {columns}",
  "describe.next":
    "次: ラベルを確認し、確定した項目に reviewed: true を付けてから knot-sync serve",
  "ui.listening":
    "カタログレビュー UI: {url}（ループバックのみ）。停止は Ctrl+C。",
  "ui.openHint": "このマシンのブラウザで URL を開いてください。カタログ: {path}",
  "bench.emptyStore":
    "{path} にドキュメントがありません。\n先に knot-sync scan と knot-sync run を実行してください。",
  "bench.tokensHeader": "トークン見積もり（cleaner のメタデータ）",
  "bench.tokensLine":
    "  before={before} after={after} saved={saved}（{pct}%）documents={documents} skipped={skipped}",
  "bench.noSuite":
    "スイートファイルはありません（任意）。設定と同じ場所に knot-sync.bench.yaml を置くか --suite を指定してください。",
  "bench.suiteHeader": "スイート: {path}",
  "bench.searchSummary": "検索スイート（クリーニング後ストア）: 成功 {passed} / 失敗 {failed}",
  "bench.catalogSummary":
    "カタログ解決: 成功 {passed} / 失敗 {failed}（before ok={before}, after ok={after}）",
  "bench.catalogSkipped": "カタログスイートをスキップ: {reason}",
  "optimize.done":
    "ストア {path} を最適化しました（FTS optimize + WAL チェックポイント）。",
  "optimize.storeOpenFailed":
    "ストア {path} を開けませんでした（{detail}）。\n先に \"knot-sync init\"、\"knot-sync scan\"、\"knot-sync run\" を実行してから \"knot-sync optimize\" を再試行してください。",
};