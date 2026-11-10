import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import type { AuthOauthSettings } from "./settings.js";

export type JwksFetcher = (url: string) => JWTVerifyGetKey;

const defaultFetcher: JwksFetcher = (url) =>
  createRemoteJWKSet(new URL(url), {
    cooldownDuration: 30_000,
    timeoutDuration: 5_000,
  });

/** Cache remote JWKS resolvers per URL so authenticate() does not refetch every request. */
const remoteJwksCache = new Map<string, JWTVerifyGetKey>();

function getRemoteJwks(
  url: string,
  fetchJwks: JwksFetcher = defaultFetcher,
): JWTVerifyGetKey {
  let key = remoteJwksCache.get(url);
  if (!key) {
    key = fetchJwks(url);
    remoteJwksCache.set(url, key);
  }
  return key;
}

/** Test helper — clear memoized JWKS clients. */
export function clearRemoteJwksCache(): void {
  remoteJwksCache.clear();
}

/**
 * Verify a JWT against a remote JWKS (on-prem IdP).
 * `jwksGetKey` may be injected in tests to avoid network.
 */
export async function verifyJwksAccessToken(options: {
  settings: AuthOauthSettings;
  token: string;
  getKey?: JWTVerifyGetKey;
  fetchJwks?: JwksFetcher;
}): Promise<{ subject: string; scopes: string[] }> {
  const { settings, token } = options;
  if (!settings.jwksUrl) {
    throw new Error("JWKS URL is not configured.");
  }
  const getKey =
    options.getKey ?? getRemoteJwks(settings.jwksUrl, options.fetchJwks ?? defaultFetcher);

  try {
    const { payload } = await jwtVerify(token, getKey, {
      issuer: settings.issuer,
      audience: settings.audience,
      algorithms: ["RS256", "PS256", "ES256", "EdDSA"],
      requiredClaims: ["exp", "sub"],
      clockTolerance: 30,
    });
    const subject = typeof payload.sub === "string" ? payload.sub : "";
    if (!subject) {
      throw new Error("Access token is missing subject (sub).");
    }
    const scopeRaw =
      typeof payload.scope === "string"
        ? payload.scope
        : Array.isArray(payload.scp)
          ? (payload.scp as unknown[]).filter((x) => typeof x === "string").join(" ")
          : "";
    const scopes = scopeRaw
      .split(/\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
    return { subject, scopes };
  } catch (err) {
    throw new Error(
      `JWKS token validation failed: ${(err as Error).message}. ` +
        `Check issuer/audience/JWKS at ${settings.jwksUrl}, then retry.`,
    );
  }
}
