import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import {
  ConfigError,
  createPluginHost,
  type McpAuthResult,
} from "@hoanghainh/knot-sync-core";
import {
  AUTH_OAUTH_PLUGIN_NAME,
  OAUTH_TEST_LICENSE_SENTINEL,
  authorizeResourceScope,
  authorizeToolScope,
  createAuthOauthPlugin,
  createOauthAuthProvider,
  issueLocalAccessToken,
  parseAuthOauthSettings,
  requireSigningSecret,
  verifyLocalAccessToken,
  verifyJwksAccessToken,
} from "./index.js";

test("parseAuthOauthSettings rejects unknown keys", () => {
  assert.throws(
    () => parseAuthOauthSettings({ bogus: true }),
    (err: unknown) => err instanceof ConfigError && /Unknown key "bogus"/.test(String(err)),
  );
  const d = parseAuthOauthSettings({ licenseKey: OAUTH_TEST_LICENSE_SENTINEL });
  assert.equal(d.licenseKey, OAUTH_TEST_LICENSE_SENTINEL);
  assert.equal(d.tokenPath, "/oauth/token");
});

test("plugin registers mcp-auth only when loaded; free host has none", () => {
  const free = createPluginHost();
  assert.equal(free.mcpAuthProvider, undefined);

  const paid = createPluginHost({
    pluginSettings: {
      [AUTH_OAUTH_PLUGIN_NAME]: { licenseKey: OAUTH_TEST_LICENSE_SENTINEL },
    },
  });
  paid.registerPlugin(
    createAuthOauthPlugin({
      settings: { licenseKey: OAUTH_TEST_LICENSE_SENTINEL },
      env: {
        KNOT_SYNC_OAUTH_SIGNING_SECRET: "test-signing-secret-32chars-min!!",
      },
    }),
  );
  assert.ok(paid.mcpAuthProvider);
  assert.equal(paid.mcpAuthProvider?.id, "auth-oauth");
  assert.ok(paid.loaded.some((p) => p.name === AUTH_OAUTH_PLUGIN_NAME));
  assert.ok(
    paid.loaded.some((p) => p.extensions.some((e) => e.point === "mcp-auth")),
  );
});

test("scope helpers for tools and Japanese resource URIs", () => {
  assert.equal(authorizeToolScope(["tool:search_documents"], "search_documents"), true);
  assert.equal(authorizeToolScope(["tool:search_documents"], "query_table"), false);
  assert.equal(authorizeToolScope(["tool:*"], "query_table"), true);

  const uri = "knot://docs/erp/%E7%B5%8C%E7%90%86";
  assert.equal(authorizeResourceScope(["resource:*"], uri), true);
  assert.equal(authorizeResourceScope(["resource:knot://docs/*"], uri), true);
  assert.equal(authorizeResourceScope(["resource:knot://db/*"], uri), false);
});

test("local AS issues and verifies JWT; scopes enforced", async () => {
  const settings = parseAuthOauthSettings({
    licenseKey: OAUTH_TEST_LICENSE_SENTINEL,
    defaultScopes: ["tool:search_documents"],
  });
  const env = {
    KNOT_SYNC_OAUTH_SIGNING_SECRET: "local-as-secret-for-tests-xxxxxx",
    KNOT_SYNC_OAUTH_CLIENT_ID: "agent-a",
    KNOT_SYNC_OAUTH_CLIENT_SECRET: "agent-secret",
  };
  const secret = requireSigningSecret(settings, env);
  const issued = await issueLocalAccessToken({
    settings,
    subject: "agent-a",
    scopes: ["tool:search_documents"],
    secret,
  });
  const verified = await verifyLocalAccessToken({
    settings,
    token: issued.accessToken,
    secret,
  });
  assert.equal(verified.subject, "agent-a");
  assert.deepEqual(verified.scopes, ["tool:search_documents"]);

  const provider = createOauthAuthProvider({ settings, env });
  const auth = await provider.authenticate(`Bearer ${issued.accessToken}`);
  assert.equal(auth.ok, true);
  if (!auth.ok) return;
  assert.equal(provider.authorizeTool("search_documents", auth), true);
  assert.equal(provider.authorizeTool("query_table", auth), false);
  assert.equal(
    provider.authorizeResource("knot://docs/erp/経理/請求書", auth),
    false,
  );
});

test("API key is not accepted by oauth provider (serveHttp owns fallback)", async () => {
  const settings = parseAuthOauthSettings({ licenseKey: OAUTH_TEST_LICENSE_SENTINEL });
  const env = {
    KNOT_SYNC_API_KEY: "shared-ops-key",
    KNOT_SYNC_OAUTH_SIGNING_SECRET: "local-as-secret-for-tests-xxxxxx",
  };
  const provider = createOauthAuthProvider({ settings, env });
  // Opaque API key is not a JWT — provider must reject; serveHttp still accepts via resolveAuth.
  const auth = await provider.authenticate("Bearer shared-ops-key");
  assert.equal(auth.ok, false);
  // Full-access scopes still work when serveHttp classifies via=apiKey.
  assert.equal(
    provider.authorizeTool("query_table", {
      ok: true,
      subject: "api-key",
      scopes: ["tool:*", "resource:*"],
      via: "apiKey",
    }),
    true,
  );
});

test("unlicensed provider rejects OAuth tokens", async () => {
  const settings = parseAuthOauthSettings({});
  const env = { KNOT_SYNC_OAUTH_SIGNING_SECRET: "local-as-secret-for-tests-xxxxxx" };
  const secret = requireSigningSecret(settings, env);
  const issued = await issueLocalAccessToken({
    settings,
    subject: "x",
    scopes: ["tool:*"],
    secret,
  });
  const provider = createOauthAuthProvider({ settings, env, requireLicense: true });
  const auth = await provider.authenticate(`Bearer ${issued.accessToken}`);
  assert.equal(auth.ok, false);
});

test("token endpoint issues client_credentials token", async () => {
  const settings = parseAuthOauthSettings({
    licenseKey: OAUTH_TEST_LICENSE_SENTINEL,
    defaultScopes: ["tool:search_documents", "resource:knot://docs/*"],
  });
  const env = {
    KNOT_SYNC_OAUTH_SIGNING_SECRET: "local-as-secret-for-tests-xxxxxx",
    KNOT_SYNC_OAUTH_CLIENT_ID: "agent-a",
    KNOT_SYNC_OAUTH_CLIENT_SECRET: "agent-secret",
  };
  const provider = createOauthAuthProvider({ settings, env });

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    void provider.handleHttp?.(req, res, url);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  assert.ok(addr && typeof addr === "object");
  const port = addr.port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/oauth/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "grant_type=client_credentials&client_id=agent-a&client_secret=agent-secret&scope=tool%3Asearch_documents",
    });
    assert.equal(res.status, 200);
    const json = (await res.json()) as {
      access_token: string;
      token_type: string;
      scope: string;
    };
    assert.equal(json.token_type, "Bearer");
    assert.match(json.scope, /tool:search_documents/);
    assert.ok(json.access_token.length > 20);

    const auth = (await provider.authenticate(
      `Bearer ${json.access_token}`,
    )) as Extract<McpAuthResult, { ok: true }>;
    assert.equal(auth.ok, true);
    assert.equal(auth.via, "oauth");

    const escalate = await fetch(`http://127.0.0.1:${port}/oauth/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "grant_type=client_credentials&client_id=agent-a&client_secret=agent-secret&scope=tool%3A*",
    });
    assert.equal(escalate.status, 400);
    const errBody = (await escalate.json()) as { error: string };
    assert.equal(errBody.error, "invalid_scope");
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  }
});

test("JWKS validation accepts injected key set", async () => {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const jwk = await exportJWK(publicKey);
  jwk.alg = "RS256";
  jwk.kid = "test-kid";
  const getKey = createLocalJWKSet({ keys: [jwk] });

  const settings = parseAuthOauthSettings({
    licenseKey: OAUTH_TEST_LICENSE_SENTINEL,
    jwksUrl: "https://idp.example.local/jwks",
    issuer: "https://idp.example.local/",
    audience: "knot-sync-mcp",
  });

  const token = await new SignJWT({ scope: "tool:query_table resource:*" })
    .setProtectedHeader({ alg: "RS256", kid: "test-kid" })
    .setSubject("vn-client")
    .setIssuer(settings.issuer)
    .setAudience(settings.audience)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(privateKey);

  const verified = await verifyJwksAccessToken({ settings, token, getKey });
  assert.equal(verified.subject, "vn-client");
  assert.ok(verified.scopes.includes("tool:query_table"));

  const provider = createOauthAuthProvider({
    settings,
    env: {},
    jwksGetKey: getKey,
  });
  const auth = await provider.authenticate(`Bearer ${token}`);
  assert.equal(auth.ok, true);
  if (!auth.ok) return;
  assert.equal(provider.authorizeTool("query_table", auth), true);
  assert.equal(provider.authorizeTool("search_documents", auth), false);

  await assert.rejects(
    () =>
      verifyJwksAccessToken({
        settings,
        token: token.slice(0, -4) + "dead",
        getKey,
      }),
    /JWKS token validation failed/,
  );
});
