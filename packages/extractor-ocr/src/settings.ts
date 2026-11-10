import { ConfigError } from "@hoanghainh/knot-sync-core";
import {
  DEFAULT_DOCLING_IMAGE,
  DEFAULT_LICENSE_ENV,
  DEFAULT_TIMEOUT_SECONDS,
} from "./constants.js";

export interface OcrSettings {
  image: string;
  timeoutSeconds: number;
  licenseEnv: string;
  /** Inline license; prefer env in production. */
  licenseKey?: string;
  /** Soft-fail when file.size exceeds this many MiB (optional). */
  maxInputMb?: number;
}

const ALLOWED_KEYS = new Set([
  "image",
  "timeoutSeconds",
  "licenseEnv",
  "licenseKey",
  "maxInputMb",
]);

function positiveNumber(value: unknown, key: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new ConfigError(
      `"extractor-ocr.${key}" must be a positive number (got ${JSON.stringify(value)}). ` +
        `Fix extractor-ocr: in the config, then retry.`,
    );
  }
  return value;
}

function nonEmptyString(value: unknown, key: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ConfigError(
      `"extractor-ocr.${key}" must be a non-empty string (got ${JSON.stringify(value)}). ` +
        `Fix extractor-ocr: in the config, then retry.`,
    );
  }
  return value.trim();
}

/**
 * Parse opaque plugin settings for extractor-ocr.
 * Unknown keys and non-positive timeouts fail load with actionable guidance.
 */
export function parseOcrSettings(raw: unknown): OcrSettings {
  if (raw === undefined || raw === null) {
    return {
      image: DEFAULT_DOCLING_IMAGE,
      timeoutSeconds: DEFAULT_TIMEOUT_SECONDS,
      licenseEnv: DEFAULT_LICENSE_ENV,
    };
  }
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new ConfigError(
      `"extractor-ocr" settings must be a mapping of keys. ` +
        `Allowed: ${[...ALLOWED_KEYS].join(", ")}.`,
    );
  }

  const obj = raw as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    if (!ALLOWED_KEYS.has(key)) {
      throw new ConfigError(
        `Unknown key "${key}" under "extractor-ocr". ` +
          `Allowed keys: ${[...ALLOWED_KEYS].join(", ")}.`,
      );
    }
  }

  const settings: OcrSettings = {
    image:
      obj.image === undefined
        ? DEFAULT_DOCLING_IMAGE
        : nonEmptyString(obj.image, "image"),
    timeoutSeconds:
      obj.timeoutSeconds === undefined
        ? DEFAULT_TIMEOUT_SECONDS
        : positiveNumber(obj.timeoutSeconds, "timeoutSeconds"),
    licenseEnv:
      obj.licenseEnv === undefined
        ? DEFAULT_LICENSE_ENV
        : nonEmptyString(obj.licenseEnv, "licenseEnv"),
  };

  if (obj.licenseKey !== undefined) {
    settings.licenseKey = nonEmptyString(obj.licenseKey, "licenseKey");
  }
  if (obj.maxInputMb !== undefined) {
    settings.maxInputMb = positiveNumber(obj.maxInputMb, "maxInputMb");
  }

  return settings;
}
