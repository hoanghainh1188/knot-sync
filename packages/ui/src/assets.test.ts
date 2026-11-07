import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { resolveStaticDir } from "./server.js";

test("static build directory contains index.html and local assets", () => {
  const dir = resolveStaticDir();
  assert.ok(existsSync(join(dir, "index.html")), `missing ${dir}/index.html — run vite build`);
  const files = readdirSync(dir);
  assert.ok(files.some((f) => f.endsWith(".js") || existsSync(join(dir, "assets"))), "expected JS assets");
});
