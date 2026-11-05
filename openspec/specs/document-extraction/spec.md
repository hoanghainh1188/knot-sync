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
