import { SignJWT, jwtVerify } from "jose";
import type { AuthOauthSettings } from "./settings.js";

export function requireSigningSecret(
  settings: AuthOauthSettings,
  env: NodeJS.ProcessEnv = process.env,
): Uint8Array {
  const raw = env[settings.signingSecretEnv]?.trim();
  if (!raw) {
    throw new Error(
      `Environment variable "${settings.signingSecretEnv}" is missing or empty. ` +
        `Set a signing secret for the local OAuth AS, then retry.`,
    );
  }
  if (raw.length < 32) {
    throw new Error(
      `Environment variable "${settings.signingSecretEnv}" must be at least 32 characters. ` +
        `Use a longer random secret, then retry.`,
    );
  }
  return new TextEncoder().encode(raw);
}

export async function issueLocalAccessToken(options: {
  settings: AuthOauthSettings;
  subject: string;
  scopes: string[];
  secret: Uint8Array;
}): Promise<{ accessToken: string; expiresIn: number; tokenType: "Bearer" }> {
  const { settings, subject, scopes, secret } = options;
  const accessToken = await new SignJWT({
    scope: scopes.join(" "),
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(subject)
    .setIssuer(settings.issuer)
    .setAudience(settings.audience)
    .setIssuedAt()
    .setExpirationTime(`${settings.tokenTtlSeconds}s`)
    .sign(secret);

  return {
    accessToken,
    expiresIn: settings.tokenTtlSeconds,
    tokenType: "Bearer",
  };
}

export async function verifyLocalAccessToken(options: {
  settings: AuthOauthSettings;
  token: string;
  secret: Uint8Array;
}): Promise<{ subject: string; scopes: string[] }> {
  const { settings, token, secret } = options;
  const { payload } = await jwtVerify(token, secret, {
    issuer: settings.issuer,
    audience: settings.audience,
    algorithms: ["HS256"],
    requiredClaims: ["exp", "sub"],
    clockTolerance: 30,
  });
  const subject = typeof payload.sub === "string" ? payload.sub : "";
  if (!subject) {
    throw new Error("Access token is missing subject (sub).");
  }
  const scopeRaw = typeof payload.scope === "string" ? payload.scope : "";
  const scopes = scopeRaw
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return { subject, scopes };
}
