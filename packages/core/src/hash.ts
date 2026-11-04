import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";

export function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** Stream a file through sha256 so large files do not load into memory. */
export function sha256File(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(path);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

/** Stable document id from source + location. */
export function documentId(sourceId: string, location: string): string {
  return sha256(`${sourceId}\u0000${location}`).slice(0, 32);
}
