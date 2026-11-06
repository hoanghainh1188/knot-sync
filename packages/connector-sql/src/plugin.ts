import {
  PLUGIN_API_VERSION,
  type Connector,
  type ConnectorScanOptions,
  type KnotSyncPlugin,
  type SourceConfig,
} from "@hoanghainh/knot-sync-core";
import type { DriverFactory } from "./driver.js";
import { parseSqlSource } from "./parse.js";
import { createSqlMcpToolsPlugin } from "./mcp-tools.js";
import { defaultDriverFactory, scanSql } from "./scan.js";

export interface SqlPluginOptions {
  /** Test override for driver creation per dialect. */
  driverFactories?: Partial<Record<"postgres" | "mysql", DriverFactory>>;
}

function makeConnector(
  type: "postgres" | "mysql",
  factories?: SqlPluginOptions["driverFactories"],
): Connector {
  return {
    id: type,
    parseSource(raw, ctx) {
      return parseSqlSource(raw, ctx, type);
    },
    async *scan(source: SourceConfig, options?: ConnectorScanOptions) {
      if (source.type !== type) {
        throw new Error(`SQL connector "${type}" cannot scan source type "${source.type}".`);
      }
      const factory = factories?.[type] ?? defaultDriverFactory(type);
      yield* scanSql(source, options, factory);
    },
  };
}

/** Built-in SQL connectors + MCP tools (postgres / mysql). */
export function createSqlPlugin(options: SqlPluginOptions = {}): KnotSyncPlugin {
  const tools = createSqlMcpToolsPlugin();
  return {
    name: "connector-sql",
    version: "0.0.1",
    apiVersion: PLUGIN_API_VERSION,
    register(api) {
      api.registerConnector(makeConnector("postgres", options.driverFactories));
      api.registerConnector(makeConnector("mysql", options.driverFactories));
      tools.register(api);
    },
  };
}

export default createSqlPlugin();
