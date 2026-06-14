import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import process from "node:process";

const root = process.cwd();
const args = parseArgs(process.argv.slice(2));
const fromLocalAssets = Boolean(args.fromLocalAssets);
const tag = args.tag ?? (fromLocalAssets ? null : fail("Missing --tag <release-tag>."));
const repo = args.repo ?? process.env.GITHUB_REPOSITORY ?? (fromLocalAssets ? null : fail("Missing --repo <owner/name> or GITHUB_REPOSITORY."));
const assetDir = path.resolve(args.assetDir ?? path.join(process.env.RUNNER_TEMP ?? os.tmpdir(), "mc-linux-engine-assets"));
const cacheDir = path.resolve(args.cacheDir ?? path.join(root, "engine-sources", ".bundled-engine-cache"));
const cacheStageDir = path.join(cacheDir, `.linux-stage-${process.pid}`);
const manifestTarget = path.resolve(args.manifest ?? path.join(root, "src-tauri", "engines-manifest.json"));
const manifestAsset = path.join(assetDir, "engines-manifest.json");
const platform = "linux-x64";
const requiredAdvancedEngines = ["pdfium", "libreoffice", "pandoc", "libvips"];

await fs.mkdir(assetDir, { recursive: true });
await fs.mkdir(cacheDir, { recursive: true });
await fs.rm(cacheStageDir, { recursive: true, force: true });
await fs.mkdir(cacheStageDir, { recursive: true });

try {
  await ensureAsset("engines-manifest.json");
  await assertFile(manifestAsset, "downloaded engines-manifest.json");

  const manifest = JSON.parse(await fs.readFile(manifestAsset, "utf8"));
  const engines = (manifest.engines ?? []).filter((engine) => engine.platform === platform);
  if (engines.length === 0) {
    fail(`No ${platform} engine entries found in staged engines-manifest.json.`);
  }
  validateOnlyAdvancedLinuxEngines(engines);

  validateRequiredAdvancedEngineSet(engines);

  const expectedAssetNames = new Set(["engines-manifest.json"]);
  for (const engine of engines) {
    validateEngineEntry(engine);
    expectedAssetNames.add(assetNameFromUrl(engine.downloadUrl));
  }
  if (fromLocalAssets) {
    await assertNoUnexpectedLocalAssets(expectedAssetNames);
  }

  for (const engine of engines) {
    const assetName = assetNameFromUrl(engine.downloadUrl);
    const assetPath = path.join(assetDir, assetName);
    await ensureAsset(assetName);
    await verifySha256(assetPath, engine.sha256, `${engine.id} Linux engine archive`);
    await fs.copyFile(assetPath, path.join(cacheStageDir, `${engine.id}-${engine.version}.zip`));
  }

  for (const engine of engines) {
    await fs.copyFile(path.join(cacheStageDir, `${engine.id}-${engine.version}.zip`), path.join(cacheDir, `${engine.id}-${engine.version}.zip`));
  }

  await writeEmbeddedManifest(manifest, engines);

  const sourceLabel = fromLocalAssets ? assetDir : `${repo}@${tag}`;
  console.log(`Staged ${engines.length} Linux engine archives from ${sourceLabel}.`);
} catch (error) {
  console.error(error?.message ?? String(error));
  process.exitCode = 1;
} finally {
  await fs.rm(cacheStageDir, { recursive: true, force: true });
}

function validateRequiredAdvancedEngineSet(linuxEngines) {
  const embeddedEngines = linuxEngines.filter((engine) => engine.mode === "advanced");
  if (embeddedEngines.length === 0) {
    fail(`No advanced ${platform} engine entries found for the embedded manifest.`);
  }
  const ids = embeddedEngines.map((engine) => engine.id);
  const duplicates = ids.filter((engineId, index) => ids.indexOf(engineId) !== index);
  if (duplicates.length > 0) {
    fail(`Duplicate advanced ${platform} engine entries: ${[...new Set(duplicates)].join(", ")}.`);
  }
  const unexpected = ids.filter((engineId) => !requiredAdvancedEngines.includes(engineId));
  if (unexpected.length > 0) {
    fail(`Unexpected advanced ${platform} engine entries: ${unexpected.join(", ")}.`);
  }
  const embeddedIds = new Set(ids);
  const missing = requiredAdvancedEngines.filter((engineId) => !embeddedIds.has(engineId));
  if (missing.length > 0) {
    fail(`Missing required advanced ${platform} engine entries: ${missing.join(", ")}.`);
  }
}

function validateOnlyAdvancedLinuxEngines(linuxEngines) {
  const nonAdvanced = linuxEngines.filter((engine) => engine.mode !== "advanced");
  if (nonAdvanced.length > 0) {
    fail(`Unexpected non-advanced ${platform} engine entries: ${nonAdvanced.map((engine) => engine.id ?? "<missing-id>").join(", ")}.`);
  }
}

async function writeEmbeddedManifest(sourceManifest, linuxEngines) {
  const embeddedManifest = {
    ...sourceManifest,
    engines: linuxEngines,
  };
  await fs.writeFile(manifestTarget, `${JSON.stringify(embeddedManifest, null, 2)}\n`, "utf8");
}

function validateEngineEntry(engine) {
  if (!engine.id || !engine.version) {
    fail(`Linux engine entry is missing id or version: ${JSON.stringify(engine)}`);
  }
  if (engine.mode !== "advanced" && engine.mode !== "base") {
    fail(`${engine.id}: unexpected engine mode ${engine.mode ?? "<missing>"}.`);
  }
  if (engine.archiveType !== "zip") {
    fail(`${engine.id}: Linux engine archiveType must be zip.`);
  }
  if (!engine.downloadUrl || String(engine.downloadUrl).includes("REPLACE_WITH_RELEASE_BASE_URL")) {
    fail(`${engine.id}: Linux engine downloadUrl is missing or still a placeholder.`);
  }
  if (!/^[a-f0-9]{64}$/i.test(String(engine.sha256 ?? "")) || /^0{64}$/i.test(String(engine.sha256 ?? ""))) {
    fail(`${engine.id}: Linux engine sha256 is missing or placeholder.`);
  }
  for (const relative of engine.binaryPaths ?? []) {
    const normalized = normalizeManifestPath(relative, `${engine.id}: Linux engine binaryPath`);
    if (/\.(app|bat|cmd|dll|dmg|dylib|exe|msi|pkg|ps1)(?:\/|$)/i.test(normalized)) {
      fail(`${engine.id}: Linux engine binaryPaths must not reference non-Linux files (${relative}).`);
    }
  }
}

function normalizeManifestPath(value, label) {
  const normalized = String(value ?? "").replaceAll("\\", "/");
  if (!normalized || normalized.startsWith("/") || /^[A-Za-z]:\//.test(normalized)) {
    fail(`${label} must be a relative path: ${value ?? "<missing>"}.`);
  }
  const parts = normalized.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) {
    fail(`${label} must not contain empty, current or parent path segments: ${value}.`);
  }
  return normalized;
}

function downloadReleaseAsset(pattern) {
  const result = spawnSync("gh", ["release", "download", tag, "--repo", repo, "--pattern", pattern, "--dir", assetDir], {
    cwd: root,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw new Error(`Failed to download Linux engine release asset: ${pattern}`);
  }
}

async function ensureAsset(assetName) {
  const assetPath = path.join(assetDir, assetName);
  if (fromLocalAssets) {
    await assertFile(assetPath, `local Linux engine asset ${assetName}`);
    return;
  }
  await fs.rm(assetPath, { force: true });
  downloadReleaseAsset(assetName);
}

async function assertNoUnexpectedLocalAssets(expectedAssetNames) {
  const entries = await fs.readdir(assetDir, { withFileTypes: true });
  const unexpected = entries
    .filter((entry) => entry.isFile() && !expectedAssetNames.has(entry.name))
    .map((entry) => entry.name)
    .sort();
  if (unexpected.length > 0) {
    fail(`Unexpected local Linux engine assets: ${unexpected.join(", ")}.`);
  }
}

function assetNameFromUrl(url) {
  try {
    const rawName = path.posix.basename(new URL(url).pathname);
    const decoded = decodeURIComponent(rawName);
    if (!decoded || decoded.includes("/") || decoded.includes("\\") || decoded === "." || decoded === "..") {
      fail(`Unsafe Linux engine asset name in downloadUrl: ${url}`);
    }
    return decoded;
  } catch {
    fail(`Invalid Linux engine downloadUrl: ${url}`);
  }
}

async function verifySha256(filePath, expected, label) {
  const actual = await sha256File(filePath);
  if (actual !== expected.toLowerCase()) {
    fail(`${label}: SHA-256 mismatch. Expected ${expected}, got ${actual}.`);
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

async function assertFile(filePath, label) {
  const stat = await fs.stat(filePath).catch(() => null);
  if (!stat?.isFile() || stat.size <= 0) {
    fail(`Missing or empty ${label}: ${filePath}`);
  }
}

function parseArgs(rawArgs) {
  const parsed = {};
  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];
    if (arg === "--tag") parsed.tag = rawArgs[++index];
    else if (arg === "--repo") parsed.repo = rawArgs[++index];
    else if (arg === "--asset-dir") parsed.assetDir = rawArgs[++index];
    else if (arg === "--cache-dir") parsed.cacheDir = rawArgs[++index];
    else if (arg === "--manifest") parsed.manifest = rawArgs[++index];
    else if (arg === "--from-local-assets") parsed.fromLocalAssets = true;
    else fail(`Unknown argument: ${arg}`);
  }
  return parsed;
}

function fail(message) {
  throw new Error(message);
}
