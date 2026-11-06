import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { ConfigError } from "@hoanghainh/knot-sync-core";
import {
  renderScanReportHtml,
  type HtmlReportInput,
} from "@hoanghainh/knot-sync-report-html";

export const DEFAULT_REPORT_PATH = "./knot-sync-scan-report.html";

/**
 * Ensure bare `--report` gets the default path so parseArgs(string) succeeds.
 */
export function normalizeReportArgv(argv: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--report") {
      const next = argv[i + 1];
      if (!next || next.startsWith("-")) {
        out.push("--report", DEFAULT_REPORT_PATH);
      } else {
        out.push("--report", next);
        i += 1;
      }
    } else if (a.startsWith("--report=")) {
      const v = a.slice("--report=".length);
      out.push("--report", v === "" ? DEFAULT_REPORT_PATH : v);
    } else {
      out.push(a);
    }
  }
  return out;
}

/** Refuse writing a report under any configured source root. */
export function assertReportPathOutsideSources(
  reportPath: string,
  sourcePaths: string[],
): string {
  const abs = resolve(reportPath);
  for (const src of sourcePaths) {
    const srcAbs = resolve(src);
    const prefix = srcAbs.endsWith(sep) ? srcAbs : srcAbs + sep;
    if (abs === srcAbs || abs.startsWith(prefix)) {
      throw new ConfigError(
        `Refusing to write HTML report inside source path "${src}". ` +
          `Choose a path outside configured sources (e.g. ${DEFAULT_REPORT_PATH}).`,
      );
    }
  }
  return abs;
}

export async function writeScanReportHtml(
  reportPath: string,
  input: HtmlReportInput,
): Promise<string> {
  const abs = resolve(reportPath);
  await mkdir(dirname(abs), { recursive: true });
  const html = renderScanReportHtml(input);
  await writeFile(abs, html, "utf8");
  return abs;
}
