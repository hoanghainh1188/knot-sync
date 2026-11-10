import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";
import {
  ConfigError,
  createPluginHost,
  loadPlugins,
  type FileEntry,
} from "@hoanghainh/knot-sync-core";
import {
  OCR_EXTRACTOR_ID,
  OCR_PLUGIN_NAME,
  OCR_TEST_LICENSE_SENTINEL,
  checkOcrLicense,
  createOcrPlugin,
  parseOcrSettings,
  type DockerRunner,
} from "./index.js";

function entry(
  root: string,
  rel: string,
  type: FileEntry["type"],
  ext: string,
  size = 100,
): FileEntry {
  return {
    sourceId: "s",
    absPath: join(root, rel),
    relPath: rel,
    ext,
    type,
    size,
    mtimeMs: Date.now(),
    hash: "h1",
  };
}

const mockMarkdown = "# 請求書\nInvoice body\n";

function mockDocker(markdown = mockMarkdown): DockerRunner {
  return async () => ({ ok: true, markdown, stdout: "", stderr: "" });
}

test("parseOcrSettings rejects unknown keys and non-positive timeouts", () => {
  assert.throws(
    () => parseOcrSettings({ cloudUrl: "https://ocr.example" }),
    (err: unknown) =>
      err instanceof ConfigError && /Unknown key "cloudUrl"/.test(err.message),
  );
  assert.throws(
    () => parseOcrSettings({ timeoutSeconds: 0 }),
    (err: unknown) =>
      err instanceof ConfigError && /timeoutSeconds/.test(err.message),
  );
  assert.throws(
    () => parseOcrSettings({ timeoutSeconds: -1 }),
    (err: unknown) =>
      err instanceof ConfigError && /positive number/.test(err.message),
  );
  const ok = parseOcrSettings({ timeoutSeconds: 30, licenseKey: OCR_TEST_LICENSE_SENTINEL });
  assert.equal(ok.timeoutSeconds, 30);
  assert.equal(ok.licenseKey, OCR_TEST_LICENSE_SENTINEL);
});

test("plugin registers ocr-docling only when loaded; settings key is extractor-ocr", () => {
  const host = createPluginHost();
  assert.equal(host.extractors.has(OCR_EXTRACTOR_ID), false);

  host.registerPlugin(
    createOcrPlugin({
      settings: { licenseKey: OCR_TEST_LICENSE_SENTINEL },
      dockerRunner: mockDocker(),
    }),
  );
  const ext = host.extractors.get(OCR_EXTRACTOR_ID);
  assert.ok(ext);
  assert.ok(ext.extensions.includes(".png"));
  assert.ok(ext.extensions.includes(".pdf"));
  assert.equal(host.loaded[0]?.name, OCR_PLUGIN_NAME);
});

test("loadPlugins lists OCR only when plugins: includes it", async () => {
  const without = await loadPlugins({ builtins: [], entries: [], baseDir: process.cwd() });
  assert.equal(without.extractors.has(OCR_EXTRACTOR_ID), false);

  const pluginPath = pathToFileURL(
    join(import.meta.dirname, "../dist/index.js"),
  ).href;
  // Use importModule override so we inject a licensed mock without real docker.
  const withPlugin = await loadPlugins({
    builtins: [],
    entries: ["./fake-ocr.js"],
    baseDir: process.cwd(),
    pluginSettings: {
      [OCR_PLUGIN_NAME]: { licenseKey: OCR_TEST_LICENSE_SENTINEL },
    },
    importModule: async () =>
      createOcrPlugin({
        settings: { licenseKey: OCR_TEST_LICENSE_SENTINEL },
        dockerRunner: mockDocker(),
      }),
  });
  assert.ok(withPlugin.extractors.has(OCR_EXTRACTOR_ID));
  void pluginPath;
});

test("LICENSE soft-fail for missing license; JP path in message; sentinel allows extract", async () => {
  const root = await mkdtemp(join(tmpdir(), "knot-ocr-lic-"));
  const rel = join("経理", "請求書.png");
  await mkdir(join(root, "経理"), { recursive: true });
  await writeFile(join(root, rel), Buffer.from([0x89, 0x50, 0x4e, 0x47]));

  const file = entry(root, rel, "image", ".png");

  const missing = createPluginHost();
  missing.registerPlugin(
    createOcrPlugin({
      settings: {},
      dockerRunner: mockDocker(),
      env: {},
    }),
  );
  const miss = await missing.extractors.get(OCR_EXTRACTOR_ID)!.extract(file);
  assert.equal(miss.ok, false);
  if (!miss.ok) {
    assert.equal(miss.code, "LICENSE");
    assert.match(miss.message, /経理[/\\]請求書\.png/);
    assert.match(miss.message, /KNOT_SYNC_OCR_LICENSE/);
  }

  // Direct license helper also names the JP path.
  const checked = checkOcrLicense(parseOcrSettings({}), rel, {});
  assert.ok(checked && !checked.ok && checked.code === "LICENSE");
  assert.match(checked.message, /経理[/\\]請求書\.png/);

  const okHost = createPluginHost();
  okHost.registerPlugin(
    createOcrPlugin({
      settings: { licenseKey: OCR_TEST_LICENSE_SENTINEL },
      dockerRunner: mockDocker(),
      env: {},
    }),
  );
  const ok = await okHost.extractors.get(OCR_EXTRACTOR_ID)!.extract(file);
  assert.equal(ok.ok, true, ok.ok ? "" : `${ok.code}: ${ok.message}`);
  if (ok.ok) {
    assert.match(ok.document.content, /請求書/);
    assert.equal(ok.document.metadata.extractor, OCR_EXTRACTOR_ID);
  }
});

test("mock docker returns Markdown with 請求書; never writes to source", async () => {
  const root = await mkdtemp(join(tmpdir(), "knot-ocr-dock-"));
  const rel = "Hóa đơn.jpg";
  const abs = join(root, rel);
  await writeFile(abs, Buffer.from("fake-jpeg"));
  const before = await import("node:fs/promises").then((fs) => fs.readFile(abs));

  let called = 0;
  const runner: DockerRunner = async (input) => {
    called += 1;
    assert.equal(input.inputAbsPath, abs);
    assert.match(input.image, /docling/);
    return { ok: true, markdown: "# 請求書\n", stdout: "", stderr: "" };
  };

  const host = createPluginHost();
  host.registerPlugin(
    createOcrPlugin({
      settings: { licenseKey: OCR_TEST_LICENSE_SENTINEL },
      dockerRunner: runner,
      env: {},
    }),
  );
  const result = await host.extractors
    .get(OCR_EXTRACTOR_ID)!
    .extract(entry(root, rel, "image", ".jpg"));
  assert.equal(called, 1);
  assert.equal(result.ok, true);
  if (result.ok) assert.match(result.document.content, /請求書/);

  const after = await import("node:fs/promises").then((fs) => fs.readFile(abs));
  assert.deepEqual(after, before);
});

test("Docker failures map to DOCKER / PARSE codes", async () => {
  const root = await mkdtemp(join(tmpdir(), "knot-ocr-fail-"));
  await writeFile(join(root, "a.png"), Buffer.from("x"));
  const file = entry(root, "a.png", "image", ".png");

  const cases: Array<{ runner: DockerRunner; code: string; re: RegExp }> = [
    {
      runner: async () => ({
        ok: false,
        code: "DOCKER",
        message: 'Docker CLI not found while OCR-ing "a.png". Install Docker…',
      }),
      code: "DOCKER",
      re: /Docker/,
    },
    {
      runner: async () => ({
        ok: false,
        code: "DOCKER",
        message: 'Docker daemon unreachable while OCR-ing "a.png". Start Docker…',
      }),
      code: "DOCKER",
      re: /daemon|Docker/,
    },
    {
      runner: async () => ({
        ok: false,
        code: "PARSE",
        message: 'Docling OCR failed for "a.png" (exit 1).',
      }),
      code: "PARSE",
      re: /Docling|failed/,
    },
  ];

  for (const c of cases) {
    const host = createPluginHost();
    host.registerPlugin(
      createOcrPlugin({
        settings: { licenseKey: OCR_TEST_LICENSE_SENTINEL },
        dockerRunner: c.runner,
        env: {},
      }),
    );
    const result = await host.extractors.get(OCR_EXTRACTOR_ID)!.extract(file);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.code, c.code);
      assert.match(result.message, c.re);
    }
  }
});

test("oversized and timed-out OCR soft-fail", async () => {
  const root = await mkdtemp(join(tmpdir(), "knot-ocr-size-"));
  await writeFile(join(root, "big.png"), Buffer.from("x"));
  const big = entry(root, "big.png", "image", ".png", 10_000_000);

  const host = createPluginHost();
  let dockerCalls = 0;
  host.registerPlugin(
    createOcrPlugin({
      settings: {
        licenseKey: OCR_TEST_LICENSE_SENTINEL,
        maxInputMb: 1,
      },
      dockerRunner: async () => {
        dockerCalls += 1;
        return { ok: true, markdown: "x", stdout: "", stderr: "" };
      },
      env: {},
    }),
  );
  const oversized = await host.extractors.get(OCR_EXTRACTOR_ID)!.extract(big, {
    maxFileSizeBytes: 50 * 1024 * 1024,
  });
  assert.equal(oversized.ok, false);
  if (!oversized.ok) assert.equal(oversized.code, "SKIPPED_TOO_LARGE");
  assert.equal(dockerCalls, 0);

  const timedHost = createPluginHost();
  timedHost.registerPlugin(
    createOcrPlugin({
      settings: { licenseKey: OCR_TEST_LICENSE_SENTINEL, timeoutSeconds: 1 },
      dockerRunner: async () => ({
        ok: false,
        code: "EXTRACT_TIMEOUT",
        message: 'OCR timed out for "big.png". Raise extractor-ocr.timeoutSeconds…',
      }),
      env: {},
    }),
  );
  const small = entry(root, "big.png", "image", ".png", 100);
  const timed = await timedHost.extractors.get(OCR_EXTRACTOR_ID)!.extract(small, {
    signal: AbortSignal.abort(),
  });
  assert.equal(timed.ok, false);
  if (!timed.ok) assert.equal(timed.code, "EXTRACT_TIMEOUT");
});

test("invalid settings fail at register time", () => {
  const host = createPluginHost();
  assert.throws(
    () =>
      host.registerPlugin(
        createOcrPlugin({ settings: { timeoutSeconds: -5 } }),
      ),
    ConfigError,
  );
});
