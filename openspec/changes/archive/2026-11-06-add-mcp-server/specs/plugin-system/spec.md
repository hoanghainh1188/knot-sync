# Spec: plugin-system (delta)

## ADDED Requirements

### Requirement: McpTool contract is executable

A registered `McpTool` SHALL expose a stable `id`, a human-readable
description, a JSON Schema (or Zod schema convertible to JSON Schema) for
inputs, and a handler that accepts validated arguments and returns a
read-only result for MCP. Handlers MUST NOT write to configured sources or
mutate the store. The host SHALL expose registered tools through the
`mcp-tool` registry for `serve`.

#### Scenario: Built-in search tool listed

- **WHEN** the user runs `knot-sync plugins` with default plugins
- **THEN** output includes at least one `mcp-tool:` id for document search

### Requirement: McpPrompt contract is executable

A registered `McpPrompt` SHALL expose a stable `id` (or name), description,
optional argument descriptors, and a template or render function. The host
SHALL expose registered prompts through the `mcp-prompt` registry for `serve`.

#### Scenario: Prompt registry used by serve

- **WHEN** a plugin registers an `mcp-prompt` and `serve` is running
- **THEN** that prompt is available to MCP clients via the prompts list
