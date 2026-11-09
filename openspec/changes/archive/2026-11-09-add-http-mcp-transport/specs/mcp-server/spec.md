# Spec Delta

## MODIFIED Requirements

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

`knot-sync serve` SHALL load config and plugins, open the configured store
read-only for MCP use, and run the MCP server until the transport closes or
the process is interrupted. It SHALL exit 0 on clean shutdown and exit 1 on
config/store errors with an actionable message. Help text SHALL describe
`serve` as available, including optional `--http` mode.

#### Scenario: Serve starts with valid config

- **WHEN** the user runs `knot-sync serve -c <config>` with a valid store
- **THEN** the process remains running as an MCP server on stdio
- **AND** it does not print a “not available yet” message

#### Scenario: Help mentions http flag

- **WHEN** the user runs `knot-sync serve --help` (or top-level help listing serve)
- **THEN** output mentions `--http` (and documented port/host flags)

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

## ADDED Requirements

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
