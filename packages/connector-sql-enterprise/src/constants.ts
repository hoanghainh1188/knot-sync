import type { EnterpriseSqlSourceType } from "@hoanghainh/knot-sync-core";

export const ENTERPRISE_SQL_PLUGIN_NAME = "connector-sql-enterprise";

export const DEFAULT_LICENSE_ENV = "KNOT_SYNC_SQL_ENTERPRISE_LICENSE";

/** Accepted only in tests / local smoke — not a production key. */
export const SQL_ENTERPRISE_TEST_LICENSE_SENTINEL = "knot-sync-sql-enterprise-dev";

export const ENTERPRISE_SQL_TYPES: readonly EnterpriseSqlSourceType[] = [
  "mssql",
  "oracle",
  "access",
  "as400",
] as const;
