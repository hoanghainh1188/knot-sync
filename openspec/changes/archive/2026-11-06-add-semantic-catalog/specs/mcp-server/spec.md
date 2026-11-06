# Spec: mcp-server (delta)

## ADDED Requirements

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
