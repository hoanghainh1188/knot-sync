#!/usr/bin/env node
/**
 * Bundle all seven Paid plugins into standalone distributable ESM packages under
 * dist/paid-plugins/<plugin>/ with workspace and pure-JS deps inlined.
 * Keeps @hoanghainh/knot-sync (public CLI tarball) 100% free-only.
 *
 * Options:
 *   --out-dir <dir>      Output root (default: dist/paid-plugins)
 *   --public-key <pem>   SPKI Ed25519 public key PEM to embed at bundle time
 *                        (or env KNOT_SYNC_LICENSE_PUBLIC_KEY_FILE)
 *   --plugin <names>     Comma-separated subset of Paid plugins to bundle
 *   --pack               Run `npm pack` per bundled plugin to emit .tgz tarballs
 */
import { spawnSync } from "node:child_process";
import { createPublicKey } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { builtinModules } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import * as esbuild from "esbuild";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

export const PAID_PLUGINS = [
  "auth-oauth",
  "catalog-llm",
  "connector-sql-enterprise",
  "extractor-housen",
  "extractor-ocr",
  "guard-llm",
  "search-vector",
];

// Keep optional native drivers and Node built-ins external; bundle pure-JS & workspace deps.
const NODE_EXTERNALS = Array.from(
  new Set([
    ...builtinModules,
    ...builtinModules.map((m) => (m.startsWith("node:") ? m : `node:${m}`)),
  ]),
);

const NATIVE_OPTIONAL_EXTERNALS = ["odbc", "oracledb"];

const CJS_SHIM_BANNER =
  'import { createRequire as __knotCreateRequire } from "node:module";\n' +
  "const require = __knotCreateRequire(import.meta.url);\n";

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    "out-dir": { type: "string", default: join(root, "dist/paid-plugins") },
    "public-key": { type: "string" },
    plugin: { type: "string" },
    pack: { type: "boolean", default: false },
    help: { type: "boolean", default: false },
  },
  allowPositionals: false,
});

if (values.help) {
  console.log(
    "Usage: node scripts/bundle-paid-plugins.mjs [--out-dir <dir>] [--public-key <pem>] [--plugin <list>] [--pack]",
  );
  process.exit(0);
}

const outRoot = resolve(values["out-dir"]);
const pubKeyFile = values["public-key"] ?? process.env.KNOT_SYNC_LICENSE_PUBLIC_KEY_FILE;

let embeddedPublicKey = "";
if (pubKeyFile) {
  const pem = readFileSync(resolve(pubKeyFile), "utf8");
  createPublicKey(pem); // Fail fast if malformed PEM.
  embeddedPublicKey = pem;
} else {
  console.warn(
    "WARN: --public-key not supplied; Paid bundles will embed the fallback non-commercial dev key.",
  );
}

const selected = values.plugin
  ? values.plugin
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  : PAID_PLUGINS;

for (const name of selected) {
  if (!PAID_PLUGINS.includes(name)) {
    throw new Error(`Unknown Paid plugin "${name}". Expected one of: ${PAID_PLUGINS.join(", ")}`);
  }
}

mkdirSync(outRoot, { recursive: true });

for (const pluginDirName of selected) {
  const srcPkgDir = join(root, "packages", pluginDirName);
  const destDir = join(outRoot, pluginDirName);
  const srcPkg = JSON.parse(readFileSync(join(srcPkgDir, "package.json"), "utf8"));

  rmSync(destDir, { recursive: true, force: true });
  mkdirSync(destDir, { recursive: true });

  await esbuild.build({
    absWorkingDir: root,
    entryPoints: [join(srcPkgDir, "src/index.ts")],
    outfile: join(destDir, "index.mjs"),
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
    sourcemap: true,
    legalComments: "none",
    external: [...NODE_EXTERNALS, ...NATIVE_OPTIONAL_EXTERNALS],
    banner: { js: CJS_SHIM_BANNER },
    define: {
      __KNOT_SYNC_EMBEDDED_PUBLIC_KEY__: JSON.stringify(embeddedPublicKey),
    },
    logLevel: "warning",
  });

  const distManifest = {
    name: srcPkg.name,
    version: srcPkg.version,
    description: srcPkg.description,
    license: srcPkg.license,
    type: "module",
    main: "./index.mjs",
    exports: {
      ".": {
        default: "./index.mjs",
      },
    },
    files: ["index.mjs", "index.mjs.map", "README.md", "LICENSE"],
    engines: srcPkg.engines ?? { node: ">=22.13.0" },
    ...(srcPkg.optionalDependencies ? { optionalDependencies: srcPkg.optionalDependencies } : {}),
    author: srcPkg.author ?? "hoanghainh",
    private: true,
  };
  writeFileSync(join(destDir, "package.json"), `${JSON.stringify(distManifest, null, 2)}\n`);

  if (existsSync(join(srcPkgDir, "README.md"))) {
    cpSync(join(srcPkgDir, "README.md"), join(destDir, "README.md"));
  }
  if (existsSync(join(srcPkgDir, "LICENSE"))) {
    cpSync(join(srcPkgDir, "LICENSE"), join(destDir, "LICENSE"));
  }

  if (values.pack) {
    const packRes = spawnSync("npm", ["pack", "--silent"], {
      cwd: destDir,
      encoding: "utf8",
      shell: process.platform === "win32",
    });
    if (packRes.status !== 0) {
      throw new Error(`npm pack failed for ${pluginDirName}: ${packRes.stderr || packRes.stdout}`);
    }
    const tgzName = packRes.stdout.trim().split("\n").pop();
    console.log(`Bundled + packed ${pluginDirName} -> ${join(destDir, tgzName || "")}`);
  } else {
    console.log(`Bundled ${pluginDirName} -> ${join(destDir, "index.mjs")}`);
  }
}
