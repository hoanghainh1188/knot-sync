import {
  ConfigError,
  PLUGIN_API_VERSION,
  type Connector,
  type ConnectorScanOptions,
  type EnterpriseSqlSourceType,
  type KnotSyncPlugin,
  type SourceConfig,
} from "@hoanghainh/knot-sync-core";
import {
  parseSqlSource,
  registerSqlDriverFactory,
  scanSql,
  type DriverFactory,
} from "@hoanghainh/knot-sync-connector-sql";
import {
  ENTERPRISE_SQL_PLUGIN_NAME,
  ENTERPRISE_SQL_TYPES,
} from "./constants.js";
import { assertEnterpriseSqlLicense } from "./license.js";
import { createAccessDriver, createAs400Driver } from "./odbc-driver.js";
import { createMssqlDriverFactory } from "./mssql.js";
import { createOracleDriverFactory } from "./oracle.js";
import {
  parseEnterpriseSqlSettings,
  type EnterpriseSqlSettings,
} from "./settings.js";

export interface EnterpriseSqlPluginOptions {
  settings?: unknown;
  env?: NodeJS.ProcessEnv;
  /** Test override: inject mock drivers per enterprise type. */
  driverFactories?: Partial<Record<EnterpriseSqlSourceType, DriverFactory>>;
}

function builtInFactory(type: EnterpriseSqlSourceType): DriverFactory {
  switch (type) {
    case "mssql":
      return createMssqlDriverFactory;
    case "oracle":
      return createOracleDriverFactory;
    case "access":
      return createAccessDriver;
    case "as400":
      return createAs400Driver;
    default: {
      const _exhaustive: never = type;
      throw new Error(`Unsupported enterprise SQL type: ${String(_exhaustive)}`);
    }
  }
}

function makeConnector(
  type: EnterpriseSqlSourceType,
  settings: EnterpriseSqlSettings,
  env: NodeJS.ProcessEnv,
  factories?: EnterpriseSqlPluginOptions["driverFactories"],
): Connector {
  return {
    id: type,
    parseSource(raw, ctx) {
      assertEnterpriseSqlLicense(settings, env);
      return parseSqlSource(raw, ctx, type);
    },
    async *scan(source: SourceConfig, options?: ConnectorScanOptions) {
      if (source.type !== type) {
        throw new Error(
          `Enterprise SQL connector "${type}" cannot scan source type "${source.type}".`,
        );
      }
      assertEnterpriseSqlLicense(settings, env);
      const factory = factories?.[type] ?? builtInFactory(type);
      yield* scanSql(source, options, factory);
    },
  };
}

export function createEnterpriseSqlPlugin(
  options: EnterpriseSqlPluginOptions = {},
): KnotSyncPlugin {
  return {
    name: ENTERPRISE_SQL_PLUGIN_NAME,
    version: "0.0.1",
    apiVersion: PLUGIN_API_VERSION,
    register(api) {
      let settings: EnterpriseSqlSettings;
      try {
        const raw =
          options.settings !== undefined ? options.settings : api.getPluginSettings();
        settings = parseEnterpriseSqlSettings(raw);
      } catch (err) {
        if (err instanceof ConfigError) throw err;
        throw new ConfigError(
          `Invalid "${ENTERPRISE_SQL_PLUGIN_NAME}" settings (${(err as Error).message || String(err)}). ` +
            `Fix ${ENTERPRISE_SQL_PLUGIN_NAME}: in the config, then retry.`,
        );
      }

      const env = options.env ?? process.env;
      for (const type of ENTERPRISE_SQL_TYPES) {
        const factory = options.driverFactories?.[type] ?? builtInFactory(type);
        registerSqlDriverFactory(type, async (url, opts) => {
          assertEnterpriseSqlLicense(settings, env);
          return factory(url, opts);
        });
        api.registerConnector(makeConnector(type, settings, env, options.driverFactories));
      }
    },
  };
}

const defaultPlugin = createEnterpriseSqlPlugin();
export default defaultPlugin;
