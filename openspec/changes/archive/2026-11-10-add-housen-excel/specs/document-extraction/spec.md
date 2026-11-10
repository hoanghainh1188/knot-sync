# Spec Delta

## ADDED Requirements

### Requirement: Form-like xlsx uses housen when plugin loaded

When the housen Excel plugin is loaded and licensed, and a `.xlsx` inventory
file is classified as form-like / 方眼紙-style, `knot-sync run` SHALL store a
Document produced by housen layout extraction instead of the flat office
first-row-as-header dump. Plain tabular spreadsheets SHALL remain on the
built-in office extractor path even when the housen plugin is loaded.

#### Scenario: Form sheet rewrites via housen

- **GIVEN** a `.xlsx` with sparse label/value layout including `請求日`
- **AND** the housen plugin is loaded and licensed
- **WHEN** `knot-sync run` processes that file
- **THEN** the stored Document content reflects structured housen output
  including `請求日`
- **AND** the source `.xlsx` is unchanged

#### Scenario: Plain table stays on office

- **GIVEN** a dense `.xlsx` data table (header row + uniform data rows) with
  column `mã KH`
- **AND** the housen plugin is loaded
- **WHEN** `knot-sync run` processes that file
- **THEN** the Document comes from the office/table extractor path
- **AND** housen does not replace that Document with a form layout
