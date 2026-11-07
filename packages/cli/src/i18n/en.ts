import type { MessageCatalog } from "./messages.js";

export const en: MessageCatalog = {
  help: `KnotSync (knot-sync) {version}
Scan, clean and serve legacy enterprise data to AI agents via MCP.
Everything runs on this machine. Sources are only read, never changed.

Usage:
  knot-sync <command> [options]

Commands:
  init      Create a config file in the current folder
  scan      Inventory all sources: file types, sizes, duplicates, old files
  run       Extract text/tables from the last scan into the document store
  describe  Generate/update knot-sync.catalog.yaml for SQL sources
  plugins   List loaded plugins and their extension points
  serve     Start the MCP server (stdio only; for Claude Desktop / Cursor / Claude Code)

Options:
  -c, --config <file>   Config file (default: {configFile})
  --lang <en|ja|vi>     CLI message language (default: en, or cli.locale / env)
  -h, --help            Show help
  -v, --version         Show version

init options:
  --path <folder>       Folder to scan (written into the config)
  --force               Overwrite an existing config file

scan options:
  --json                Print results as JSON
  --pii                 Estimate how many text files look like they contain PII
  --report [file]       Write a self-contained HTML report (default: ./knot-sync-scan-report.html)

plugins:
  Plugins run in-process with full trust. Install only plugins you trust.
  Paid plugins check their own license keys; the core never does.
`,
  "error.prefix": "Error: {message}",
  "error.configPrefix": "Config error: {message}",
  "error.catalogPrefix": "Catalog error: {message}",
  "error.unknownCommand": 'Unknown command "{command}".',
  "error.invalidLang":
    'Invalid --lang "{value}". Allowed: en, ja, vi. Fix --lang or cli.locale.',
  "init.exists": "{path} already exists. Use --force to overwrite.",
  "init.created": "Created {path}",
  "init.next": 'Next: edit "sources", then run: knot-sync scan',
  "scan.inventorySaved": "Inventory saved to {path}",
  "scan.htmlReport": "HTML report written to {path}",
  "scan.progressFiles": "  [{sourceId}] {count} files…",
  "scan.sourceHeader": '\n■ Source "{sourceId}": {files} files, {bytes}',
  "scan.byType": "\n  By type:",
  "scan.health": "\n  Health:",
  "scan.dupCopies": "Duplicate copies",
  "scan.olderThan": "Older than {years} years",
  "scan.emptyFiles": "Empty files",
  "scan.unreadable": "Unreadable",
  "scan.likelyPii": "Likely PII (sample)",
  "scan.wasted": "{bytes} wasted",
  "scan.biggestDupes": "\n  Biggest duplicates:",
  "scan.andMorePaths": "      … and {n} more",
  "scan.couldNotRead": "\n  Could not read:",
  "scan.andMoreIssues": "    … and {n} more",
  "run.noInventory":
    'No scan inventory found in {path}.\nRun "knot-sync scan" first, then "knot-sync run".',
  "run.complete":
    "Run complete: {extracted} extracted, {skipped} unchanged, {failed} issues",
  "run.issuesHeader": "\nIssues:",
  "run.andMoreIssues": "  … and {n} more",
  "run.documentsSaved": "Documents saved to {path}",
  "plugins.header":
    "Loaded plugins (in-process, full trust — install only plugins you trust):",
  "plugins.none": "  (none)",
  "plugins.noExtensions": "(no extensions)",
  "serve.listening":
    "KnotSync MCP server on stdio. Store: {store}. Audit: {audit}.",
  "serve.catalogSuffix": " Catalog: {path}.",
  "describe.noSql":
    'No postgres/mysql sources found. Add a SQL source with an "allow" list, then re-run describe.',
  "describe.moreWarnings": "…and {n} more sample skip warnings",
  "describe.wrote": "Wrote catalog {path}",
  "describe.counts": "Sources: {sources}, tables: {tables}, columns: {columns}",
  "describe.next":
    "Next: review labels, set reviewed: true on confirmed entries, then knot-sync serve",
};
