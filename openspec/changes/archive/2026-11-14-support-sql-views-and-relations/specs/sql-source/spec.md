# Spec Delta

## MODIFIED Requirements

### Requirement: Introspection for allowed objects

For each allowed table, view, or materialized view that exists, the connector
SHALL introspect column names, types, nullability, primary/unique key
information, and foreign-key target references (`<table>.<column>`) available
from the database catalogs. PostgreSQL row estimates SHALL include ordinary
tables (`r`), partitioned tables (`p`), views (`v`), and materialized views
(`m`). Missing allowed objects SHALL be reported as scan issues without aborting
the whole multi-source scan when possible.

#### Scenario: Japanese table name

- **GIVEN** an allowed table named `請求書`
- **WHEN** the source is scanned
- **THEN** that table appears in the inventory with its introspected columns

#### Scenario: Allow-listed PostgreSQL view and materialized view

- **GIVEN** an allowed PostgreSQL materialized view `v_juchu_summary`
- **WHEN** introspection runs
- **THEN** its columns, types, and row estimate are returned without mutating the database

#### Scenario: Foreign key target captured when allow-listed

- **GIVEN** table `juchu` has a foreign key `TKSK_CD` referencing `tokuisaki_mst(TKSK_CD)`
- **WHEN** `introspectTable("juchu")` runs
- **THEN** column `TKSK_CD` includes `references: "tokuisaki_mst.TKSK_CD"`
