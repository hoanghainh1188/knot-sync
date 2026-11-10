import type { ExtractResult } from "@hoanghainh/knot-sync-core";
import { OCR_TEST_LICENSE_SENTINEL } from "./constants.js";
import type { OcrSettings } from "./settings.js";

function failLicense(relPath: string, licenseEnv: string): ExtractResult {
  return {
    ok: false,
    code: "LICENSE",
    message:
      `OCR license missing or invalid for "${relPath}". ` +
      `Set ${licenseEnv} or extractor-ocr.licenseKey (tests may use ${OCR_TEST_LICENSE_SENTINEL}), ` +
      `then retry "knot-sync run".`,
  };
}

/** True when the value is a non-empty license string (including the test sentinel). */
export function isValidOcrLicense(value: string | undefined): boolean {
  if (value === undefined) return false;
  return value.trim() !== "";
}

/**
 * Resolve license from settings.licenseKey or process env (settings.licenseEnv).
 * Missing/invalid → soft-fail LICENSE (does not throw).
 */
export function checkOcrLicense(
  settings: OcrSettings,
  relPath: string,
  env: NodeJS.ProcessEnv = process.env,
): ExtractResult | undefined {
  const fromKey = settings.licenseKey?.trim();
  const fromEnv = env[settings.licenseEnv]?.trim();
  const value = fromKey || fromEnv;
  if (!isValidOcrLicense(value)) {
    return failLicense(relPath, settings.licenseEnv);
  }
  return undefined;
}
