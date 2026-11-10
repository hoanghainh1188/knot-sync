import { spawn } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { DEFAULT_DOCLING_IMAGE } from "./constants.js";

export interface DockerRunInput {
  image: string;
  /** Absolute path to the single source file (mounted read-only). */
  inputAbsPath: string;
  /** Absolute host directory for Docling output (writable temp). */
  outputDir: string;
  timeoutMs: number;
  signal?: AbortSignal;
}

export type DockerRunResult =
  | { ok: true; markdown: string; stdout: string; stderr: string }
  | { ok: false; code: string; message: string; stdout?: string; stderr?: string };

export type DockerRunner = (input: DockerRunInput) => Promise<DockerRunResult>;

function dockerFail(
  code: string,
  message: string,
  stdout = "",
  stderr = "",
): DockerRunResult {
  return { ok: false, code, message, stdout, stderr };
}

function classifyDockerFailure(
  exitCode: number | null,
  stdout: string,
  stderr: string,
  image: string,
  relHint: string,
): DockerRunResult {
  const combined = `${stdout}\n${stderr}`.toLowerCase();
  if (
    combined.includes("cannot connect") ||
    combined.includes("is the docker daemon running") ||
    (combined.includes("error response from daemon") && combined.includes("connect"))
  ) {
    return dockerFail(
      "DOCKER",
      `Docker daemon unreachable while OCR-ing "${relHint}". ` +
        `Start Docker, then retry "knot-sync run".`,
      stdout,
      stderr,
    );
  }
  if (
    combined.includes("unable to find image") ||
    combined.includes("pull access denied") ||
    combined.includes("not found")
  ) {
    return dockerFail(
      "DOCKER",
      `Docling image missing while OCR-ing "${relHint}". ` +
        `Run: docker pull ${image}  then retry "knot-sync run".`,
      stdout,
      stderr,
    );
  }
  if (exitCode === 127 || combined.includes("executable file not found")) {
    return dockerFail(
      "DOCKER",
      `Docker CLI not found while OCR-ing "${relHint}". ` +
        `Install Docker, pull ${image}, then retry "knot-sync run".`,
      stdout,
      stderr,
    );
  }
  return dockerFail(
    "PARSE",
    `Docling OCR failed for "${relHint}" (exit ${exitCode ?? "?"}). ` +
      `Check Docker logs, raise extractor-ocr.timeoutSeconds if needed, then retry "knot-sync run".` +
      (stderr.trim() ? ` Detail: ${stderr.trim().slice(0, 400)}` : ""),
    stdout,
    stderr,
  );
}

async function readMarkdownFromOutput(outputDir: string): Promise<string> {
  const names = await readdir(outputDir);
  const mdFiles = names.filter((n) => n.toLowerCase().endsWith(".md")).sort();
  if (mdFiles.length === 0) {
    // Some Docling builds write a single file without extension quirks — also accept .txt
    const txt = names.filter((n) => n.toLowerCase().endsWith(".txt")).sort();
    if (txt.length === 0) return "";
    return readFile(join(outputDir, txt[0]!), "utf8");
  }
  const parts: string[] = [];
  for (const name of mdFiles) {
    parts.push(await readFile(join(outputDir, name), "utf8"));
  }
  return parts.join("\n\n");
}

/**
 * Default Docker runner: `docker run --rm` with a read-only mount of the
 * single source file and a writable temp output directory. No cloud HTTP.
 */
export const defaultDockerRunner: DockerRunner = async (input) => {
  const image = input.image.trim() || DEFAULT_DOCLING_IMAGE;
  const base = basename(input.inputAbsPath);
  const relHint = base;

  if (input.signal?.aborted) {
    return dockerFail(
      "EXTRACT_TIMEOUT",
      `OCR timed out for "${relHint}". Raise extractor-ocr.timeoutSeconds or extraction.timeoutSeconds, then retry "knot-sync run".`,
    );
  }

  const args = [
    "run",
    "--rm",
    "-v",
    `${input.inputAbsPath}:/input/${base}:ro`,
    "-v",
    `${input.outputDir}:/output`,
    image,
    "docling",
    `/input/${base}`,
    "--to",
    "md",
    "--output",
    "/output",
    "--image-export-mode",
    "placeholder",
    "--force-ocr",
  ];

  return await new Promise<DockerRunResult>((resolve) => {
    let settled = false;
    const finish = (result: DockerRunResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    let child;
    try {
      child = spawn("docker", args, {
        stdio: ["ignore", "pipe", "pipe"],
        env: process.env,
      });
    } catch (err) {
      const msg = (err as Error).message || String(err);
      finish(
        dockerFail(
          "DOCKER",
          `Could not start Docker for OCR of "${relHint}" (${msg}). ` +
            `Install/start Docker, pull ${image}, then retry "knot-sync run".`,
        ),
      );
      return;
    }

    let stdout = "";
    let stderr = "";
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr?.on("data", (chunk: string) => {
      stderr += chunk;
    });

    const onAbort = () => {
      try {
        child.kill("SIGKILL");
      } catch {
        /* ignore */
      }
      finish(
        dockerFail(
          "EXTRACT_TIMEOUT",
          `OCR timed out for "${relHint}". Raise extractor-ocr.timeoutSeconds or extraction.timeoutSeconds, then retry "knot-sync run".`,
          stdout,
          stderr,
        ),
      );
    };

    if (input.signal) {
      if (input.signal.aborted) onAbort();
      else input.signal.addEventListener("abort", onAbort, { once: true });
    }

    const timer = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        /* ignore */
      }
      finish(
        dockerFail(
          "EXTRACT_TIMEOUT",
          `OCR timed out for "${relHint}" after ${Math.round(input.timeoutMs / 1000)}s. ` +
            `Raise extractor-ocr.timeoutSeconds, then retry "knot-sync run".`,
          stdout,
          stderr,
        ),
      );
    }, Math.max(1, input.timeoutMs));

    child.on("error", (err) => {
      clearTimeout(timer);
      const msg = err.message || String(err);
      if (err.message.includes("ENOENT") || /spawn docker/i.test(msg)) {
        finish(
          dockerFail(
            "DOCKER",
            `Docker CLI not found while OCR-ing "${relHint}". ` +
              `Install Docker, pull ${image}, then retry "knot-sync run".`,
            stdout,
            stderr,
          ),
        );
        return;
      }
      finish(
        dockerFail(
          "DOCKER",
          `Docker error while OCR-ing "${relHint}" (${msg}). ` +
            `Start Docker, pull ${image}, then retry "knot-sync run".`,
          stdout,
          stderr,
        ),
      );
    });

    child.on("close", (exitCode) => {
      clearTimeout(timer);
      void (async () => {
        if (settled) return;
        if (exitCode !== 0) {
          finish(classifyDockerFailure(exitCode, stdout, stderr, image, relHint));
          return;
        }
        try {
          let markdown = await readMarkdownFromOutput(input.outputDir);
          if (!markdown.trim() && stdout.trim()) {
            // Fallback: some images print Markdown to stdout.
            markdown = stdout;
          }
          finish({ ok: true, markdown, stdout, stderr });
        } catch (err) {
          finish(
            dockerFail(
              "PARSE",
              `Could not read Docling output for "${relHint}" (${(err as Error).message || String(err)}). ` +
                `Retry "knot-sync run".`,
              stdout,
              stderr,
            ),
          );
        }
      })();
    });
  });
};
