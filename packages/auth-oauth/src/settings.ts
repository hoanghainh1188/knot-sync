import { ConfigError } from "@hoanghainh/knot-sync-core";
import {
  AUTH_OAUTH_PLUGIN_NAME,
  DEFAULT_AUDIENCE,
  DEFAULT_CLIENT_ID_ENV,
  DEFAULT_CLIENT_SECRET_ENV,
  DEFAULT_ISSUER,
  DEFAULT_LICENSE_ENV,
  DEFAULT_SIGNING_SECRET_ENV,
  DEFAULT_TOKEN_PATH,
  DEFAULT_TOKEN_TTL_SECONDS,
} from "./constants.js";

export interface AuthOauthSettings {
  licenseEnv: string;
  licenseKey?: string;
  /** When set, validate JWTs against this JWKS URL (on-prem IdP). */
  jwksUrl?: string;
  issuer: string;
  audience: string;
  tokenTtlSeconds: number;
  tokenPath: string;
  signingSecretEnv: string;
  clientIdEnv: string;
  clientSecretEnv: string;
  /** Default scopes granted on local token issue when request omits scope. */
  defaultScopes: string[];
}

const ALLOWED_KEYS = new Set([
  "licenseEnv",
  "licenseKey",
  "jwksUrl",
  "issuer",
  "audience",
  "tokenTtlSeconds",
  "tokenPath",
  "signingSecretEnv",
  "clientIdEnv",
  "clientSecretEnv",
  "defaultScopes",
]);

function nonEmptyString(value: unknown, key: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ConfigError(
      `"${AUTH_OAUTH_PLUGIN_NAME}.${key}" must be a non-empty string (got ${JSON.stringify(value)}). ` +
        `Fix ${AUTH_OAUTH_PLUGIN_NAME}: in the config, then retry.`,
    );
  }
  return value.trim();
}

function positiveInt(value: unknown, key: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new ConfigError(
      `"${AUTH_OAUTH_PLUGIN_NAME}.${key}" must be a positive integer (got ${JSON.stringify(value)}). ` +
        `Fix ${AUTH_OAUTH_PLUGIN_NAME}: in the config, then retry.`,
    );
  }
  return value;
}

export function parseAuthOauthSettings(raw: unknown): AuthOauthSettings {
  if (raw === undefined || raw === null) {
    return {
      licenseEnv: DEFAULT_LICENSE_ENV,
      issuer: DEFAULT_ISSUER,
      audience: DEFAULT_AUDIENCE,
      tokenTtlSeconds: DEFAULT_TOKEN_TTL_SECONDS,
      tokenPath: DEFAULT_TOKEN_PATH,
      signingSecretEnv: DEFAULT_SIGNING_SECRET_ENV,
      clientIdEnv: DEFAULT_CLIENT_ID_ENV,
      clientSecretEnv: DEFAULT_CLIENT_SECRET_ENV,
      defaultScopes: ["tool:*", "resource:*"],
    };
  }
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new ConfigError(
      `"${AUTH_OAUTH_PLUGIN_NAME}" settings must be a mapping of keys. ` +
        `Allowed: ${[...ALLOWED_KEYS].join(", ")}.`,
    );
  }

  const obj = raw as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    if (!ALLOWED_KEYS.has(key)) {
      throw new ConfigError(
        `Unknown key "${key}" under "${AUTH_OAUTH_PLUGIN_NAME}". ` +
          `Allowed keys: ${[...ALLOWED_KEYS].join(", ")}.`,
      );
    }
  }

  const settings: AuthOauthSettings = {
    licenseEnv:
      obj.licenseEnv === undefined
        ? DEFAULT_LICENSE_ENV
        : nonEmptyString(obj.licenseEnv, "licenseEnv"),
    issuer: obj.issuer === undefined ? DEFAULT_ISSUER : nonEmptyString(obj.issuer, "issuer"),
    audience:
      obj.audience === undefined ? DEFAULT_AUDIENCE : nonEmptyString(obj.audience, "audience"),
    tokenTtlSeconds:
      obj.tokenTtlSeconds === undefined
        ? DEFAULT_TOKEN_TTL_SECONDS
        : positiveInt(obj.tokenTtlSeconds, "tokenTtlSeconds"),
    tokenPath:
      obj.tokenPath === undefined ? DEFAULT_TOKEN_PATH : nonEmptyString(obj.tokenPath, "tokenPath"),
    signingSecretEnv:
      obj.signingSecretEnv === undefined
        ? DEFAULT_SIGNING_SECRET_ENV
        : nonEmptyString(obj.signingSecretEnv, "signingSecretEnv"),
    clientIdEnv:
      obj.clientIdEnv === undefined
        ? DEFAULT_CLIENT_ID_ENV
        : nonEmptyString(obj.clientIdEnv, "clientIdEnv"),
    clientSecretEnv:
      obj.clientSecretEnv === undefined
        ? DEFAULT_CLIENT_SECRET_ENV
        : nonEmptyString(obj.clientSecretEnv, "clientSecretEnv"),
    defaultScopes: ["tool:*", "resource:*"],
  };

  if (obj.licenseKey !== undefined) {
    settings.licenseKey = nonEmptyString(obj.licenseKey, "licenseKey");
  }
  if (obj.jwksUrl !== undefined) {
    settings.jwksUrl = nonEmptyString(obj.jwksUrl, "jwksUrl");
  }
  if (obj.defaultScopes !== undefined) {
    if (
      !Array.isArray(obj.defaultScopes) ||
      obj.defaultScopes.length === 0 ||
      obj.defaultScopes.some((s) => typeof s !== "string" || s.trim() === "")
    ) {
      throw new ConfigError(
        `"${AUTH_OAUTH_PLUGIN_NAME}.defaultScopes" must be a non-empty list of non-empty strings.`,
      );
    }
    settings.defaultScopes = (obj.defaultScopes as string[]).map((s) => s.trim());
  }

  return settings;
}
