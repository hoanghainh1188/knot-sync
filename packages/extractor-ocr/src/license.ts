import type { ExtractResult } from "@hoanghainh/knot-sync-core";
import {
  formatLicenseFailureMessage,
  resolveAndVerifyPluginLicense,
  type LicenseVerificationFailure,
  type ResolvePluginLicenseOptions,
} from "@hoanghainh/knot-sync-plugin-license";
import { OCR_PLUGIN_NAME, OCR_TEST_LICENSE_SENTINEL } from "./constants.js";
import type { OcrSettings } from "./settings.js";

export type OcrLicenseCheckOptions = Pick<
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
      label: "OCR",
      pluginId: OCR_PLUGIN_NAME,
      licenseEnv,
      reason: failure.reason,
      detail: failure.detail,
      relPath,
      suffix: 'then retry "knot-sync run".',
    }),
  };
}

/** True when value is a verified Ed25519 KS1 token or an enabled test sentinel. */
export function isValidOcrLicense(
  value: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
  options: OcrLicenseCheckOptions = {},
): boolean {
  if (!value?.trim()) return false;
  return resolveAndVerifyPluginLicense({
    pluginId: OCR_PLUGIN_NAME,
    testSentinel: OCR_TEST_LICENSE_SENTINEL,
    licenseKey: value,
    licenseEnv: "",
    env,
    ...options,
  }).valid;
}

/**
 * Resolve license from settings.licenseKey or process env (settings.licenseEnv).
 * Missing/invalid -> soft-fail LICENSE (does not throw).
 */
export function checkOcrLicense(
  settings: OcrSettings,
  relPath: string,
  env: NodeJS.ProcessEnv = process.env,
  options: OcrLicenseCheckOptions = {},
): ExtractResult | undefined {
  const res = resolveAndVerifyPluginLicense({
    pluginId: OCR_PLUGIN_NAME,
    testSentinel: OCR_TEST_LICENSE_SENTINEL,
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
