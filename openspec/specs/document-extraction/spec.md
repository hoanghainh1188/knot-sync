# document-extraction Specification

## Purpose

Turns inventoried files into normalized Documents via extractor plugins and the
`knot-sync run` command, so keyword search can find office and text content
without changing anything in the customer source.

## Requirements

### Requirement: run command reads the last scan inventory
`knot-sync run` SHALL load the configured store and process each file from the
latest scan inventory. If no inventory exists for a source, the command SHALL
exit with code 1 and tell the user to run `knot-sync scan` first.

#### Scenario: Missing inventory
- **GIVEN** a valid config whose store has never been scanned
- **WHEN** the user runs `knot-sync run`
- **THEN** the exit code is 1 and the message tells them to run `knot-sync scan`

### Requirement: Office and text formats are extracted
The built-in office extractor SHALL extract `.xlsx`, `.docx`, text-based `.pdf`,
`.csv`, `.tsv`, `.txt` and `.md` into a Document whose `content` is Markdown and
whose `tables` are arrays of headers and rows when the format has tables.

#### Scenario: Japanese spreadsheet
- **GIVEN** an inventory entry for `経理/請求書.xlsx` with a sheet containing headers and rows
- **WHEN** `knot-sync run` processes that file
- **THEN** a Document is stored whose title or content reflects the file and whose tables include those headers and rows

#### Scenario: Vietnamese plain text
- **GIVEN** an inventory entry for `Hóa đơn.txt` whose bytes are UTF-8 text
- **WHEN** `knot-sync run` processes that file
- **THEN** a Document is stored whose content contains the file text

### Requirement: Incremental extraction by file hash
`run` SHALL skip extracting a file when a Document for that source location
already exists and its recorded source-file hash equals the inventory hash.
Changed or new hashes SHALL be extracted and upserted.

#### Scenario: Unchanged file is skipped
- **GIVEN** a Document stored from a previous run for the same source path and hash
- **WHEN** `knot-sync run` runs again with the same inventory hash
- **THEN** the extractor is not invoked for that file and the stored Document content is unchanged

#### Scenario: Changed hash is re-extracted
- **GIVEN** a stored Document whose source-file hash differs from the current inventory hash
- **WHEN** `knot-sync run` processes that file
- **THEN** a new Document content is stored for the same document id

### Requirement: Broken or unsupported files do not abort the run
Files with no matching extractor, or extractors that fail, SHALL be recorded as
run issues (path + reason) and processing SHALL continue. The command SHALL exit
0 when the run finishes unless a fatal config/store error occurs.

#### Scenario: Unsupported extension
- **GIVEN** an inventory entry for `notes.exe`
- **WHEN** `knot-sync run` processes the inventory
- **THEN** the file is listed as an issue or skipped without producing a Document, and other files still extract

#### Scenario: Corrupt office file
- **GIVEN** an inventory `.docx` whose bytes are not a valid Word document
- **WHEN** `knot-sync run` reaches that file
- **THEN** an issue is reported for that path and the exit code remains 0 if no fatal error occurred

### Requirement: Extractors are plugins
Office extraction SHALL be provided by a built-in extractor plugin registered
through the plugin API. `run` SHALL choose an extractor by matching the file
type or extension against registered extractors; it MUST NOT hard-code library
calls in the CLI beyond loading built-in plugins.

#### Scenario: Built-in extractor is listed
- **WHEN** the user runs `knot-sync plugins` after this change
- **THEN** the listing includes the office extractor plugin and at least one `extractor:` id

### Requirement: Sources stay read-only during run
Extraction MUST only read file bytes from source paths. It MUST NOT create,
modify, move or delete anything inside a configured source.

#### Scenario: Run leaves source untouched
- **WHEN** `knot-sync run` extracts documents from a folder source
- **THEN** no file or folder inside the source path is created, changed or removed

### Requirement: Clean after extract on run

When `knot-sync run` successfully extracts a document (status would otherwise
be `ready`), the CLI SHALL invoke each registered `Cleaner` in registration
order before upserting the document. Cleaning failures SHALL set document
status to `error` with an actionable message and SHALL NOT leave partial
cleaned content without original text.

#### Scenario: Cleaner runs after extract

- **WHEN** `knot-sync run` extracts text for a changed file and at least one
  Cleaner is registered
- **THEN** each Cleaner's `clean` is called with the extracted Document
- **AND** the upserted document uses the cleaner output for `content` / tables

#### Scenario: No cleaner registered

- **WHEN** `knot-sync run` extracts text and no Cleaner is registered
- **THEN** behavior matches extraction-only upsert (unchanged from prior
  archive)

#### Scenario: Cleaner throws

- **WHEN** a Cleaner's `clean` throws or rejects
- **THEN** the document is stored with status `error`
- **AND** the error message tells the operator what failed and to retry `run`
  after fixing input or disabling the failing step in `cleaning:`

### Requirement: Apply PII rules after clean on run

When `knot-sync run` has a Document ready after extraction (and after any
cleaners), the CLI SHALL run each registered `PiiRule` in registration order
to detect spans, then apply `pii.mode` once across the combined findings before
upsert. PII processing failures SHALL set document status to `error` with an
actionable message and MUST NOT upsert unmasked content.

#### Scenario: Masked content is what is upserted

- **WHEN** `run` extracts a file whose text contains an email and at least one
  PiiRule is registered
- **THEN** the upserted document content does not contain that email
- **AND** `Document.pii` is non-empty when a rule matched

#### Scenario: No PiiRule registered

- **WHEN** `run` completes extract/clean and no PiiRule is registered
- **THEN** upsert proceeds without PII transformation (content unchanged by this step)

### Requirement: Apply guard rules after PII on run

When `knot-sync run` has a Document ready after extraction, cleaning, and PII
processing, the CLI SHALL run each registered `GuardRule` in registration order
to detect spans, then apply `guard.mode` before upsert. Guard processing
failures SHALL set document status to `error` with an actionable message and
MUST NOT leave the operator without a clear next step.

#### Scenario: Guard runs after PII

- **WHEN** `run` extracts a file and at least one GuardRule is registered
- **THEN** guard detection/apply runs after PII masking on that document
- **AND** the upserted document reflects `guard.mode` (flag, strip, or block)

#### Scenario: No GuardRule registered

- **WHEN** `run` completes extract/clean/PII and no GuardRule is registered
- **THEN** upsert proceeds without guard transformation

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

### Requirement: Scanned PDF fallthrough to OCR

When the built-in office extractor returns a soft failure indicating a PDF has
no extractable text (e.g. code `EMPTY`) **and** an OCR extractor plugin is
loaded and willing to handle `.pdf`, `knot-sync run` SHALL attempt OCR for that
file instead of treating EMPTY as the final outcome. Text-layer PDFs that office
extracts successfully SHALL NOT invoke OCR.

#### Scenario: Scanned PDF uses OCR when plugin loaded

- **GIVEN** a PDF inventory entry with no text layer
- **AND** the OCR plugin is loaded and licensed with Docker available
- **WHEN** `knot-sync run` processes that file
- **THEN** office extraction reports empty/no text
- **AND** OCR runs and, on success, a Document is stored from OCR output

#### Scenario: Text PDF does not call OCR

- **GIVEN** a PDF whose text layer contains `請求書`
- **AND** the OCR plugin is loaded
- **WHEN** `knot-sync run` processes that file
- **THEN** the Document comes from the office/text extractor
- **AND** Docker/OCR is not invoked for that file

### Requirement: Image inventory files extractable via OCR

When the OCR plugin is loaded, inventory files with supported image extensions
SHALL be considered extractable (matching extractor found). When the plugin is
not loaded, behavior for images remains unsupported as today.

#### Scenario: Vietnamese invoice photo

- **GIVEN** the OCR plugin is loaded and healthy
- **AND** inventory contains `Hóa đơn tháng 5.jpg`
- **WHEN** `knot-sync run` processes that file
- **THEN** extraction is attempted via OCR rather than an immediate UNSUPPORTED
  from having no extractor

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
