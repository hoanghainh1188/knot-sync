import {
  PLUGIN_API_VERSION,
  type KnotSyncPlugin,
} from "@hoanghainh/knot-sync-core";
import {
  createCustomerDictCatalogSource,
  createExcelDefinitionCatalogSource,
  createRomajiCatalogSource,
  createVietnameseCatalogSource,
} from "./sources.js";
import type { CustomerDict } from "./dictionaries.js";
import type { DefinitionIndex } from "./excel.js";

export interface CatalogPluginOptions {
  customerDict?: CustomerDict;
  definitionIndex?: DefinitionIndex;
}

/** Built-in catalog-source plugin (dictionaries + optional Excel / customer dict). */
export function createCatalogPlugin(options: CatalogPluginOptions = {}): KnotSyncPlugin {
  return {
    name: "catalog",
    version: "0.0.1",
    apiVersion: PLUGIN_API_VERSION,
    register(api) {
      api.registerCatalogSource(createRomajiCatalogSource());
      api.registerCatalogSource(createVietnameseCatalogSource());
      if (options.customerDict) {
        api.registerCatalogSource(createCustomerDictCatalogSource(options.customerDict));
      }
      if (options.definitionIndex) {
        api.registerCatalogSource(createExcelDefinitionCatalogSource(options.definitionIndex));
      }
    },
  };
}

export default createCatalogPlugin;
