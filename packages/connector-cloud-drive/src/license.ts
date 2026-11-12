import { ConfigError } from "@hoanghainh/knot-sync-core";
import {
  formatLicenseFailureMessage,
  resolveAndVerifyPluginLicense,
  type LicenseVerificationFailure,
  type LicenseVerificationResult,
  type ResolvePluginLicenseOptions,
} from "@hoanghainh/knot-sync-plugin-license";
import {
  CLOUD_DRIVE_PLUGIN_NAME,
  CLOUD_DRIVE_TEST_LICENSE_SENTINEL,
  DEFAULT_LICENSE_ENV,
} from "./constants.js";

export interface CloudDriveSettings {
  licenseEnv: string;
  licenseKey?: string;
}

export type CloudDriveLicenseCheckOptions = Pick<
  ResolvePluginLicenseOptions,
  "publicKey" | "nowMs" | "allowTestSentinel"
>;

/** Parse plugin-level settings under `connector-cloud-drive:`. */
export function parseCloudDriveSettings(raw: unknown): CloudDriveSettings {
  if (raw === undefined || raw === null) {
    return { licenseEnv: DEFAULT_LICENSE_ENV };
  }
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new ConfigError(`"${CLOUD_DRIVE_PLUGIN_NAME}" settings must be an object.`);
  }
  const obj = raw as Record<string, unknown>;
  const licenseEnvRaw = obj.license_env ?? obj.licenseEnv;
  const licenseKeyRaw = obj.license_key ?? obj.licenseKey;

  if (licenseEnvRaw !== undefined && typeof licenseEnvRaw !== "string") {
    throw new ConfigError(`"${CLOUD_DRIVE_PLUGIN_NAME}.license_env" must be a string.`);
  }
  if (licenseKeyRaw !== undefined && typeof licenseKeyRaw !== "string") {
    throw new ConfigError(`"${CLOUD_DRIVE_PLUGIN_NAME}.license_key" must be a string.`);
  }

  return {
    licenseEnv: licenseEnvRaw?.trim() || DEFAULT_LICENSE_ENV,
    ...(licenseKeyRaw?.trim() ? { licenseKey: licenseKeyRaw.trim() } : {}),
  };
}

export function licenseMissingMessage(
  licenseEnv: string,
  failure?: Pick<LicenseVerificationFailure, "reason" | "detail">,
): string {
  return formatLicenseFailureMessage({
    label: "Cloud Drive Connectors",
    pluginId: CLOUD_DRIVE_PLUGIN_NAME,
    licenseEnv,
    reason: failure?.reason,
    detail: failure?.detail,
  });
}

export function verifyCloudDriveLicense(
  settings: CloudDriveSettings,
  env: NodeJS.ProcessEnv = process.env,
  options: CloudDriveLicenseCheckOptions = {},
): LicenseVerificationResult {
  return resolveAndVerifyPluginLicense({
    pluginId: CLOUD_DRIVE_PLUGIN_NAME,
    testSentinel: CLOUD_DRIVE_TEST_LICENSE_SENTINEL,
    licenseKey: settings.licenseKey,
    licenseEnv: settings.licenseEnv,
    env,
    ...options,
  });
}

export function assertCloudDriveLicense(
  settings: CloudDriveSettings,
  env: NodeJS.ProcessEnv = process.env,
  options: CloudDriveLicenseCheckOptions = {},
): void {
  const result = verifyCloudDriveLicense(settings, env, options);
  if (!result.valid) {
    throw new ConfigError(licenseMissingMessage(settings.licenseEnv, result));
  }
}
