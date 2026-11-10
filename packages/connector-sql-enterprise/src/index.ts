import { createEnterpriseSqlPlugin } from "./plugin.js";

export {
  ENTERPRISE_SQL_PLUGIN_NAME,
  ENTERPRISE_SQL_TYPES,
  DEFAULT_LICENSE_ENV,
  SQL_ENTERPRISE_TEST_LICENSE_SENTINEL,
} from "./constants.js";
export {
  parseEnterpriseSqlSettings,
  type EnterpriseSqlSettings,
} from "./settings.js";
export {
  assertEnterpriseSqlLicense,
  isValidEnterpriseSqlLicense,
  licenseMissingMessage,
  resolveEnterpriseSqlLicense,
} from "./license.js";
export { createMssqlDriver, createMssqlDriverFactory } from "./mssql.js";
export { createOracleDriver, createOracleDriverFactory } from "./oracle.js";
export {
  createOdbcSqlDriver,
  createAccessDriver,
  createAs400Driver,
  createAccessDriverFactory,
  createAs400DriverFactory,
  type OdbcEngine,
} from "./odbc-driver.js";
export {
  createEnterpriseSqlPlugin,
  type EnterpriseSqlPluginOptions,
} from "./plugin.js";

export default createEnterpriseSqlPlugin();
