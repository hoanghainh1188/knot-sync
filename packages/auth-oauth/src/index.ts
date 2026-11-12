import { createAuthOauthPlugin } from "./plugin.js";

export {
  AUTH_OAUTH_PLUGIN_NAME,
  DEFAULT_LICENSE_ENV,
  OAUTH_TEST_LICENSE_SENTINEL,
  DEFAULT_ISSUER,
  DEFAULT_AUDIENCE,
  DEFAULT_TOKEN_PATH,
  DEFAULT_SIGNING_SECRET_ENV,
  DEFAULT_CLIENT_ID_ENV,
  DEFAULT_CLIENT_SECRET_ENV,
} from "./constants.js";
export { parseAuthOauthSettings, type AuthOauthSettings } from "./settings.js";
export {
  assertOauthLicense,
  isValidOauthLicense,
  licenseMissingMessage,
  resolveOauthLicense,
  verifyOauthLicense,
  type OauthLicenseCheckOptions,
} from "./license.js";
export {
  authorizeToolScope,
  authorizeResourceScope,
  parseScopeString,
} from "./scopes.js";
export {
  issueLocalAccessToken,
  requireSigningSecret,
  verifyLocalAccessToken,
} from "./jwt-local.js";
export { verifyJwksAccessToken } from "./jwks.js";
export {
  createOauthAuthProvider,
  SHARED_API_KEY_ENV,
  type CreateOauthAuthProviderOptions,
} from "./provider.js";
export {
  createAuthOauthPlugin,
  type CreateAuthOauthPluginOptions,
} from "./plugin.js";

export default createAuthOauthPlugin();
