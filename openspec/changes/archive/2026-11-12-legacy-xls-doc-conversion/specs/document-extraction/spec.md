## MODIFIED Requirements

### Requirement: Office and text formats are extracted

The built-in office extractor SHALL extract `.xlsx`, `.xls`, `.docx`, `.doc`, text-based `.pdf`, `.csv`, `.tsv`, `.txt` and `.md` into a Document whose `content` is Markdown and whose `tables` are arrays of headers and rows when the format has tables.

#### Scenario: Japanese spreadsheet
- **GIVEN** an inventory entry for `経理/請求書.xlsx` with a sheet containing headers and rows
- **WHEN** `knot-sync run` processes that file
- **THEN** a Document is stored whose title or content reflects the file and whose tables include those headers and rows

#### Scenario: Vietnamese plain text
- **GIVEN** an inventory entry for `Hóa đơn.txt` whose bytes are UTF-8 text
- **WHEN** `knot-sync run` processes that file
- **THEN** a Document is stored whose content contains the file text

#### Scenario: Japanese legacy .xls spreadsheet
- **GIVEN** an inventory entry for `経理/旧請求書.xls` in BIFF8 binary format containing a sheet with Japanese headers and rows
- **WHEN** `knot-sync run` processes that file
- **THEN** a Document with `type: "xls"` is stored whose `content` contains Markdown table rows and whose `tables` include the extracted headers and rows

#### Scenario: Vietnamese legacy .doc document
- **GIVEN** an inventory entry for `hop-dong-cu.doc` in Word 97–2003 OLE2 binary format containing Vietnamese text
- **WHEN** `knot-sync run` processes that file
- **THEN** a Document with `type: "doc"` is stored whose `content` contains the extracted Vietnamese text
- **AND** the content flows through the configured JA/VI cleaner, PII masker, and injection guard before storage

## ADDED Requirements

### Requirement: Legacy binary .xls and .doc error handling

Corrupt, truncated, or password-protected/encrypted `.xls` and `.doc` files SHALL fail extraction cleanly with an actionable `PARSE` or `EMPTY` issue (path + reason) and MUST NOT crash or abort `knot-sync run`.

#### Scenario: Corrupt or encrypted legacy .xls does not abort run
- **GIVEN** an inventory containing a malformed or encrypted `.xls` file alongside a valid `.txt` file
- **WHEN** `knot-sync run` processes the inventory
- **THEN** an issue is recorded for the `.xls` path
- **AND** the valid `.txt` file still extracts and `knot-sync run` exits 0
