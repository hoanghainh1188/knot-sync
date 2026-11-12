import {
  createPrivateKey,
  createPublicKey,
  sign as cryptoSign,
  verify as cryptoVerify,
  type KeyObject,
} from "node:crypto";

export const LICENSE_TOKEN_PREFIX = "KS1";

const B64URL_SEGMENT_RE = /^[A-Za-z0-9_-]+$/;
const ED25519_SIGNATURE_BYTES = 64;

/**
 * Placeholder SPKI public key embedded when bundling without `--public-key`.
 * Its corresponding private key is intentionally discarded and never committed;
 * production distributions must inject their own signing public key at build time.
 */
export const DEFAULT_VENDOR_PUBLIC_KEY_PEM =
  "-----BEGIN PUBLIC KEY-----\n" +
  "MCowBQYDK2VwAyEAnhIbsI+2uutHYSk4L1EOpjpv5m+yQakLnRjmPcJKqSQ=\n" +
  "-----END PUBLIC KEY-----\n";

declare const __KNOT_SYNC_EMBEDDED_PUBLIC_KEY__: string | undefined;

export type LicenseFailureReason =
  | "missing"
  | "malformed"
  | "invalid_signature"
  | "expired"
  | "plugin_not_allowed";

export interface LicensePayload {
  licensee: string;
  plugins: string[];
  /** Unix epoch expiration timestamp in seconds (exclusive). */
  exp: number;
  /** Optional Unix epoch issued-at timestamp in seconds. */
  iat?: number;
}

export interface LicenseVerificationSuccess {
  valid: true;
  licensee: string;
  plugins: string[];
  exp: number;
  iat?: number;
  isTestSentinel?: boolean;
}

export interface LicenseVerificationFailure {
  valid: false;
  reason: LicenseFailureReason;
  detail: string;
}

export type LicenseVerificationResult =
  | LicenseVerificationSuccess
  | LicenseVerificationFailure;

export interface VerifyLicenseTokenOptions {
  pluginId: string;
  publicKey?: string | KeyObject;
  nowMs?: number;
}

export interface ResolvePluginLicenseOptions {
  pluginId: string;
  testSentinel: string;
  licenseKey?: string;
  licenseEnv: string;
  env?: NodeJS.ProcessEnv;
  publicKey?: string | KeyObject;
  nowMs?: number;
  allowTestSentinel?: boolean;
}

/** Return the embedded public key (injected by bundle-paid-plugins or fallback dev key). */
export function getEmbeddedPublicKeyPem(): string {
  const injected =
    typeof __KNOT_SYNC_EMBEDDED_PUBLIC_KEY__ === "string"
      ? __KNOT_SYNC_EMBEDDED_PUBLIC_KEY__
      : undefined;
  if (injected && injected.trim() !== "") {
    return injected;
  }
  return DEFAULT_VENDOR_PUBLIC_KEY_PEM;
}

/**
 * Determine whether legacy per-plugin test sentinels may be accepted.
 * Returns true only inside `node --test` (`NODE_TEST_CONTEXT`) or explicit
 * `KNOT_SYNC_ALLOW_TEST_LICENSE=1`, unless `KNOT_SYNC_ALLOW_TEST_LICENSE=0`
 * or `allowTestSentinel: false` explicitly disables test mode.
 */
export function isTestSentinelEnabled(
  env: NodeJS.ProcessEnv = process.env,
  explicit?: boolean,
): boolean {
  if (explicit !== undefined) return explicit;
  if (env.KNOT_SYNC_ALLOW_TEST_LICENSE === "0") return false;
  if (env.KNOT_SYNC_ALLOW_TEST_LICENSE === "1") return true;
  return Boolean(env.NODE_TEST_CONTEXT || process.env.NODE_TEST_CONTEXT);
}

function toKeyObject(key: string | KeyObject | undefined): KeyObject {
  const source = key ?? getEmbeddedPublicKeyPem();
  return typeof source === "string" ? createPublicKey(source) : source;
}

function fail(
  reason: LicenseFailureReason,
  detail: string,
): LicenseVerificationFailure {
  return { valid: false, reason, detail };
}

function parsePayloadClaims(payloadJson: string): LicensePayload | undefined {
  let raw: unknown;
  try {
    raw = JSON.parse(payloadJson);
  } catch {
    return undefined;
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return undefined;
  }
  const obj = raw as Record<string, unknown>;
  if (typeof obj.licensee !== "string" || obj.licensee.trim() === "") {
    return undefined;
  }
  if (
    !Array.isArray(obj.plugins) ||
    obj.plugins.length === 0 ||
    !obj.plugins.every((item) => typeof item === "string" && item.trim() !== "")
  ) {
    return undefined;
  }
  if (typeof obj.exp !== "number" || !Number.isFinite(obj.exp) || obj.exp <= 0) {
    return undefined;
  }
  if (
    obj.iat !== undefined &&
    (typeof obj.iat !== "number" || !Number.isFinite(obj.iat) || obj.iat < 0)
  ) {
    return undefined;
  }
  return {
    licensee: obj.licensee,
    plugins: obj.plugins as string[],
    exp: obj.exp,
    ...(obj.iat !== undefined ? { iat: obj.iat } : {}),
  };
}

/**
 * Sign a license payload with an Ed25519 private key into `KS1.<payloadB64Url>.<sigB64Url>`.
 * Validates claim structure before signing so generated tokens are always well-formed.
 */
export function signLicensePayload(
  payload: LicensePayload,
  privateKey: string | KeyObject,
): string {
  const normalized = parsePayloadClaims(JSON.stringify(payload));
  if (!normalized) {
    throw new Error(
      "Invalid license payload: requires non-empty licensee, non-empty plugins[], and positive finite exp.",
    );
  }
  const keyObj =
    typeof privateKey === "string" ? createPrivateKey(privateKey) : privateKey;
  const payloadB64Url = Buffer.from(JSON.stringify(normalized), "utf8").toString(
    "base64url",
  );
  const sig = cryptoSign(null, Buffer.from(payloadB64Url, "utf8"), keyObj);
  return `${LICENSE_TOKEN_PREFIX}.${payloadB64Url}.${sig.toString("base64url")}`;
}

/**
 * Offline verification of an Ed25519 signed `KS1.<payloadB64Url>.<sigB64Url>` token.
 * Signature verification runs strictly before JSON payload parsing.
 */
export function verifyLicenseToken(
  token: string | undefined,
  options: VerifyLicenseTokenOptions,
): LicenseVerificationResult {
  const trimmed = token?.trim();
  if (!trimmed) {
    return fail("missing", "no license token provided");
  }

  const parts = trimmed.split(".");
  if (
    parts.length !== 3 ||
    parts[0] !== LICENSE_TOKEN_PREFIX ||
    !B64URL_SEGMENT_RE.test(parts[1] ?? "") ||
    !B64URL_SEGMENT_RE.test(parts[2] ?? "")
  ) {
    return fail(
      "malformed",
      `expected signed ${LICENSE_TOKEN_PREFIX}.<payload>.<signature> token`,
    );
  }

  const payloadB64Url = parts[1]!;
  const sigBytes = Buffer.from(parts[2]!, "base64url");
  if (sigBytes.length !== ED25519_SIGNATURE_BYTES) {
    return fail("malformed", "invalid Ed25519 signature length");
  }

  let verified: boolean;
  try {
    const publicKey = toKeyObject(options.publicKey);
    verified = cryptoVerify(
      null,
      Buffer.from(payloadB64Url, "utf8"),
      publicKey,
      sigBytes,
    );
  } catch {
    return fail("invalid_signature", "could not verify signature with public key");
  }

  if (!verified) {
    return fail("invalid_signature", "Ed25519 signature verification failed");
  }

  const claims = parsePayloadClaims(
    Buffer.from(payloadB64Url, "base64url").toString("utf8"),
  );
  if (!claims) {
    return fail("malformed", "verified token payload has invalid claims");
  }

  const nowSeconds = Math.floor((options.nowMs ?? Date.now()) / 1000);
  if (nowSeconds >= claims.exp) {
    const expiredAt = new Date(claims.exp * 1000).toISOString();
    return fail("expired", `license expired at ${expiredAt}`);
  }

  if (!claims.plugins.includes("*") && !claims.plugins.includes(options.pluginId)) {
    return fail(
      "plugin_not_allowed",
      `license does not grant access to plugin "${options.pluginId}"`,
    );
  }

  return {
    valid: true,
    licensee: claims.licensee,
    plugins: claims.plugins,
    exp: claims.exp,
    ...(claims.iat !== undefined ? { iat: claims.iat } : {}),
  };
}

/**
 * Resolve a plugin's configured license (`licenseKey` setting then `env[licenseEnv]`)
 * and verify it via gated test sentinel or Ed25519 token check.
 */
export function resolveAndVerifyPluginLicense(
  options: ResolvePluginLicenseOptions,
): LicenseVerificationResult {
  const env = options.env ?? process.env;
  const raw = options.licenseKey?.trim() || env[options.licenseEnv]?.trim();
  if (!raw) {
    return fail("missing", "no license key or env var configured");
  }

  if (
    raw === options.testSentinel &&
    isTestSentinelEnabled(env, options.allowTestSentinel)
  ) {
    return {
      valid: true,
      licensee: "test-sentinel",
      plugins: [options.pluginId],
      exp: Number.MAX_SAFE_INTEGER,
      isTestSentinel: true,
    };
  }

  return verifyLicenseToken(raw, {
    pluginId: options.pluginId,
    publicKey: options.publicKey,
    nowMs: options.nowMs,
  });
}

/** Format an actionable, secret-free license error message for operators. */
export function formatLicenseFailureMessage(options: {
  label: string;
  pluginId: string;
  licenseEnv: string;
  reason?: LicenseFailureReason;
  detail?: string;
  relPath?: string;
  suffix?: string;
}): string {
  const scope = options.relPath ? ` for "${options.relPath}"` : "";
  const reasonNote =
    options.reason && options.reason !== "missing" && options.detail
      ? ` (${options.reason}: ${options.detail})`
      : "";
  const tail = options.suffix ?? 'then retry.';
  return (
    `${options.label} license missing or invalid${scope}${reasonNote}. ` +
    `Set ${options.licenseEnv} or ${options.pluginId}.licenseKey to a valid KS1 signed license token, ${tail}`
  );
}
