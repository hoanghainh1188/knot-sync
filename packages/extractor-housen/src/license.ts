import type { ExtractResult } from "@hoanghainh/knot-sync-core";
import { HOUSEN_TEST_LICENSE_SENTINEL } from "./constants.js";
import type { HousenSettings } from "./settings.js";

function failLicense(relPath: string, licenseEnv: string): ExtractResult {
  return {
    ok: false,
    code: "LICENSE",
    message:
      `Housen Excel license missing or invalid for "${relPath}". ` +
      `Set ${licenseEnv} or extractor-housen.licenseKey (tests may use ${HOUSEN_TEST_LICENSE_SENTINEL}), ` +
      `then retry "knot-sync run".`,
  };
}

export function isValidHousenLicense(value: string | undefined): boolean {
  if (value === undefined) return false;
  return value.trim() !== "";
}

export function checkHousenLicense(
  settings: HousenSettings,
  relPath: string,
  env: NodeJS.ProcessEnv = process.env,
): ExtractResult | undefined {
  const fromKey = settings.licenseKey?.trim();
  const fromEnv = env[settings.licenseEnv]?.trim();
  const value = fromKey || fromEnv;
  if (!isValidHousenLicense(value)) {
    return failLicense(relPath, settings.licenseEnv);
  }
  return undefined;
}
