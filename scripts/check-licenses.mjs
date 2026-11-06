#!/usr/bin/env node
/**
 * Fail if any production dependency under packages/* is GPL/AGPL/LGPL.
 * Uses license-checker (BSD-3-Clause) — listed as a root devDependency.
 */
import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const FAIL_ON = "GPL;AGPL;LGPL;GPL-2.0;GPL-3.0;GPL-2.0-only;GPL-3.0-only;AGPL-3.0;AGPL-3.0-only;LGPL-2.1;LGPL-3.0";
const packagesDir = join(process.cwd(), "packages");
const dirs = readdirSync(packagesDir).filter((d) =>
  existsSync(join(packagesDir, d, "package.json")),
);

let failed = false;
for (const dir of dirs) {
  const start = join(packagesDir, dir);
  const result = spawnSync(
    "pnpm",
    [
      "exec",
      "license-checker",
      "--production",
      "--start",
      start,
      "--failOn",
      FAIL_ON,
      "--summary",
    ],
    { encoding: "utf8", shell: process.platform === "win32" },
  );
  if (result.status !== 0) {
    failed = true;
    console.error(`License check failed for packages/${dir}:`);
    console.error(result.stdout || "");
    console.error(result.stderr || "");
  } else {
    console.log(`OK packages/${dir}`);
  }
}

if (failed) {
  console.error("Remove or replace GPL/AGPL/LGPL dependencies (MIT/BSD/Apache/ISC only).");
  process.exit(1);
}
console.log("License check passed for all packages.");
