import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "../../..");

describe("turnkey LAN deployment bundle", () => {
  it("provides a non-root Node 22 Dockerfile with /mcp fetch healthcheck and .dockerignore", () => {
    const dockerfilePath = resolve(REPO_ROOT, "Dockerfile");
    const dockerignorePath = resolve(REPO_ROOT, ".dockerignore");
    assert.ok(existsSync(dockerfilePath), "Root Dockerfile must exist");
    assert.ok(existsSync(dockerignorePath), "Root .dockerignore must exist");

    const dockerfile = readFileSync(dockerfilePath, "utf8");
    assert.match(dockerfile, /^FROM\s+node:22-alpine/m);
    assert.match(dockerfile, /^USER\s+node$/m);
    assert.match(dockerfile, /^HEALTHCHECK\b/m);
    assert.match(dockerfile, /fetch\(['"]http:\/\/127\.0\.0\.1:/);
    assert.match(dockerfile, /\/mcp/);
    assert.match(dockerfile, /^ENTRYPOINT\s+\["node",\s*"\/app\/dist\/bin\.js"\]$/m);

    const ignore = readFileSync(dockerignorePath, "utf8");
    for (const pattern of [".git", "node_modules", ".data", ".env"]) {
      assert.ok(ignore.includes(pattern), `.dockerignore should ignore ${pattern}`);
    }
  });

  it("provides deploy/docker-compose.lan.yml with :ro source mounts, healthcheck, and ocr/local-ai profiles", () => {
    const composePath = resolve(REPO_ROOT, "deploy/docker-compose.lan.yml");
    const envExamplePath = resolve(REPO_ROOT, "deploy/.env.example");
    assert.ok(existsSync(composePath), "deploy/docker-compose.lan.yml must exist");
    assert.ok(existsSync(envExamplePath), "deploy/.env.example must exist");

    const compose = parseYaml(readFileSync(composePath, "utf8")) as {
      services?: Record<
        string,
        {
          image?: string;
          profiles?: string[];
          volumes?: string[];
          command?: string[];
          healthcheck?: { test?: unknown };
          networks?: string[];
        }
      >;
      networks?: Record<string, { driver?: string }>;
    };

    const knot = compose.services?.["knot-sync"];
    assert.ok(knot, "knot-sync service must be defined");
    assert.ok(knot.command?.includes("--http"), "command must include --http");
    assert.ok(knot.command?.includes("--host"), "command must include --host");
    assert.ok(knot.command?.includes("0.0.0.0"), "command must bind 0.0.0.0 inside container");
    assert.ok(knot.command?.includes("--sync-interval"), "command must include --sync-interval");
    assert.ok(knot.healthcheck?.test, "knot-sync service must define healthcheck");

    const volumes = knot.volumes ?? [];
    assert.ok(
      volumes.some((v) => v.includes(":/sources:ro")),
      "Customer sources must be mounted :ro",
    );
    assert.ok(
      volumes.some((v) => v.includes(":/app/knot-sync.config.yaml:ro")),
      "Config must be mounted :ro",
    );
    assert.ok(
      volumes.some((v) => v.includes(":/data:rw")),
      ".data store must be mounted rw",
    );

    const docling = compose.services?.["docling-serve"];
    assert.ok(docling?.profiles?.includes("ocr"), "docling-serve must use ocr profile");
    assert.match(docling?.image ?? "", /docling-serve-cpu/);

    const ollama = compose.services?.["ollama"];
    assert.ok(ollama?.profiles?.includes("local-ai"), "ollama must use local-ai profile");
    assert.match(ollama?.image ?? "", /ollama/);

    assert.equal(compose.networks?.["knot-internal"]?.driver, "bridge");

    const envExample = readFileSync(envExamplePath, "utf8");
    for (const key of [
      "KNOT_SYNC_API_KEY=",
      "KNOT_SYNC_PORT=",
      "KNOT_SYNC_SYNC_INTERVAL=",
      "KNOT_SYNC_SOURCES_DIR=",
      "KNOT_SYNC_CONFIG=",
      "KNOT_SYNC_DATA_DIR=",
    ]) {
      assert.ok(envExample.includes(key), `.env.example must define ${key}`);
    }
  });

  it("verifies Docker build and CLI invocation when Docker daemon is available", (t) => {
    try {
      execFileSync("docker", ["info"], { stdio: "ignore", timeout: 3000 });
    } catch {
      t.skip("Docker daemon not available in current test environment");
      return;
    }
    const lockDir = resolve(tmpdir(), "knot-sync-cli-manifest.lock");
    const deadline = Date.now() + 180_000;
    const sleepBuf = new Int32Array(new SharedArrayBuffer(4));
    while (true) {
      try {
        mkdirSync(lockDir);
        break;
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
        try {
          if (Date.now() - statSync(lockDir).mtimeMs > 300_000) {
            rmSync(lockDir, { recursive: true, force: true });
            continue;
          }
        } catch {
          continue;
        }
        if (Date.now() >= deadline) {
          throw new Error(`Timed out waiting for manifest lock at ${lockDir}`);
        }
        Atomics.wait(sleepBuf, 0, 0, 50);
      }
    }
    try {
      execFileSync("docker", ["build", "-t", "knot-sync:smoke-test", "."], {
        cwd: REPO_ROOT,
        stdio: "inherit",
        timeout: 300000,
      });
    } finally {
      rmSync(lockDir, { recursive: true, force: true });
    }
    const helpOut = execFileSync(
      "docker",
      ["run", "--rm", "knot-sync:smoke-test", "--help"],
      { cwd: REPO_ROOT, encoding: "utf8", timeout: 30000 },
    );
    assert.match(helpOut, /knot-sync/);
  });

  it("provides trilingual 3-step Enterprise Pilot Playbooks (EN/JA/VI) linked from README", () => {
    const playbooks = [
      { path: "docs/PILOT_PLAYBOOK.md", marker: ":ro" },
      { path: "docs/ja/PILOT_PLAYBOOK.md", marker: "読み取り専用" },
      { path: "docs/vi/PILOT_PLAYBOOK.md", marker: "chỉ đọc" },
    ];
    for (const { path, marker } of playbooks) {
      const fullPath = resolve(REPO_ROOT, path);
      assert.ok(existsSync(fullPath), `${path} must exist`);
      const text = readFileSync(fullPath, "utf8");
      assert.match(text, /scan.*--pii.*--report/);
      assert.match(text, /describe/);
      assert.match(text, /\bui\b/);
      assert.match(text, /serve --http/);
      assert.match(text, /\/mcp/);
      assert.ok(text.includes(marker), `${path} must state read-only (${marker})`);
    }

    const readme = readFileSync(resolve(REPO_ROOT, "README.md"), "utf8");
    assert.ok(readme.includes("docs/PILOT_PLAYBOOK.md"));
    assert.ok(readme.includes("docs/ja/PILOT_PLAYBOOK.md"));
    assert.ok(readme.includes("docs/vi/PILOT_PLAYBOOK.md"));
    assert.ok(readme.includes("deploy/docker-compose.lan.yml"));
  });
});
