import type { ExtractResult } from "@hoanghainh/knot-sync-core";
import {
  formatLicenseFailureMessage,
  resolveAndVerifyPluginLicense,
  type LicenseVerificationFailure,
  type ResolvePluginLicenseOptions,
} from "@hoanghainh/knot-sync-plugin-license";
import {
  HOUSEN_PLUGIN_NAME,
  HOUSEN_TEST_LICENSE_SENTINEL,
} from "./constants.js";
import type { HousenSettings } from "./settings.js";

export type HousenLicenseCheckOptions = Pick<
  ResolvePluginLicenseOptions,
  "publicKey" | "nowMs" | "allowTestSentinel"
>;

function failLicense(
  relPath: string,
  licenseEnv: string,
  failure: Pick<LicenseVerificationFailure, "reason" | "detail">,
): ExtractResult {
  return {
    ok: false,
    code: "LICENSE",
    message: formatLicenseFailureMessage({
      label: "Housen Excel",
      pluginId: HOUSEN_PLUGIN_NAME,
      licenseEnv,
      reason: failure.reason,
      detail: failure.detail,
      relPath,
      suffix: 'then retry "knot-sync run".',
    }),
  };
}

export function isValidHousenLicense(
  value: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
  options: HousenLicenseCheckOptions = {},
): boolean {
  if (!value?.trim()) return false;
  return resolveAndVerifyPluginLicense({
    pluginId: HOUSEN_PLUGIN_NAME,
    testSentinel: HOUSEN_TEST_LICENSE_SENTINEL,
    licenseKey: value,
    licenseEnv: "",
    env,
    ...options,
  }).valid;
}

export function checkHousenLicense(
  settings: HousenSettings,
  relPath: string,
  env: NodeJS.ProcessEnv = process.env,
  options: HousenLicenseCheckOptions = {},
): ExtractResult | undefined {
  const res = resolveAndVerifyPluginLicense({
    pluginId: HOUSEN_PLUGIN_NAME,
    testSentinel: HOUSEN_TEST_LICENSE_SENTINEL,
    licenseKey: settings.licenseKey,
    licenseEnv: settings.licenseEnv,
    env,
    ...options,
  });
  if (!res.valid) {
    return failLicense(relPath, settings.licenseEnv, res);
  }
  return undefined;
}
