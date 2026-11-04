#!/usr/bin/env node
// node:sqlite still prints an ExperimentalWarning on Node 22.
// Hide only that one warning so users are not alarmed; keep all others.
const originalEmitWarning = process.emitWarning.bind(process);
process.emitWarning = ((warning: string | Error, ...rest: unknown[]) => {
  const text = typeof warning === "string" ? warning : warning.message;
  if (text.includes("SQLite is an experimental feature")) return;
  return (originalEmitWarning as (...a: unknown[]) => void)(warning, ...rest);
}) as typeof process.emitWarning;

// When output is piped into a command that exits early (e.g. `| head`),
// stop quietly instead of crashing with EPIPE.
for (const stream of [process.stdout, process.stderr]) {
  stream.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EPIPE") process.exit(0);
    throw err;
  });
}

const { main } = await import("./main.js");
process.exitCode = await main(process.argv.slice(2));
