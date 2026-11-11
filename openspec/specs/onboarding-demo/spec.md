# onboarding-demo Specification

## Purpose
Lets new users (developers, IT admins, and PMs) run KnotSync end-to-end locally on realistic Japanese and Vietnamese sample data—including Office spreadsheets, legacy encodings, synthetic PII, and a sample SQL Semantic Catalog—without setting up an external database or committing binary fixtures.

## Requirements

### Requirement: Reproducible local demo data generator

The repository SHALL provide a local script (`scripts/create-demo-data.mjs`, wired as `pnpm demo:prepare`) that generates realistic sample files into a gitignored demo folder (`examples/.demo-data/`) without network calls or committing binary `.xlsx` blobs.

#### Scenario: Japanese and Vietnamese demo files are generated and processed

- **WHEN** an operator runs `pnpm demo:prepare`, then runs `knot-sync scan` and `knot-sync run` using `examples/demo.config.yaml`
- **THEN** the generated `.xlsx` containing Japanese Wareki (`令和6年4月1日`) and the `.txt`/`.csv` containing Vietnamese TCVN3 text (`NguyÔn V¨n A`) are extracted and normalized into the local SQLite store
- **AND** synthetic PII patterns in those demo files are masked according to default PII rules

### Requirement: Sample catalog for immediate UI preview

The repository SHALL include `examples/demo-catalog.yaml` referenced by `examples/demo.config.yaml` with Japanese and Vietnamese physical column examples (`TKSK_CD`, `ma_kh`) so an operator can preview `knot-sync ui -c examples/demo.config.yaml` without running PostgreSQL or MySQL.

#### Scenario: Operator opens demo UI

- **WHEN** an operator starts `knot-sync ui -c examples/demo.config.yaml`
- **THEN** the UI loads the sample `TKSK_CD` and `ma_kh` catalog entries ready for review
