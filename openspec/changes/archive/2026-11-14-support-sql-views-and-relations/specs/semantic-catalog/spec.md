# Spec Delta

## MODIFIED Requirements

### Requirement: Catalog entry shape

For each SQL source covered by the catalog, the file SHALL record tables and
columns with at least: physical name, business label fields for ja/vi/en
(optional strings), description, type, valid values (list), pii tag, expose
flag, reviewed flag, and an optional foreign-key `references` string
(`"<table>.<column>"`).

#### Scenario: Japanese physical name preserved

- **GIVEN** a column physically named `得意先コード`
- **WHEN** it is written to the catalog
- **THEN** the entry retains that physical name and may include a ja business
  label

#### Scenario: Foreign-key reference persisted in catalog YAML

- **GIVEN** column `TKSK_CD` in table `juchu` with `references: "tokuisaki_mst.TKSK_CD"`
- **WHEN** the catalog is written and parsed back
- **THEN** `references` equals `"tokuisaki_mst.TKSK_CD"`

### Requirement: Reviewed entries are preserved

When merging a new `describe` run into an existing catalog, entries with
`reviewed: true` SHALL keep their reviewed fields (including `references`)
unchanged. Unreviewed entries MAY be updated, including filling or updating
`references` from SQL introspection. New tables/columns MAY be added.

#### Scenario: Reviewed column not overwritten

- **GIVEN** catalog column `TKSK_CD` with `reviewed: true`, label ja `得意先コード`, and `references: "tokuisaki_mst.TKSK_CD"`
- **WHEN** `describe` runs again with dictionaries or introspection that would suggest different values
- **THEN** the ja label remains `得意先コード`, `references` remains `"tokuisaki_mst.TKSK_CD"`, and `reviewed` remains true
