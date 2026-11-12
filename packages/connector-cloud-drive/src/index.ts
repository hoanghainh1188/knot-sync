import {
  PLUGIN_API_VERSION,
  type KnotSyncPlugin,
  type PluginApi,
} from "@hoanghainh/knot-sync-core";
import { CLOUD_DRIVE_PLUGIN_NAME } from "./constants.js";
import { createGDriveConnector } from "./gdrive.js";
import type { FetchLike } from "./http.js";
import {
  parseCloudDriveSettings,
  type CloudDriveLicenseCheckOptions,
} from "./license.js";
import { createMsGraphConnector } from "./msgraph.js";

export {
  CLOUD_DRIVE_PLUGIN_NAME,
  CLOUD_DRIVE_TEST_LICENSE_SENTINEL,
  CLOUD_DRIVE_TYPES,
  DEFAULT_LICENSE_ENV,
  type CloudDriveType,
} from "./constants.js";
export {
  assertCloudDriveLicense,
  licenseMissingMessage,
  parseCloudDriveSettings,
  verifyCloudDriveLicense,
  type CloudDriveLicenseCheckOptions,
  type CloudDriveSettings,
} from "./license.js";
export { createGDriveConnector, type GDriveSourceConfig } from "./gdrive.js";
export { createMsGraphConnector, type MsGraphKind, type MsGraphSourceConfig } from "./msgraph.js";

export interface CloudDrivePluginOptions {
  env?: NodeJS.ProcessEnv;
  fetchFn?: FetchLike;
  licenseOptions?: CloudDriveLicenseCheckOptions;
}

export function createCloudDrivePlugin(options: CloudDrivePluginOptions = {}): KnotSyncPlugin {
  return {
    name: CLOUD_DRIVE_PLUGIN_NAME,
    version: "0.0.1",
    apiVersion: PLUGIN_API_VERSION,
    register(api: PluginApi) {
      const settings = parseCloudDriveSettings(api.getPluginSettings());
      const getSettings = () => settings;
      api.registerConnector(
        createGDriveConnector({
          getSettings,
          env: options.env,
          fetchFn: options.fetchFn,
          licenseOptions: options.licenseOptions,
        }),
      );
      api.registerConnector(
        createMsGraphConnector({
          kind: "sharepoint",
          getSettings,
          env: options.env,
          fetchFn: options.fetchFn,
          licenseOptions: options.licenseOptions,
        }),
      );
      api.registerConnector(
        createMsGraphConnector({
          kind: "onedrive",
          getSettings,
          env: options.env,
          fetchFn: options.fetchFn,
          licenseOptions: options.licenseOptions,
        }),
      );
    },
  };
}

export default createCloudDrivePlugin();
