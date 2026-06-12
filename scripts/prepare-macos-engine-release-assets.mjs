import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import process from "node:process";

const root = process.cwd();
const args = parseArgs(process.argv.slice(2));
const tag = args.tag ?? fail("Missing --tag <release-tag>.");
const repo = args.repo ?? process.env.GITHUB_REPOSITORY ?? fail("Missing --repo <owner/name> or GITHUB_REPOSITORY.");
const assetDir = path.resolve(args.assetDir ?? path.join(process.env.RUNNER_TEMP ?? os.tmpdir(), "mc-macos-engine-assets"));
const cacheDir = path.resolve(args.cacheDir ?? path.join(root, "engine-sources", ".bundled-engine-cache"));
const manifestTarget = path.resolve(args.manifest ?? path.join(root, "src-tauri", "engines-manifest.json"));
const manifestAsset = path.join(assetDir, "engines-manifest.json");

await fs.mkdir(assetDir, { recursive: true });
await fs.mkdir(cacheDir, { recursive: true });
await fs.rm(manifestAsset, { force: true });

downloadReleaseAsset("engines-manifest.json");
await assertFile(manifestAsset, "downloaded engines-manifest.json");
await fs.copyFile(manifestAsset, manifestTarget);

const manifest = JSON.parse(await fs.readFile(manifestTarget, "utf8"));
const engines = (manifest.engines ?? []).filter((engine) => engine.platform === "macos-universal");
if (engines.length === 0) {
  fail("No macos-universal engine entries found in staged engines-manifest.json.");
}

for (const engine of engines) {
  validateEngineEntry(engine);
  const assetName = assetNameFromUrl(engine.downloadUrl);
  const assetPath = path.join(assetDir, assetName);
  await fs.rm(assetPath, { force: true });
  downloadReleaseAsset(assetName);
  await verifySha256(assetPath, engine.sha256, `${engine.id} macOS engine archive`);
  await fs.copyFile(assetPath, path.join(cacheDir, `${engine.id}-${engine.version}.zip`));
}

console.log(`Staged ${engines.length} macOS engine archives from ${repo}@${tag}.`);

function validateEngineEntry(engine) {
  if (!engine.id || !engine.version) {
    fail(`macOS engine entry is missing id or version: ${JSON.stringify(engine)}`);
  }
  if (engine.mode !== "advanced" && engine.mode !== "base") {
    fail(`${engine.id}: unexpected engine mode ${engine.mode ?? "<missing>"}.`);
  }
  if (engine.archiveType !== "zip") {
    fail(`${engine.id}: macOS engine archiveType must be zip.`);
  }
  if (!engine.downloadUrl || String(engine.downloadUrl).includes("REPLACE_WITH_RELEASE_BASE_URL")) {
    fail(`${engine.id}: macOS engine downloadUrl is missing or still a placeholder.`);
  }
  if (!/^[a-f0-9]{64}$/i.test(String(engine.sha256 ?? "")) || /^0{64}$/i.test(String(engine.sha256 ?? ""))) {
    fail(`${engine.id}: macOS engine sha256 is missing or placeholder.`);
  }
}

function downloadReleaseAsset(pattern) {
  const result = spawnSync("gh", ["release", "download", tag, "--repo", repo, "--pattern", pattern, "--dir", assetDir], {
    cwd: root,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function assetNameFromUrl(url) {
  try {
    return decodeURIComponent(path.posix.basename(new URL(url).pathname));
  } catch {
    fail(`Invalid macOS engine downloadUrl: ${url}`);
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
    else fail(`Unknown argument: ${arg}`);
  }
  return parsed;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
