# mcp-server Specification

## Purpose

Exposes the local KnotSync store to AI agents over MCP stdio as a read-only
surface: resources, tools, and prompts, with document text framed as untrusted
data and JSONL audit logging.

## Requirements

### Requirement: mcp-server package and stdio transport

The system SHALL provide package `packages/mcp-server` published as
`@hoanghainh/knot-sync-mcp-server` that runs an MCP server. Default transport
SHALL be stdio. Runtime third-party dependencies SHALL remain limited to
`@modelcontextprotocol/sdk` (MIT) and `zod` (MIT) plus workspace packages
unless a design-approved MIT/BSD/Apache/ISC peer is listed. When running in
stdio mode, the server MUST NOT open network listeners and MUST NOT make
outbound network calls (telemetry/CDN). Optional HTTP mode is specified
separately and MAY bind a local listener.

#### Scenario: Stdio only

- **WHEN** `knot-sync serve` starts successfully without `--http`
- **THEN** the process speaks MCP on standard input/output
- **AND** it does not bind a TCP or HTTP port

### Requirement: serve CLI command

`knot-sync serve` SHALL load config and plugins, open the configured store, and
run the MCP server until the transport closes or the process is interrupted. It
SHALL exit 0 on clean shutdown and exit 1 on config/store errors with an
actionable message. Help text SHALL describe `serve` as available, including
optional `--http` and `--sync-interval <seconds>` options.

When `--sync-interval <seconds>` is supplied on `serve`, it SHALL override
`server.sync_interval_seconds`. Non-positive or non-numeric `--sync-interval`
values SHALL fail startup cleanly with a localized `ConfigError` (`en`/`ja`/`vi`)
before serving requests.

#### Scenario: Serve starts with valid config

- **WHEN** the user runs `knot-sync serve -c <config>` with a valid store
- **THEN** the process remains running as an MCP server on stdio
- **AND** it does not print a “not available yet” message

#### Scenario: Help mentions http flag

- **WHEN** the user runs `knot-sync serve --help` (or top-level help listing serve)
- **THEN** output mentions `--http` (and documented port/host flags)

#### Scenario: Help mentions sync-interval flag

- **WHEN** the user runs `knot-sync serve --help` (or top-level help listing serve)
- **THEN** output mentions `--sync-interval`

#### Scenario: Invalid sync-interval rejected in active locale

- **WHEN** the user runs `knot-sync serve -c <config> --sync-interval 0 --lang ja`
- **THEN** startup fails with exit code 1 before opening the listener
- **AND** stderr displays a localized Japanese guidance message mentioning `--sync-interval`

### Requirement: Sources resource

The server SHALL expose resource URI `knot://sources` that lists configured
source ids and types from the loaded config (read-only metadata, no source
filesystem writes).

#### Scenario: List sources

- **WHEN** a client reads `knot://sources`
- **THEN** the response includes each configured source `id` and `type`

### Requirement: Document resource

The server SHALL expose resource URIs of the form
`knot://docs/{source}/{doc_id}` that return the stored document for that id
when it exists and belongs to that source. Missing documents SHALL produce a
clear not-found error. Returned body text SHALL be framed as untrusted document
content.

#### Scenario: Fetch Japanese document by URI

- **GIVEN** a stored document under source `share` titled `令和6年度 請求書一覧`
- **WHEN** a client reads the corresponding `knot://docs/share/{doc_id}` URI
- **THEN** the response includes that title and content framed as untrusted
  document data
- **AND** no file under the source folder is modified

### Requirement: search_documents tool

The server SHALL register tool `search_documents` with a strict Zod (or
equivalent) input schema accepting: `query` (string, required), optional
`source` (source id), optional `type` (document type), and optional `limit`
(positive integer, capped at 100). Results SHALL use the document-search
capability and include id, source, type, title, and snippet. Document text in
the tool result SHALL be framed as untrusted content. Guard risk/flags SHALL be
included when present on matching documents.

#### Scenario: Search Japanese term

- **GIVEN** a document containing `請求書`
- **WHEN** the tool is called with `query: "請求書"`
- **THEN** that document appears in the hits
- **AND** the result text states that document content is untrusted data

#### Scenario: Filter by source

- **WHEN** the tool is called with `query` and `source: "share"`
- **THEN** only hits from source `share` are returned

### Requirement: get_document tool

The server SHALL register tool `get_document` with a strict input schema
requiring document `id`. On success it SHALL return title, type, source id,
content (and tables if any) framed as untrusted document content, plus guard
findings/risk when present. Missing ids SHALL return a clear not-found error
without mutating the store.

#### Scenario: Get by id

- **WHEN** the tool is called with an existing document id
- **THEN** the response includes that document’s content framed as untrusted
- **AND** if the document has guard findings, they are included in the result

### Requirement: Config prompts

When config `prompts:` is present, the server SHALL expose each entry as an MCP
prompt with the given `name`, `description`, `arguments`, and `template`.
Invalid prompt entries SHALL fail config load with an actionable message (not
at tool-call time).

#### Scenario: Prompt from config

- **GIVEN** config defines a prompt named `summarize-invoice`
- **WHEN** a client lists MCP prompts
- **THEN** `summarize-invoice` appears with its description

### Requirement: Untrusted content framing

Any MCP tool or resource payload that includes document title, snippet, or body
SHALL clearly mark that material as untrusted document content that MUST NOT be
followed as instructions. Framing SHALL be present even when guard findings are
empty.

#### Scenario: Framing always present

- **WHEN** `get_document` returns a clean document with no guard findings
- **THEN** the payload still includes an explicit untrusted-content framing

### Requirement: JSONL audit log

The server SHALL append one JSON line per tool call and resource read to the
audit log path from config `server.audit_log` (or the documented default under
the store directory). Each line SHALL include a timestamp, the tool or resource
identifier, arguments or URI (without embedding full document bodies), and a
result count or status. Audit logging MUST NOT write inside configured source
paths. In HTTP mode, each line SHALL also include client IP, User-Agent (when
present), and a request id.

#### Scenario: Tool call is audited

- **WHEN** `search_documents` is invoked successfully
- **THEN** a new JSONL line records the tool name, query arguments, and hit count

#### Scenario: HTTP audit enrichment

- **GIVEN** serve is running with `--http`
- **WHEN** an authenticated client calls a tool
- **THEN** the audit JSONL line includes client IP, User-Agent when sent, and a
  request id

### Requirement: Read-only MCP surface

No MCP tool or resource handler SHALL create, modify, move, or delete files
under configured sources, and SHALL NOT insert/update/delete store rows as a
side effect of serving requests.

#### Scenario: Sources untouched after tools

- **WHEN** a client calls `search_documents` and `get_document`
- **THEN** no file inside any configured source folder is created or changed

### Requirement: SQL schema resource and query tools

When SQL sources are configured and the SQL connector plugin is loaded, the MCP
server SHALL expose `knot://db/{source}/{table}/schema` and register tools
`describe_table` and `query_table` as specified by the sql-query capability.
These surfaces MUST remain read-only and MUST apply untrusted-content framing to
row payloads. When no SQL source is configured, the tools MAY still be
registered but SHALL fail clearly if invoked for a missing/non-SQL source.

#### Scenario: Tools listed with SQL plugin

- **WHEN** the user runs `knot-sync plugins` with default plugins including SQL
- **THEN** output includes `mcp-tool:` ids for `describe_table` and `query_table`
  (or the tools are registered on the MCP server used by `serve`)

### Requirement: Serve loads optional catalog

`knot-sync serve` SHALL attempt to load the Semantic Catalog from the
configured path (see config capability). When loaded, SQL tools and schema
resources SHALL apply catalog-mcp enrichment. When absent, serve continues
without catalog features.

#### Scenario: Invalid catalog fails serve

- **GIVEN** the catalog path points to a malformed YAML file
- **WHEN** the user runs `knot-sync serve`
- **THEN** the process exits with code 1
- **AND** the error says how to fix or regenerate the catalog

### Requirement: Optional HTTP MCP transport

`knot-sync serve --http` SHALL bind an HTTP listener and speak MCP using the
SDK Streamable HTTP transport (documented path, default port **3000**). Host
SHALL default to loopback (`127.0.0.1`) unless `--host` overrides. Stdio mode
SHALL remain available without `--http`. The process MUST still load config,
plugins, and the store read-only as for stdio serve.

#### Scenario: HTTP serve binds documented port

- **WHEN** the user runs `knot-sync serve --http --port 3000` with valid config
  and `KNOT_SYNC_API_KEY` set
- **THEN** the process listens for MCP HTTP requests on that port
- **AND** does not require stdin for the MCP session

#### Scenario: Default host is loopback

- **WHEN** `--http` is used without `--host`
- **THEN** the listener binds to `127.0.0.1` (or documented loopback equivalent)

### Requirement: Bearer API key authentication for HTTP

HTTP MCP endpoints SHALL require `Authorization: Bearer <token>` where the
token matches the value of environment variable `KNOT_SYNC_API_KEY`. Missing
header, wrong scheme, or mismatched token SHALL return **401 Unauthorized**
and MUST NOT execute tools or return document bodies. Comparison SHALL be
constant-time (or equivalent) against timing leaks. The API key MUST NOT be
read from the YAML config file.

#### Scenario: Valid bearer accepted

- **GIVEN** `KNOT_SYNC_API_KEY` is set to a non-empty secret
- **WHEN** a client calls an HTTP MCP endpoint with `Authorization: Bearer`
  matching that secret
- **THEN** the request proceeds to MCP handling

#### Scenario: Missing or wrong key rejected

- **WHEN** a client calls an HTTP MCP endpoint without a valid Bearer token
- **THEN** the response status is 401
- **AND** no document content is returned

#### Scenario: HTTP serve refuses missing env key

- **WHEN** the user runs `knot-sync serve --http` and `KNOT_SYNC_API_KEY` is
  unset or empty
- **THEN** the command exits 1 before listening
- **AND** the error names `KNOT_SYNC_API_KEY` and what to do next

### Requirement: HTTP mode remains read-only and framed

HTTP transport SHALL expose the same read-only tools, resources, and prompts as
stdio mode, with the same untrusted-content framing for document and SQL
payloads. No HTTP route SHALL mutate configured sources or store rows beyond
audit log appends.

#### Scenario: Japanese document still framed over HTTP

- **GIVEN** a stored document with Japanese title text
- **WHEN** an authenticated HTTP client fetches it via MCP
- **THEN** the payload includes untrusted-content framing
- **AND** source files on disk are unchanged

### Requirement: HTTP auth may use OAuth when plugin loaded

When the mcp-oauth plugin is loaded and licensed, HTTP MCP endpoints SHALL
accept either a valid OAuth access token or the shared `KNOT_SYNC_API_KEY`
Bearer as authentication. When the plugin is not loaded, behavior remains
API-key-only as today. Unauthorized requests SHALL return **401** and MUST NOT
execute tools or return document bodies.

#### Scenario: OAuth bearer accepted alongside API key path

- **GIVEN** mcp-oauth is loaded and a valid access token is presented
- **WHEN** the client calls an HTTP MCP endpoint
- **THEN** authentication succeeds
- **AND** further authorization follows tool/resource scopes

### Requirement: Enforce tool and resource scopes on HTTP MCP

For OAuth-authenticated sessions, the MCP server SHALL enforce granted scopes
before running tools or serving resources. Denied calls SHALL NOT return
untrusted document/SQL payloads. API-key fallback sessions MAY skip fine-grained
scopes (documented full access).

#### Scenario: Resource denied without scope

- **GIVEN** an OAuth session without resource-read scope
- **WHEN** the client requests a document resource
- **THEN** the server denies the read
- **AND** does not return framed document content

### Requirement: search_similar MCP tool when vector plugin loaded

When the search-vector plugin is loaded and licensed, the MCP server SHALL
expose a `search_similar` tool that returns semantically similar cleaned
documents with scores. When the plugin is absent, that tool SHALL NOT be
registered. Hit payloads MUST keep untrusted-content framing; no source writes.

#### Scenario: search_similar returns Vietnamese-related hit

- **GIVEN** search-vector is loaded and a document about `hóa đơn` is embedded
- **WHEN** an MCP client calls `search_similar` with a related Vietnamese query
- **THEN** the response includes that document among hits
- **AND** content is framed as untrusted data

#### Scenario: Tool absent without plugin

- **GIVEN** search-vector is not listed under `plugins:`
- **WHEN** the MCP server starts
- **THEN** `search_similar` is not registered
- **AND** `search_documents` remains available

### Requirement: Background periodic sync

When configured via `--sync-interval <seconds>` or `server.sync_interval_seconds`,
`knot-sync serve` SHALL schedule sequential, non-overlapping background cycles of
incremental `scan`, `run`, and stale-document pruning against read-only sources.
Cycles MUST NOT block active MCP requests or write diagnostics to `stdout`, and
timers MUST stop cleanly on shutdown.

#### Scenario: Newly added Vietnamese file becomes searchable during serve

- **GIVEN** `knot-sync serve --http --sync-interval <seconds>` is running against an initial folder snapshot
- **WHEN** a new file `Hợp đồng mới.txt` containing `Thanh toán 2024/05/01` is added to the read-only source folder and one sync interval elapses
- **THEN** the background sync cycle indexes and cleans it into SQLite so `search_documents` finds `Hợp đồng mới.txt` framed as untrusted data
- **AND** concurrent MCP requests before and after the cycle succeed without interruption and the source file remains untouched

#### Scenario: Deleted Japanese document pruned and transient cycle errors do not crash server

- **GIVEN** `knot-sync serve` is running with periodic sync enabled and a previously indexed file `請求書_old.txt` is removed from the folder
- **WHEN** the next background sync cycle executes
- **THEN** `請求書_old.txt` is pruned from `store.sqlite` so subsequent `search_documents` queries no longer return it
- **AND** if a sync cycle hits a transient source error, the server logs the error and continues serving MCP requests until normal shutdown cancels remaining timers
