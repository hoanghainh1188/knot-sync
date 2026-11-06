import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import { randomBytes } from "node:crypto";

/** Load or create a 32-byte salt at `saltPath`. */
export function loadOrCreateSalt(saltPath: string): Buffer {
  if (existsSync(saltPath)) {
    const buf = readFileSync(saltPath);
    if (buf.length >= 16) return buf;
    throw new Error(
      `Salt file at ${saltPath} is too short (${buf.length} bytes). ` +
        `Delete it to regenerate, or restore a valid salt backup.`,
    );
  }
  mkdirSync(dirname(saltPath), { recursive: true });
  const salt = randomBytes(32);
  try {
    writeFileSync(saltPath, salt, { mode: 0o600, flag: "wx" });
    return salt;
  } catch {
    // Another process may have created it; reuse if valid.
    if (existsSync(saltPath)) {
      const buf = readFileSync(saltPath);
      if (buf.length >= 16) return buf;
    }
    throw new Error(
      `Could not create salt file at ${saltPath}. Check directory permissions.`,
    );
  }
}
