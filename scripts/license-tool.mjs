#!/usr/bin/env node
/**
 * Offline Ed25519 keygen, license signing, and verification CLI for KnotSync Paid plugins.
 * Uses only Node.js built-in modules (no network calls, no third-party dependencies).
 *
 * Subcommands:
 *   keygen --out <dir> [--force]
 *   sign   --private-key <pem> --licensee <name> --plugins <id1,id2|*> [--days <n> | --exp <unix>]
 *   verify --public-key <pem> --token <KS1...> [--plugin <id>] [--now <unix>]
 */
import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign as cryptoSign,
  verify as cryptoVerify,
} from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";

const TOKEN_PREFIX = "KS1";
const B64URL_RE = /^[A-Za-z0-9_-]+$/;

function usage(exitCode = 0) {
  const out = exitCode === 0 ? process.stdout : process.stderr;
  out.write(
    [
      "Usage: node scripts/license-tool.mjs <keygen|sign|verify> [options]",
      "",
      "Commands:",
      "  keygen  --out <dir> [--force]",
      "  sign    --private-key <pem> --licensee <name> --plugins <ids|*> [--days <n> | --exp <unix>]",
      "  verify  --public-key <pem> --token <token> [--plugin <id>] [--now <unix>]",
      "",
    ].join("\n"),
  );
  process.exit(exitCode);
}

function cmdKeygen(args) {
  const { values } = parseArgs({
    args,
    options: {
      out: { type: "string" },
      force: { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
    allowPositionals: false,
  });
  if (values.help) usage(0);
  if (!values.out) {
    console.error("keygen requires --out <dir>");
    process.exit(2);
  }
  const privPath = join(values.out, "license-private.pem");
  const pubPath = join(values.out, "license-public.pem");
  if (!values.force && (existsSync(privPath) || existsSync(pubPath))) {
    console.error(`Key file already exists in ${values.out}. Pass --force to overwrite.`);
    process.exit(1);
  }
  mkdirSync(values.out, { recursive: true });
  const { publicKey, privateKey } = generateKeyPairSync("ed25519", {
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  writeFileSync(privPath, privateKey, { mode: 0o600 });
  chmodSync(privPath, 0o600);
  writeFileSync(pubPath, publicKey, { mode: 0o644 });
  console.log(JSON.stringify({ privateKeyPath: privPath, publicKeyPath: pubPath }, null, 2));
}

function cmdSign(args) {
  const { values } = parseArgs({
    args,
    options: {
      "private-key": { type: "string" },
      licensee: { type: "string" },
      plugins: { type: "string" },
      days: { type: "string" },
      exp: { type: "string" },
      help: { type: "boolean", default: false },
    },
    allowPositionals: false,
  });
  if (values.help) usage(0);

  const keyPath = values["private-key"];
  const licensee = values.licensee?.trim();
  const pluginsRaw = values.plugins?.trim();
  if (!keyPath || !licensee || !pluginsRaw) {
    console.error("sign requires --private-key <pem>, --licensee <name>, and --plugins <ids|*>");
    process.exit(2);
  }
  if (values.exp && values.days) {
    console.error("Pass either --exp or --days, not both.");
    process.exit(2);
  }

  const iat = Math.floor(Date.now() / 1000);
  let exp;
  if (values.exp !== undefined) {
    exp = Number(values.exp);
    if (!Number.isFinite(exp) || exp <= 0) {
      console.error("Invalid --exp timestamp (must be positive Unix seconds).");
      process.exit(2);
    }
  } else {
    const days = values.days !== undefined ? Number(values.days) : 365;
    if (!Number.isFinite(days) || days <= 0) {
      console.error("Invalid --days value (must be positive number).");
      process.exit(2);
    }
    exp = iat + Math.round(days * 86_400);
  }

  const plugins = pluginsRaw
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (plugins.length === 0) {
    console.error("No valid plugin IDs in --plugins.");
    process.exit(2);
  }

  const privateKey = createPrivateKey(readFileSync(keyPath, "utf8"));
  const payload = { licensee, plugins, exp, iat };
  const payloadB64Url = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = cryptoSign(null, Buffer.from(payloadB64Url, "utf8"), privateKey);
  process.stdout.write(`${TOKEN_PREFIX}.${payloadB64Url}.${sig.toString("base64url")}\n`);
}

function cmdVerify(args) {
  const { values } = parseArgs({
    args,
    options: {
      "public-key": { type: "string" },
      token: { type: "string" },
      plugin: { type: "string" },
      now: { type: "string" },
      help: { type: "boolean", default: false },
    },
    allowPositionals: false,
  });
  if (values.help) usage(0);

  const pubPath = values["public-key"];
  const token = values.token?.trim();
  if (!pubPath || !token) {
    console.error("verify requires --public-key <pem> and --token <KS1...>");
    process.exit(2);
  }

  const failOut = (reason, detail) => {
    console.error(JSON.stringify({ valid: false, reason, detail }));
    process.exit(1);
  };

  const parts = token.split(".");
  if (
    parts.length !== 3 ||
    parts[0] !== TOKEN_PREFIX ||
    !B64URL_RE.test(parts[1] ?? "") ||
    !B64URL_RE.test(parts[2] ?? "")
  ) {
    failOut("malformed", `expected ${TOKEN_PREFIX}.<payload>.<signature>`);
  }

  const sigBytes = Buffer.from(parts[2], "base64url");
  if (sigBytes.length !== 64) {
    failOut("malformed", "invalid Ed25519 signature length");
  }

  const publicKey = createPublicKey(readFileSync(pubPath, "utf8"));
  const ok = cryptoVerify(null, Buffer.from(parts[1], "utf8"), publicKey, sigBytes);
  if (!ok) {
    failOut("invalid_signature", "Ed25519 signature verification failed");
  }

  const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  if (
    !claims ||
    typeof claims.licensee !== "string" ||
    claims.licensee.trim() === "" ||
    !Array.isArray(claims.plugins) ||
    claims.plugins.length === 0 ||
    typeof claims.exp !== "number"
  ) {
    failOut("malformed", "invalid claims payload");
  }

  const nowSec = values.now !== undefined ? Number(values.now) : Math.floor(Date.now() / 1000);
  if (!Number.isFinite(nowSec)) {
    failOut("malformed", "invalid --now value");
  }
  if (nowSec >= claims.exp) {
    failOut("expired", `license expired at ${new Date(claims.exp * 1000).toISOString()}`);
  }
  if (
    values.plugin &&
    !claims.plugins.includes("*") &&
    !claims.plugins.includes(values.plugin)
  ) {
    failOut("plugin_not_allowed", `token does not allow plugin "${values.plugin}"`);
  }

  console.log(JSON.stringify({ valid: true, ...claims }, null, 2));
}

const [subcommand, ...rest] = process.argv.slice(2);
if (!subcommand || subcommand === "--help" || subcommand === "-h") {
  usage(0);
}
if (subcommand === "keygen") cmdKeygen(rest);
else if (subcommand === "sign") cmdSign(rest);
else if (subcommand === "verify") cmdVerify(rest);
else {
  console.error(`Unknown subcommand "${subcommand}"`);
  usage(2);
}
