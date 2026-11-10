import type { IncomingMessage, ServerResponse } from "node:http";
import { timingSafeEqual } from "node:crypto";
import type { McpAuthProvider, McpAuthResult } from "@hoanghainh/knot-sync-core";
import { issueLocalAccessToken, requireSigningSecret, verifyLocalAccessToken } from "./jwt-local.js";
import { verifyJwksAccessToken, type JwksFetcher } from "./jwks.js";
import { assertOauthLicense, resolveOauthLicense } from "./license.js";
import {
  authorizeResourceScope,
  authorizeToolScope,
  intersectAllowedScopes,
  parseScopeString,
} from "./scopes.js";
import type { AuthOauthSettings } from "./settings.js";

/** Must match mcp-server API_KEY_ENV — shared Bearer fallback. */
export const SHARED_API_KEY_ENV = "KNOT_SYNC_API_KEY";

export interface CreateOauthAuthProviderOptions {
  settings: AuthOauthSettings;
  env?: NodeJS.ProcessEnv;
  /** Inject JWKS key resolver for tests. */
  jwksGetKey?: import("jose").JWTVerifyGetKey;
  fetchJwks?: JwksFetcher;
  /** When false, skip license gate (tests that already asserted). */
  requireLicense?: boolean;
}

/** Constant-time compare; pads to max length so byte-length is not an oracle. */
function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  const len = Math.max(ba.length, bb.length, 1);
  const pa = Buffer.alloc(len);
  const pb = Buffer.alloc(len);
  ba.copy(pa);
  bb.copy(pb);
  const lengthsMatch = ba.length === bb.length;
  return timingSafeEqual(pa, pb) && lengthsMatch;
}

const MAX_TOKEN_BODY_BYTES = 16_384;

function sendJson(res: ServerResponse, status: number, body: Record<string, unknown>): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json",
    "cache-control": "no-store",
    pragma: "no-cache",
    "content-length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

async function readBody(req: IncomingMessage, maxBytes: number): Promise<string> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buf.length;
    if (total > maxBytes) {
      req.destroy();
      throw new Error("request_body_too_large");
    }
    chunks.push(buf);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function parseFormOrJson(raw: string, contentType: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (contentType?.includes("application/json")) {
    try {
      const obj = JSON.parse(raw) as Record<string, unknown>;
      for (const [k, v] of Object.entries(obj)) {
        if (typeof v === "string") out[k] = v;
      }
    } catch {
      // leave empty
    }
    return out;
  }
  try {
    const params = new URLSearchParams(raw);
    for (const [k, v] of params.entries()) {
      out[k] = v;
    }
  } catch {
    // leave empty
  }
  return out;
}

export function createOauthAuthProvider(
  options: CreateOauthAuthProviderOptions,
): McpAuthProvider {
  const settings = options.settings;
  const env = options.env ?? process.env;
  const requireLicense = options.requireLicense !== false;

  function ensureLicensed(): void {
    if (requireLicense) assertOauthLicense(settings, env);
  }

  return {
    id: "auth-oauth",

    async authenticate(authorizationHeader): Promise<McpAuthResult> {
      if (!resolveOauthLicense(settings, env)) {
        return { ok: false, message: "oauth_unlicensed" };
      }

      const match = authorizationHeader
        ? /^Bearer\s+(\S+)\s*$/i.exec(authorizationHeader)
        : null;
      const token = match?.[1];
      if (!token) return { ok: false };

      // API key fallback is handled by serveHttp (single source of truth for options.apiKey).

      try {
        if (settings.jwksUrl) {
          const verified = await verifyJwksAccessToken({
            settings,
            token,
            getKey: options.jwksGetKey,
            fetchJwks: options.fetchJwks,
          });
          // Empty scope claims mean no access — never inflate to defaultScopes on verify.
          if (verified.scopes.length === 0) {
            return { ok: false, message: "missing_scope" };
          }
          return {
            ok: true,
            subject: verified.subject,
            scopes: verified.scopes,
            via: "oauth",
          };
        }

        const secret = requireSigningSecret(settings, env);
        const verified = await verifyLocalAccessToken({ settings, token, secret });
        if (verified.scopes.length === 0) {
          return { ok: false, message: "missing_scope" };
        }
        return {
          ok: true,
          subject: verified.subject,
          scopes: verified.scopes,
          via: "oauth",
        };
      } catch {
        return { ok: false, message: "invalid_token" };
      }
    },

    authorizeTool(toolId, auth) {
      return authorizeToolScope(auth.scopes, toolId);
    },

    authorizeResource(uri, auth) {
      return authorizeResourceScope(auth.scopes, uri);
    },

    async handleHttp(req, res, url) {
      if (url.pathname !== settings.tokenPath) return false;
      try {
        ensureLicensed();
      } catch (err) {
        sendJson(res, 503, {
          error: "server_error",
          error_description: (err as Error).message,
        });
        return true;
      }

      if (req.method !== "POST") {
        res.writeHead(405, { allow: "POST" });
        res.end("Method Not Allowed");
        return true;
      }

      if (settings.jwksUrl) {
        sendJson(res, 400, {
          error: "unsupported_grant_type",
          error_description:
            "Local token issuance is disabled when jwksUrl is configured. " +
            "Obtain tokens from your on-prem IdP.",
        });
        return true;
      }

      let raw: string;
      try {
        raw = await readBody(req, MAX_TOKEN_BODY_BYTES);
      } catch (err) {
        if ((err as Error).message === "request_body_too_large") {
          sendJson(res, 413, {
            error: "invalid_request",
            error_description: "Request body too large.",
          });
          return true;
        }
        throw err;
      }
      const contentType = req.headers["content-type"];
      const body = parseFormOrJson(raw, typeof contentType === "string" ? contentType : undefined);
      const grantType = body.grant_type ?? "";
      if (grantType !== "client_credentials") {
        sendJson(res, 400, {
          error: "unsupported_grant_type",
          error_description: "Only grant_type=client_credentials is supported.",
        });
        return true;
      }

      const clientId = env[settings.clientIdEnv]?.trim() ?? "";
      const clientSecret = env[settings.clientSecretEnv]?.trim() ?? "";
      if (!clientId || !clientSecret) {
        sendJson(res, 500, {
          error: "server_error",
          error_description:
            `Set ${settings.clientIdEnv} and ${settings.clientSecretEnv} for the local AS.`,
        });
        return true;
      }

      const presentedId = body.client_id ?? "";
      const presentedSecret = body.client_secret ?? "";
      const authHeader = req.headers.authorization;
      let basicId = "";
      let basicSecret = "";
      if (typeof authHeader === "string" && authHeader.startsWith("Basic ")) {
        try {
          const decoded = Buffer.from(authHeader.slice(6), "base64").toString("utf8");
          const idx = decoded.indexOf(":");
          basicId = idx >= 0 ? decoded.slice(0, idx) : decoded;
          basicSecret = idx >= 0 ? decoded.slice(idx + 1) : "";
        } catch {
          // ignore
        }
      }
      const id = presentedId || basicId;
      const secret = presentedSecret || basicSecret;
      if (!safeEqual(id, clientId) || !safeEqual(secret, clientSecret)) {
        sendJson(res, 401, {
          error: "invalid_client",
          error_description: "Client authentication failed.",
        });
        return true;
      }

      let signingSecret: Uint8Array;
      try {
        signingSecret = requireSigningSecret(settings, env);
      } catch (err) {
        sendJson(res, 500, {
          error: "server_error",
          error_description: (err as Error).message,
        });
        return true;
      }

      const requested = parseScopeString(body.scope, settings.defaultScopes);
      const scopes = intersectAllowedScopes(requested, settings.defaultScopes);
      if (!scopes) {
        sendJson(res, 400, {
          error: "invalid_scope",
          error_description:
            "Requested scope is not allowed. Use only scopes listed in auth-oauth.defaultScopes.",
        });
        return true;
      }
      const issued = await issueLocalAccessToken({
        settings,
        subject: id,
        scopes,
        secret: signingSecret,
      });

      sendJson(res, 200, {
        access_token: issued.accessToken,
        token_type: issued.tokenType,
        expires_in: issued.expiresIn,
        scope: scopes.join(" "),
      });
      return true;
    },
  };
}
