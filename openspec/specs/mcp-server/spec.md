# mcp-server Specification

## Purpose

Exposes the local KnotSync store to AI agents over MCP stdio as a read-only
surface: resources, tools, and prompts, with document text framed as untrusted
data and JSONL audit logging.

## Requirements

### Requirement: mcp-server package and stdio transport

The system SHALL provide package `packages/mcp-server` published as
`@hoanghainh/knot-sync-mcp-server` that runs an MCP server over stdio only.
Runtime third-party dependencies SHALL be limited to
`@modelcontextprotocol/sdk` (MIT) and `zod` (MIT) plus workspace packages.
The server MUST NOT open network listeners or make outbound network calls.

#### Scenario: Stdio only

- **WHEN** `knot-sync serve` starts successfully
- **THEN** the process speaks MCP on standard input/output
- **AND** it does not bind a TCP or HTTP port

### Requirement: serve CLI command

`knot-sync serve` SHALL load config and plugins, open the configured store
read-only for MCP use, and run the MCP server until stdin closes or the process
is interrupted. It SHALL exit 0 on clean shutdown and exit 1 on config/store
errors with an actionable message. Help text SHALL describe `serve` as available.

#### Scenario: Serve starts with valid config

- **WHEN** the user runs `knot-sync serve -c <config>` with a valid store
- **THEN** the process remains running as an MCP server on stdio
- **AND** it does not print a “not available yet” message

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
paths.

#### Scenario: Tool call is audited

- **WHEN** `search_documents` is invoked successfully
- **THEN** a new JSONL line records the tool name, query arguments, and hit count

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
