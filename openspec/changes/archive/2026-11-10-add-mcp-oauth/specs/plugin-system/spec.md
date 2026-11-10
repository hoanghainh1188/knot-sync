# Spec Delta

## ADDED Requirements

### Requirement: mcp-oauth plugin is opt-in paid auth

HTTP MCP OAuth/scopes SHALL register through the plugin API (auth-related
extension and/or documented registration hooks) and SHALL NOT be included in
the CLI default built-in plugin list. Operators enable it only by adding the
package path to config `plugins:`. The plugin MAY perform its own license
validation; the core host SHALL NOT reject plugins for lacking a core-checked
license field.

#### Scenario: Builtins list excludes mcp-oauth

- **WHEN** an operator runs `knot-sync plugins` with no mcp-oauth entry under
  `plugins:`
- **THEN** the loaded plugins do not include the mcp-oauth plugin id
- **AND** free HTTP MCP still uses shared API key auth when `--http` is used

#### Scenario: Listing plugin loads mcp-oauth

- **GIVEN** config `plugins:` includes the mcp-oauth plugin module with a valid
  license
- **WHEN** plugins are loaded successfully
- **THEN** `knot-sync plugins` lists the mcp-oauth plugin
