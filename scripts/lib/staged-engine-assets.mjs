import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

const COMPATIBILITY_FIELDS = [
  "id",
  "displayName",
  "mode",
  "version",
  "platform",
  "archiveType",
  "binaryPaths",
  "healthCheck",
  "licenseName",
  "licenseUrl",
  "noticeFiles",
  "required",
  "dependencies",
];

export async function loadStagedEngineAssets({ assetDir, platform, embeddedEngines }) {
  if (!assetDir) return new Map();
  const root = path.resolve(assetDir);
  await assertDirectory(root, "staged engine asset directory");

  const manifestPath = path.join(root, "engines-manifest.json");
  await assertRegularFile(manifestPath, "staged engine manifest");
  const manifest = await readJson(manifestPath);
  if (!Array.isArray(manifest.engines)) {
    throw new Error("Staged engine manifest must contain an engines array.");
  }

  const embeddedByKey = new Map(
    embeddedEngines.map((engine) => [engineKey(engine), engine]),
  );
  const staged = new Map();
  for (const entry of manifest.engines.filter((engine) => engine.platform === platform)) {
    const key = engineKey(entry);
    const embedded = embeddedByKey.get(key);
    if (!embedded) {
      throw new Error(`Unexpected staged engine identity: ${key}.`);
    }
    if (staged.has(entry.id)) {
      throw new Error(`Duplicate staged engine entry: ${entry.id}.`);
    }
    assertCompatibleEntry(entry, embedded);
    assertSha256(entry.sha256, `${entry.id}: staged SHA-256`);
    if (!Number.isSafeInteger(entry.compressedSizeBytes) || entry.compressedSizeBytes <= 0) {
      throw new Error(`${entry.id}: staged compressed size is invalid.`);
    }

    const archiveName = safeAssetName(entry.downloadUrl);
    const archivePath = path.join(root, archiveName);
    assertInside(root, archivePath);
    const stat = await assertRegularFile(archivePath, `${entry.id}: staged archive`);
    if (stat.size !== entry.compressedSizeBytes) {
      throw new Error(
        `${entry.id}: staged archive size mismatch (expected ${entry.compressedSizeBytes}, got ${stat.size}).`,
      );
    }
    const actual = await sha256File(archivePath);
    if (actual !== entry.sha256.toLowerCase()) {
      throw new Error(`${entry.id}: staged archive SHA-256 mismatch.`);
    }
    staged.set(entry.id, { archivePath, entry });
  }

  if (staged.size === 0) {
    throw new Error(`Staged engine manifest contains no ${platform} engine.`);
  }
  return staged;
}

function assertCompatibleEntry(staged, embedded) {
  for (const field of COMPATIBILITY_FIELDS) {
    if (JSON.stringify(staged[field] ?? null) !== JSON.stringify(embedded[field] ?? null)) {
      throw new Error(`${staged.id}: staged manifest changes protected field ${field}.`);
    }
  }
}

function engineKey(engine) {
  const id = String(engine?.id ?? "");
  const version = String(engine?.version ?? "");
  const platform = String(engine?.platform ?? "");
  if (!id || !version || !platform) {
    throw new Error("Engine entries must declare id, version and platform.");
  }
  return `${platform}/${id}/${version}`;
}

function safeAssetName(value) {
  if (typeof value !== "string" || !value || value.includes("\\") || /[\r\n\0]/u.test(value)) {
    throw new Error(`Unsafe staged engine archive URL: ${value ?? "<missing>"}.`);
  }
  const withoutQuery = value.split(/[?#]/u, 1)[0];
  let name;
  try {
    name = decodeURIComponent(path.posix.basename(withoutQuery));
  } catch {
    throw new Error(`Invalid encoded staged engine archive URL: ${value}.`);
  }
  if (!name || name.includes("/") || name.includes("\\") || name === "." || name === "..") {
    throw new Error(`Unsafe staged engine archive name: ${value}.`);
  }
  return name;
}

async function assertDirectory(directory, label) {
  const stat = await fs.lstat(directory).catch(() => null);
  if (!stat?.isDirectory() || stat.isSymbolicLink()) {
    throw new Error(`Missing, linked or invalid ${label}: ${directory}.`);
  }
  return stat;
}

async function assertRegularFile(filePath, label) {
  const stat = await fs.lstat(filePath).catch(() => null);
  if (!stat?.isFile() || stat.isSymbolicLink() || stat.size <= 0) {
    throw new Error(`Missing, linked or invalid ${label}: ${filePath}.`);
  }
  return stat;
}

function assertInside(parent, candidate) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Staged engine archive escapes its asset directory: ${candidate}.`);
  }
}

function assertSha256(value, label) {
  if (!/^[a-f0-9]{64}$/iu.test(String(value ?? "")) || /^0{64}$/u.test(String(value))) {
    throw new Error(`${label} is missing or invalid.`);
  }
}

async function readJson(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    throw new Error(`Invalid staged engine manifest: ${error.message}`);
  }
}

async function sha256File(filePath) {
  const hash = createHash("sha256");
  await new Promise((resolve, reject) => {
    createReadStream(filePath)
      .on("data", (chunk) => hash.update(chunk))
      .on("error", reject)
      .on("end", resolve);
  });
  return hash.digest("hex");
}
