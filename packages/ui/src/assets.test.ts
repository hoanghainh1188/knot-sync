import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { resolveStaticDir } from "./server.js";

test("static build directory contains index.html and local assets", () => {
  const dir = resolveStaticDir();
  assert.ok(existsSync(join(dir, "index.html")), `missing ${dir}/index.html — run vite build`);
  const files = readdirSync(dir);
  assert.ok(files.some((f) => f.endsWith(".js") || existsSync(join(dir, "assets"))), "expected JS assets");
});

test("built static HTML/CSS/JS bundles contain zero CDN URLs", () => {
  const dir = resolveStaticDir();
  const cdnPattern = /https?:\/\/(cdn\.|unpkg\.com|cdn\.jsdelivr\.net|fonts\.googleapis\.com)/i;
  const html = readFileSync(join(dir, "index.html"), "utf8");
  assert.doesNotMatch(html, cdnPattern);

  const assetsDir = join(dir, "assets");
  if (existsSync(assetsDir)) {
    for (const file of readdirSync(assetsDir)) {
      if (file.endsWith(".js") || file.endsWith(".css")) {
        const text = readFileSync(join(assetsDir, file), "utf8");
        assert.doesNotMatch(text, cdnPattern, `CDN URL found in ${file}`);
      }
    }
  }
});
