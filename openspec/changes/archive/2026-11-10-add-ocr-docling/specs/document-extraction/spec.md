# Spec Delta

## ADDED Requirements

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
