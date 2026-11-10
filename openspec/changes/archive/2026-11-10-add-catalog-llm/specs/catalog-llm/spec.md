# Spec Delta

## Purpose

Provides an opt-in, licensed CatalogSource that asks a local OpenAI-compatible
LLM for business labels and descriptions on columns left blank after free
dictionary and definition-Excel suggestions—without marking entries reviewed
or calling cloud APIs by default.

## ADDED Requirements

### Requirement: Opt-in catalog-llm plugin

The system SHALL provide a catalog-llm plugin (not loaded as a default
built-in) that operators enable by listing it under config `plugins:`. When
loaded and licensed, `knot-sync describe` SHALL be able to use local-LLM
suggestions for blank columns. When omitted, describe behavior SHALL remain
dictionary + Excel only.

#### Scenario: Plugin omitted keeps free catalog sources only

- **GIVEN** config does not list the catalog-llm plugin
- **WHEN** the user runs `knot-sync describe`
- **THEN** no local-LLM CatalogSource is registered
- **AND** free dictionary / Excel sources still run as today

#### Scenario: Licensed plugin registers LLM CatalogSource

- **GIVEN** the catalog-llm plugin is listed with a valid license and a local
  endpoint configured
- **WHEN** plugins load successfully
- **THEN** `knot-sync plugins` lists the catalog-llm plugin
- **AND** a CatalogSource id for local LLM suggestions is available to describe

### Requirement: License self-check

The catalog-llm plugin SHALL validate its own license (environment variable
and/or plugin settings) before issuing LLM requests. The KnotSync core SHALL
NOT implement that check. Invalid or missing license SHALL leave LLM
suggestions unusable with guidance to set the documented license env/key.

#### Scenario: Missing license blocks LLM calls

- **GIVEN** the plugin path is listed but no valid license is configured
- **WHEN** describe would otherwise call the local LLM
- **THEN** no LLM HTTP request is made
- **AND** the operator sees how to set the license

### Requirement: Local OpenAI-compatible endpoint only

LLM requests SHALL target a configured local OpenAI-compatible HTTP base URL
(default loopback). Operators MAY point that URL at Ollama or a Docker
inference server on their network. Cloud vendor endpoints SHALL NOT be required
or hard-coded. Requests MUST NOT write to customer source folders or databases.

#### Scenario: Default targets localhost

- **GIVEN** licensed plugin with default base URL settings
- **WHEN** an LLM suggestion runs
- **THEN** the HTTP call uses a loopback (or documented local) base URL
- **AND** no cloud LLM hostname is hard-coded in the plugin

### Requirement: Fill blank columns only

After free CatalogSources (dictionaries and optional definition Excel) have
run, the LLM CatalogSource SHALL suggest only for columns whose label fields
are still empty (no ja/vi/en). Non-empty free-path labels SHALL NOT be
overwritten by the LLM. Description MAY be filled only when still empty.

#### Scenario: Japanese column already labeled by dictionary

- **GIVEN** romaji dictionary suggested ja label `得意先コード` for `TKSK_CD`
- **WHEN** describe runs with catalog-llm loaded
- **THEN** the LLM is not used to replace that label
- **AND** the draft keeps `得意先コード`

#### Scenario: Blank Vietnamese-style column gets LLM draft

- **GIVEN** column `xyz_flg` with no dictionary/Excel label
- **AND** a licensed local endpoint returns a draft vi/en label
- **WHEN** describe runs
- **THEN** the draft column includes the LLM label/description
- **AND** `reviewed` remains false

### Requirement: Never auto-review

LLM suggestions MUST leave `reviewed` false (or unset equivalent). Human
confirmation via Catalog Review UI or manual YAML remains required. Merge of
existing `reviewed: true` entries SHALL continue to preserve reviewed fields.

#### Scenario: Reviewed entry survives describe with LLM plugin

- **GIVEN** catalog column `TKSK_CD` with `reviewed: true` and ja `得意先コード`
- **WHEN** `knot-sync describe` runs with catalog-llm loaded
- **THEN** the ja label remains `得意先コード` and `reviewed` remains true

### Requirement: Soft-fail on local endpoint errors

When the local endpoint is unreachable, times out, returns invalid JSON, or
the model refuses, describe SHALL continue for other columns. The failed column
SHALL stay blank (or keep prior free-path fields) with an actionable message
(check URL/model/Docker/Ollama). Customer sources MUST remain unmodified.

#### Scenario: Ollama down does not abort describe

- **GIVEN** licensed plugin pointing at localhost and the endpoint is down
- **WHEN** describe encounters a blank column that would call the LLM
- **THEN** that column stays without LLM labels
- **AND** describe completes for remaining tables/columns
- **AND** the message names what to check next
