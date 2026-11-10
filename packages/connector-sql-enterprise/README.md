# @hoanghainh/knot-sync-connector-sql-enterprise

Opt-in **paid** enterprise SQL connectors for KnotSync:

| `type` | Engine | Default driver | License notes |
| --- | --- | --- | --- |
| `mssql` | SQL Server | `tedious` (pure JS) | MIT |
| `oracle` | Oracle | `oracledb` (optional) | Apache-2.0 / UPL |
| `access` | Microsoft Access | `odbc` + ACE/Jet | `odbc` MIT; ACE is OS install |
| `as400` | IBM i | `odbc` + IBM i Access | `odbc` MIT; IBM client is OS install |

Not a free CLI built-in. Enable under `plugins:` and set a license. Same safety
model as Postgres/MySQL: `url: env:NAME`, non-empty `allow`, read-only intent,
parameterized MCP `describe_table` / `query_table` only (no free SQL).

## License

```bash
export KNOT_SYNC_SQL_ENTERPRISE_LICENSE=your-license-key
```

For local tests only, the sentinel `knot-sync-sql-enterprise-dev` is accepted.

```yaml
plugins:
  - ../packages/connector-sql-enterprise/dist/index.js   # monorepo path example
connector-sql-enterprise:
  # licenseEnv: KNOT_SYNC_SQL_ENTERPRISE_LICENSE
  # licenseKey: knot-sync-sql-enterprise-dev   # tests / local only
```

## Example sources

```yaml
sources:
  - id: erp-mssql
    type: mssql
    url: env:KNOT_MSSQL_URL
    allow:
      請求:
        columns: [請求番号, 金額, 得意先名]

  - id: erp-oracle
    type: oracle
    url: env:KNOT_ORACLE_URL
    allow:
      受注:
        columns: [受注番号, 金額]

  - id: legacy-access
    type: access
    url: env:KNOT_ACCESS_ODBC
    allow:
      hoa_don:
        columns: [ma_kh, so_tien]

  - id: ibmi
    type: as400
    url: env:KNOT_AS400_ODBC
    allow:
      請求:
        columns: [金額]
```

### URL / connection string examples

```bash
# SQL Server (tedious)
export KNOT_MSSQL_URL='mssql://user:pass@sqlhost:1433/AppDb?encrypt=true&trustServerCertificate=true&ApplicationIntent=ReadOnly'

# Oracle (oracledb Thin / Easy Connect)
export KNOT_ORACLE_URL='oracle://user:pass@oraclehost:1521/ORCLPDB1'

# Access — ODBC connection string (Windows + ACE recommended)
export KNOT_ACCESS_ODBC='Driver={Microsoft Access Driver (*.mdb, *.accdb)};Dbq=C:\data\legacy.accdb;ReadOnly=1'

# IBM i — IBM i Access ODBC DSN or connection string
export KNOT_AS400_ODBC='Driver={IBM i Access ODBC Driver};System=ibmi.example;Uid=USER;Pwd=SECRET;DefaultLibraries=LIB'
```

## Optional native / ODBC deps

`tedious` is a normal dependency (pure JS). `oracledb` and `odbc` are
**optionalDependencies** so installs without Oracle Instant Client / ODBC still
succeed for mssql-only hosts. Missing modules soft-fail that engine with a
setup message; other sources continue.

```bash
# When you need Oracle
pnpm add oracledb --filter @hoanghainh/knot-sync-connector-sql-enterprise

# When you need Access / AS400
pnpm add odbc --filter @hoanghainh/knot-sync-connector-sql-enterprise
```

## Soft-fail codes / messages

| Situation | What you see |
| --- | --- |
| Missing/invalid license | Config error naming `KNOT_SYNC_SQL_ENTERPRISE_LICENSE` / `licenseKey` |
| Missing `oracledb` / `odbc` | Connect/scan issue naming the module and README setup |
| Missing ACE / IBM ODBC driver | ODBC connect error with install hint |

Free Postgres/MySQL connectors are unchanged and do not require this package.
