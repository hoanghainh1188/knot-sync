export const AUTH_OAUTH_PLUGIN_NAME = "auth-oauth";

export const DEFAULT_LICENSE_ENV = "KNOT_SYNC_OAUTH_LICENSE";

/** Accepted only in tests / local smoke — not a production key. */
export const OAUTH_TEST_LICENSE_SENTINEL = "knot-sync-oauth-dev";

export const DEFAULT_ISSUER = "knot-sync-local";
export const DEFAULT_AUDIENCE = "knot-sync-mcp";
export const DEFAULT_TOKEN_TTL_SECONDS = 3600;
export const DEFAULT_TOKEN_PATH = "/oauth/token";

/** Env for HS256 signing secret (local AS). */
export const DEFAULT_SIGNING_SECRET_ENV = "KNOT_SYNC_OAUTH_SIGNING_SECRET";

/** Env for client id (local AS client-credentials). */
export const DEFAULT_CLIENT_ID_ENV = "KNOT_SYNC_OAUTH_CLIENT_ID";

/** Env for client secret (local AS client-credentials). */
export const DEFAULT_CLIENT_SECRET_ENV = "KNOT_SYNC_OAUTH_CLIENT_SECRET";
