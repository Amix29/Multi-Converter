import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";

export function requireSha256Env(name) {
  const value = process.env[name]?.trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(value ?? "") || /^0{64}$/.test(value ?? "")) {
    throw new Error(`${name} must be set to the expected SHA-256 for this upstream archive.`);
  }
  return value;
}

export async function downloadIfMissingVerified(url, target, expectedSha256, headers = {}) {
  const stat = await fs.stat(target).catch(() => null);
  if (stat?.isFile() && stat.size > 0) {
    await verifySha256(target, expectedSha256, path.basename(target));
    return;
  }

  await download(url, target, headers);
  await verifySha256(target, expectedSha256, path.basename(target));
}

export async function download(url, target, headers = {}) {
  console.log(`Downloading ${publicSourceLabel(url)}`);
  const response = await fetch(url, { headers });
  if (!response.ok || !response.body) {
    throw new Error(`Download failed (${response.status}): ${publicSourceLabel(url)}`);
  }
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temp = `${target}.download`;
  await pipeline(response.body, createWriteStream(temp));
  await fs.rename(temp, target);
}

export async function verifySha256(filePath, expectedSha256, label = filePath) {
  const actual = await sha256File(filePath);
  if (actual !== expectedSha256.toLowerCase()) {
    throw new Error(`${label}: SHA-256 mismatch. Expected ${expectedSha256}, got ${actual}. Delete the cached file and retry only after confirming the source.`);
  }
}

export async function sha256File(filePath) {
  const hash = createHash("sha256");
  await new Promise((resolve, reject) => {
    createReadStream(filePath)
      .on("data", (chunk) => hash.update(chunk))
      .on("error", reject)
      .on("end", resolve);
  });
  return hash.digest("hex");
}

export function publicSourceLabel(value) {
  try {
    const url = new URL(value);
    if (url.protocol === "http:" || url.protocol === "https:") {
      return `${url.origin}${url.pathname}`;
    }
  } catch {
    // Fall through to basename redaction.
  }
  return path.basename(String(value));
}
