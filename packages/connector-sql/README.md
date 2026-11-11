# @hoanghainh/knot-sync-connector-sql

Built-in read-only PostgreSQL/MySQL connector plugins.

Supports configurable Postgres `schema` (default `public`), capped connection
pools, per-session statement timeouts (`statementTimeoutMs`, default 5000), and
`query_table` filters (`eq`, `in`, `range`, `contains`, `starts_with`,
`between_dates`, `is_null`) plus allow-listed `groupBy`, `aggregations`
(`count`, `sum`, `avg`, `min`, `max`), and `orderBy` sorting across core and
enterprise SQL dialects.

Example `query_table` payload:

```json
{
  "source": "erp",
  "table": "受注",
  "groupBy": ["得意先コード"],
  "aggregations": [{ "func": "sum", "column": "金額", "as": "total_amount" }],
  "orderBy": [{ "column": "total_amount", "dir": "desc" }],
  "limit": 10
}
```

Part of [KnotSync](https://github.com/hoanghainh1188/knot-sync). See the
repository root README for install and usage.

**License:** Apache-2.0  
**Version:** 0.1.1
