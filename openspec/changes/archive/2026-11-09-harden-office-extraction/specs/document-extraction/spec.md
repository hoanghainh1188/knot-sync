# Spec Delta

## ADDED Requirements

### Requirement: Oversized files are skipped with SKIPPED_TOO_LARGE

During `knot-sync run`, before full extraction of an inventory file, the
pipeline SHALL compare the file’s size to `extraction.maxFileSizeMb`. Files
strictly larger than the limit SHALL NOT be fully loaded for extraction. The
run SHALL record an issue with code `SKIPPED_TOO_LARGE` and an actionable
message (limit and path), then continue with other files. The run MUST NOT
abort solely because one or more files are oversized.

#### Scenario: Large Japanese spreadsheet is skipped

- **GIVEN** an inventory `.xlsx` whose size exceeds `extraction.maxFileSizeMb`
  (for example a multi-hundred-MB `経理/台帳.xlsx`)
- **WHEN** `knot-sync run` processes that inventory
- **THEN** no Document is upserted for that path from this attempt
- **AND** an issue with code `SKIPPED_TOO_LARGE` names the path and the size
  limit
- **AND** other eligible files in the inventory still extract

#### Scenario: File at or under the limit still extracts

- **GIVEN** a UTF-8 Vietnamese `.txt` within the configured size limit
- **WHEN** `knot-sync run` processes that file
- **THEN** a Document is stored as before (subject to other extraction rules)

### Requirement: Per-file extraction timeout

Each file extraction during `knot-sync run` SHALL be bounded by
`extraction.timeoutSeconds`. When the timeout elapses before extraction
completes, the file SHALL be recorded as a run issue with an actionable
timeout message (code MAY be `EXTRACT_TIMEOUT` or equivalent documented
code), no partial Document from that attempt SHALL be upserted as success, and
the run SHALL continue with remaining files.

#### Scenario: Hung extract does not block the rest of the run

- **GIVEN** an extractor call that does not finish within
  `extraction.timeoutSeconds`
- **WHEN** `knot-sync run` processes that file among others
- **THEN** an issue is recorded for that path mentioning the timeout
- **AND** subsequent inventory files are still processed
- **AND** the command exits 0 if no fatal config/store error occurred

### Requirement: Large spreadsheets use bounded-memory extraction

The built-in office extractor SHALL extract `.xlsx` content without requiring
the entire workbook DOM for large workbooks: parsing MUST keep peak memory
bounded relative to loading the full sheet model at once (streaming or
equivalent). Extraction of modest fixtures (including Japanese sheet names and
headers) MUST still produce Documents with tables as today.

#### Scenario: Japanese sheet still yields tables under streaming path

- **GIVEN** a fixture `.xlsx` with a sheet named `請求` and header/row cells
- **WHEN** extraction runs (including the bounded-memory path)
- **THEN** the Document tables include those headers and rows
- **AND** the source file on disk is unchanged

### Requirement: Large delimited and plain text are chunked

For `.csv`, `.tsv`, `.txt`, and `.md`, when content would exceed
`extraction.maxTextChars`, the extractor SHALL read in chunks/lines, keep
UTF-8 JP/VN text in the accepted portion, and make truncation observable.

#### Scenario: Oversized CSV is bounded without aborting run

- **GIVEN** a `.csv` larger than the configured text bound but under
  `maxFileSizeMb`
- **WHEN** `knot-sync run` extracts it
- **THEN** extraction completes without aborting the run
- **AND** any stored Document content does not exceed the configured bound
- **AND** truncation is indicated if rows/bytes were dropped

#### Scenario: Vietnamese CSV within bounds is unchanged in substance

- **GIVEN** a small UTF-8 `.csv` with a Vietnamese header such as `mã khách`
- **WHEN** extraction runs
- **THEN** the Document tables include that header text
