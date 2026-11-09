import { timingSafeEqual } from "node:crypto";

/** Environment variable that holds the shared HTTP MCP API key. */
export const API_KEY_ENV = "KNOT_SYNC_API_KEY";

/** Read a non-empty API key from the environment, or undefined. */
export function readApiKeyFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const raw = env[API_KEY_ENV];
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  return trimmed === "" ? undefined : trimmed;
}

/**
 * Validate `Authorization: Bearer <token>` against the expected API key.
 * Uses constant-time comparison when lengths match.
 */
export function checkBearerAuth(
  authorizationHeader: string | undefined,
  expectedKey: string,
): boolean {
  if (!authorizationHeader || expectedKey === "") return false;
  const match = /^Bearer\s+(\S+)\s*$/i.exec(authorizationHeader);
  if (!match) return false;
  const token = match[1]!;
  const a = Buffer.from(token, "utf8");
  const b = Buffer.from(expectedKey, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Actionable error when HTTP serve starts without KNOT_SYNC_API_KEY. */
export function missingApiKeyMessage(): string {
  return (
    `Environment variable "${API_KEY_ENV}" is missing or empty. ` +
    `Set it to a shared secret, then retry: export ${API_KEY_ENV}=…`
  );
}
