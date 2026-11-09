#!/usr/bin/env node
/**
 * Bundle the CLI + workspace packages into packages/cli/dist/bin.js for a
 * single npm publish. Third-party deps stay external (installed from npm).
 */
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
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
      // Entry + filesystem paths must never be external (Windows entries are
      // absolute like D:\... and look like bare package ids to naive checks).
      if (args.kind === "entry-point") return undefined;
      const p = args.path;
      if (p.startsWith("node:")) return { path: p, external: true };
      if (p.startsWith(".") || isAbsolute(p) || /^[A-Za-z]:[\\/]/.test(p)) {
        return undefined;
      }
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
chmodSync(outfile, 0o755);

rmSync(staticDest, { recursive: true, force: true });
mkdirSync(staticDest, { recursive: true });
cpSync(staticSrc, staticDest, { recursive: true });

// npm packs packages/cli/README.md — keep it identical to the product README.
cpSync(join(root, "README.md"), join(cliDir, "README.md"));

console.log("Bundled CLI → packages/cli/dist/bin.js");
console.log("Copied UI static → packages/cli/static/");
console.log("Synced product README → packages/cli/README.md");
