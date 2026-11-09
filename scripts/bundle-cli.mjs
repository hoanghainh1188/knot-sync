#!/usr/bin/env node
/**
 * Bundle the CLI + workspace packages into packages/cli/dist/bin.js for a
 * single npm publish. Third-party deps stay external (installed from npm).
 */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cliDir = join(root, "packages/cli");
const distDir = join(cliDir, "dist");
const staticSrc = join(root, "packages/ui/static");
const staticDest = join(cliDir, "static");

const WORKSPACE_PREFIX = "@hoanghainh/knot-sync";

if (!existsSync(join(staticSrc, "index.html"))) {
  throw new Error(
    `Missing UI static build at ${staticSrc}. Run "pnpm build" (vite) first.`,
  );
}

/** @type {import('esbuild').Plugin} */
const externalNonWorkspace = {
  name: "external-non-workspace",
  setup(build) {
    build.onResolve({ filter: /.*/ }, (args) => {
      const p = args.path;
      if (p.startsWith("node:")) return { path: p, external: true };
      if (p.startsWith(".") || p.startsWith("/")) return undefined;
      if (p === WORKSPACE_PREFIX || p.startsWith(`${WORKSPACE_PREFIX}-`)) {
        return undefined;
      }
      return { path: p, external: true };
    });
  },
};

await esbuild.build({
  absWorkingDir: root,
  entryPoints: [join(cliDir, "src/bin.ts")],
  outfile: join(distDir, "bin.js"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  sourcemap: true,
  legalComments: "none",
  plugins: [externalNonWorkspace],
  logLevel: "info",
});

// Exactly one shebang (esbuild may already emit one for bin entries).
const outfile = join(distDir, "bin.js");
const lines = readFileSync(outfile, "utf8").split("\n");
while (lines[0]?.startsWith("#!")) lines.shift();
writeFileSync(outfile, `#!/usr/bin/env node\n${lines.join("\n")}`);

rmSync(staticDest, { recursive: true, force: true });
mkdirSync(staticDest, { recursive: true });
cpSync(staticSrc, staticDest, { recursive: true });

console.log("Bundled CLI → packages/cli/dist/bin.js");
console.log("Copied UI static → packages/cli/static/");
