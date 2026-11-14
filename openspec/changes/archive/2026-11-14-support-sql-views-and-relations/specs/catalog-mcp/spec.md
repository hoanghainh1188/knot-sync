# Spec Delta

## MODIFIED Requirements

### Requirement: Enriched tool descriptions

When a catalog entry exists for a table or column, `describe_table` /
`query_table` descriptions (and schema resource text where applicable) SHALL
include business labels (preferring available ja/vi/en) and optional
foreign-key `references` (`"<table>.<column>"`) alongside physical names so
agents can interpret cryptic columns and discover master-detail relations.

#### Scenario: Japanese label in describe_table

- **GIVEN** catalog maps column `TKSK_CD` to ja label `得意先コード` and `references: "tokuisaki_mst.TKSK_CD"`
- **WHEN** `describe_table` is called for that table
- **THEN** the result mentions `TKSK_CD`, `得意先コード`, and `tokuisaki_mst.TKSK_CD`
