# Spec Delta

## Purpose

Provides an opt-in, licensed local-LLM enricher that adds injection-guard and
PII findings after deterministic rules on `run`, so operators catch subtler
cases without replacing free rule-based guardrails or calling cloud APIs by
default.

## ADDED Requirements

### Requirement: Opt-in guard-llm plugin

The system SHALL provide a guard-llm plugin (not loaded as a default built-in)
that operators enable under config `plugins:`. When loaded and licensed, a
model enricher SHALL run after rule-based PII and guard on `run`. When omitted,
`run` SHALL keep rule-only PII and guard behavior.

#### Scenario: Plugin omitted keeps rule-only path

- **GIVEN** config does not list the guard-llm plugin
- **WHEN** the user runs `knot-sync run`
- **THEN** no model enricher from this plugin is registered
- **AND** rule-based PII and guard still apply as today

#### Scenario: Licensed plugin enables model enricher

- **GIVEN** guard-llm is listed with a valid license and local LLM endpoint
  configured
- **WHEN** plugins load successfully
- **THEN** `knot-sync plugins` lists the guard-llm plugin
- **AND** the model enricher is available to `run`

### Requirement: License self-check

The guard-llm plugin SHALL validate its own license before calling the local
LLM. The KnotSync core SHALL NOT implement that check. Missing/invalid license
SHALL leave the model enricher as a no-op with guidance to set the documented
license env/key; rule-based results MUST remain.

#### Scenario: Missing license skips model HTTP

- **GIVEN** the plugin path is listed but no valid license is configured
- **WHEN** `run` would enrich a document
- **THEN** no LLM HTTP request is made for that path
- **AND** rule-based PII/guard findings are unchanged
- **AND** the operator can see how to set the license

### Requirement: Local OpenAI-compatible chat

Model requests SHALL target a configured local OpenAI-compatible HTTP base URL
(default loopback). Operators MAY point that URL at Ollama or a Docker chat
server. Cloud vendor endpoints SHALL NOT be required or hard-coded. Requests
MUST NOT write to customer source folders.

#### Scenario: Default targets localhost

- **GIVEN** licensed plugin with default base URL settings
- **WHEN** an enrich request runs
- **THEN** the HTTP call uses a loopback (or documented local) base URL
- **AND** no cloud LLM hostname is hard-coded

### Requirement: Additive findings after rules

On `run`, after rule-based PII then guard have been applied, the enricher SHALL
inspect the current document text and MAY append additional findings to
`Document.guard` and/or `Document.pii`. It MUST NOT remove existing rule-based
findings. Model findings SHALL then be subject to the configured `guard.mode`
and `pii.mode` (flag/strip/block and mask/hash/drop) the same way as rule
findings.

#### Scenario: Japanese injection missed by rules is flagged

- **GIVEN** cleaned content contains a subtle Japanese instruction-style
  injection that deterministic guard rules miss
- **AND** licensed local LLM returns a guard finding for that span
- **AND** `guard.mode` is `flag`
- **WHEN** `run` processes the document
- **THEN** `Document.guard` includes a model-origin finding for that content
- **AND** `guardRisk` reflects the elevated risk
- **AND** source files remain unchanged

#### Scenario: Vietnamese PII missed by rules is masked

- **GIVEN** cleaned content contains Vietnamese personal data that rule-based
  PII missed
- **AND** licensed local LLM returns a PII finding for that span
- **AND** `pii.mode` is `mask`
- **WHEN** `run` processes the document
- **THEN** the span is masked in stored content
- **AND** `Document.pii` records the finding without storing the raw value as a
  separate secret field
- **AND** source files remain unchanged

### Requirement: Soft-fail on local endpoint errors

When the local LLM is unreachable, times out, returns invalid data, or the
plugin is unlicensed, enrich SHALL soft-fail: keep rule-based document state,
continue `run` for other documents when possible, and surface actionable
guidance (check URL/model/Docker/Ollama/license). Customer sources MUST remain
unmodified.

#### Scenario: Ollama down keeps rule-based results

- **GIVEN** guard-llm loaded but the LLM endpoint is down
- **WHEN** `run` processes a document that already has rule-based findings
- **THEN** those findings remain
- **AND** `run` does not fail solely because the model enricher soft-failed
