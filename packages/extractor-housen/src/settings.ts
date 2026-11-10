import { ConfigError } from "@hoanghainh/knot-sync-core";
import {
  DEFAULT_FORM_THRESHOLD,
  DEFAULT_LICENSE_ENV,
  DEFAULT_TIMEOUT_SECONDS,
} from "./constants.js";

export interface HousenSettings {
  timeoutSeconds: number;
  licenseEnv: string;
  licenseKey?: string;
  maxInputMb?: number;
  /** Form-likeness score in (0, 1]; sheets below this keep the office dump. */
  formThreshold: number;
}

const ALLOWED_KEYS = new Set([
  "timeoutSeconds",
  "licenseEnv",
  "licenseKey",
  "maxInputMb",
  "formThreshold",
]);

function positiveNumber(value: unknown, key: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new ConfigError(
      `"extractor-housen.${key}" must be a positive number (got ${JSON.stringify(value)}). ` +
        `Fix extractor-housen: in the config, then retry.`,
    );
  }
  return value;
}

function unitInterval(value: unknown, key: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value > 1) {
    throw new ConfigError(
      `"extractor-housen.${key}" must be a number in (0, 1] (got ${JSON.stringify(value)}). ` +
        `Fix extractor-housen: in the config, then retry.`,
    );
  }
  return value;
}

function nonEmptyString(value: unknown, key: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ConfigError(
      `"extractor-housen.${key}" must be a non-empty string (got ${JSON.stringify(value)}). ` +
        `Fix extractor-housen: in the config, then retry.`,
    );
  }
  return value.trim();
}

export function parseHousenSettings(raw: unknown): HousenSettings {
  if (raw === undefined || raw === null) {
    return {
      timeoutSeconds: DEFAULT_TIMEOUT_SECONDS,
      licenseEnv: DEFAULT_LICENSE_ENV,
      formThreshold: DEFAULT_FORM_THRESHOLD,
    };
  }
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new ConfigError(
      `"extractor-housen" settings must be a mapping of keys. ` +
        `Allowed: ${[...ALLOWED_KEYS].join(", ")}.`,
    );
  }

  const obj = raw as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    if (!ALLOWED_KEYS.has(key)) {
      throw new ConfigError(
        `Unknown key "${key}" under "extractor-housen". ` +
          `Allowed keys: ${[...ALLOWED_KEYS].join(", ")}.`,
      );
    }
  }

  const settings: HousenSettings = {
    timeoutSeconds:
      obj.timeoutSeconds === undefined
        ? DEFAULT_TIMEOUT_SECONDS
        : positiveNumber(obj.timeoutSeconds, "timeoutSeconds"),
    licenseEnv:
      obj.licenseEnv === undefined
        ? DEFAULT_LICENSE_ENV
        : nonEmptyString(obj.licenseEnv, "licenseEnv"),
    formThreshold:
      obj.formThreshold === undefined
        ? DEFAULT_FORM_THRESHOLD
        : unitInterval(obj.formThreshold, "formThreshold"),
  };

  if (obj.licenseKey !== undefined) {
    settings.licenseKey = nonEmptyString(obj.licenseKey, "licenseKey");
  }
  if (obj.maxInputMb !== undefined) {
    settings.maxInputMb = positiveNumber(obj.maxInputMb, "maxInputMb");
  }

  return settings;
}
