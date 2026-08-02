import fs from "node:fs/promises";
import path from "node:path";

export async function readPlatformProvenance(root = process.cwd()) {
  const lockPath = path.join(root, "tools", "platform-runtime-provenance-lock.json");
  const lock = JSON.parse(await fs.readFile(lockPath, "utf8"));
  if (lock.schemaVersion !== 1) throw new Error("Unsupported platform provenance lock schema.");
  return lock;
}

export async function lockedPdfiumPlatform(platform, root = process.cwd()) {
  const lock = await readPlatformProvenance(root);
  const entry = lock.pdfium?.platforms?.[platform];
  if (!entry) throw new Error(`Missing locked PDFium provenance for ${platform}.`);
  return {
    ...entry,
    version: lock.pdfium.version,
    tag: lock.pdfium.tag,
    wrapperVersion: lock.pdfium.wrapperVersion,
  };
}

export function assertLockedFile(stat, expectedBytes, label) {
  if (!stat?.isFile() || stat.size !== expectedBytes) {
    throw new Error(`${label}: expected ${expectedBytes} bytes, got ${stat?.size ?? "missing"}.`);
  }
}

export function assertSha256(value, label) {
  if (!/^[a-f0-9]{64}$/u.test(value ?? "")) throw new Error(`${label}: invalid SHA-256.`);
}
