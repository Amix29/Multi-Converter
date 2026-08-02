import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { readRequiredFfmpegVersion } from "./lib/ffmpeg-version.mjs";
import { createBundledEngineHelpers, hostEnginePlatform } from "./lib/bundled-engine-files.mjs";
import { readPdfiumLock, validateLockedPdfiumTree } from "./lib/pdfium-package.mjs";

const root = process.cwd();
const platform = process.env.MULTI_CONVERTER_ENGINE_PLATFORM?.trim() || hostEnginePlatform();
const ffmpegVersion = readRequiredFfmpegVersion(root);
const {
  assertFile,
  assertNoBrokenSymlinksForNonWindowsEngine,
  assertNoWindowsOnlyResourcesForNonWindowsEngine,
  baseSidecarsForPlatform,
  configureLinuxEngineRpaths,
  downloadVerified,
  ensureEngineExecutables,
  extractArchive,
  findFile,
  isPlaceholderSha,
  isPlaceholderUrl,
  normalizeArchivePath,
  normalizeBundledNoticeText,
  pruneLibreOfficeOptionalLinuxBackends,
  pruneWindowsOnlyResourcesForNonWindowsEngine,
  sha256File,
  verifyDarwinArch,
  verifyExpectedFileSha256: verifySha256,
} = createBundledEngineHelpers({ root, platform, ffmpegVersion });
const manifestPath = path.join(root, "src-tauri", "engines-manifest.json");
const binariesDir = path.join(root, "src-tauri", "binaries");
const bundledEnginesDir = path.join(root, "src-tauri", "bundled-engines");
const bundledEngineArchivesDir = path.join(root, "src-tauri", "bundled-engine-archives");
const cacheDir = path.join(root, "engine-sources", ".bundled-engine-cache");
const baseSidecars = baseSidecarsForPlatform(platform);
const requireAdvancedEngines = process.env.MULTI_CONVERTER_REQUIRE_ADVANCED_ENGINES === "1";
const pdfiumLock = platform === "windows-x64" ? await readPdfiumLock(root) : null;
const pdfiumFixtureRoot = path.join(root, "tests", "fixtures", "ocr", "phase-6");

if (platform === "unsupported") {
  throw new Error(`Plateforme de moteurs non supportee: ${process.platform}/${process.arch}`);
}

await fs.mkdir(binariesDir, { recursive: true });
await fs.mkdir(bundledEnginesDir, { recursive: true });
await fs.mkdir(bundledEngineArchivesDir, { recursive: true });
await fs.mkdir(cacheDir, { recursive: true });

const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
const byId = new Map((manifest.engines ?? []).map((engine) => [engine.id, engine]));
const advancedEngines = bundledAdvancedEngines(manifest);

for (const item of baseSidecars) {
  await prepareBaseSidecar(item);
}
await prepareDerivedSidecars(platform);
await pruneBundledEngines(advancedEngines);

for (const engine of advancedEngines) {
  await prepareBundledEngine(engine);
}

if (requireAdvancedEngines && advancedEngines.length === 0) {
  throw new Error(`No advanced bundled engines declared for ${platform}; strict release preparation requires platform-specific advanced engines.`);
}

if (platform !== "windows-x64" && advancedEngines.length === 0) {
  console.warn(`No advanced bundled engines declared for ${platform}; advanced conversions will stay unavailable on this platform.`);
}

console.log(`Bundled conversion engines are ready for ${platform}.`);

async function prepareBaseSidecar(item) {
  const target = path.join(binariesDir, item.fileName);
  if (await sidecarLooksCurrent(target, item)) return;

  const local = await firstExisting(item.localCandidates);
  if (local) {
    await fs.copyFile(local, target);
    await ensureExecutable(target);
    if (await sidecarLooksCurrent(target, item)) return;
  }

  const engine = byId.get(item.id) ?? embeddedBaseEngine(item.id);
  if (!engine?.downloadUrl || !engine?.sha256) {
    throw new Error(`${item.id}: source absente du manifeste et fallback interne indisponible.`);
  }
  const archive = path.join(cacheDir, `${item.id}.zip`);
  await downloadVerified(engine.downloadUrl, archive, engine.sha256, item.id);
  const extractDir = path.join(cacheDir, `${item.id}-extract`);
  await extractArchive(archive, extractDir, engine.archiveType);
  const source = await findFile(extractDir, item.fileName);
  await fs.copyFile(source, target);
  await ensureExecutable(target);
  if (!(await sidecarLooksCurrent(target, item))) {
    throw new Error(`${item.id}: le binaire prepare ne repond pas avec la version attendue.`);
  }
}

async function prepareDerivedSidecars(targetPlatform) {
  if (targetPlatform !== "macos-universal") return;
  if (process.platform !== "darwin") {
    throw new Error("macOS universal sidecars must be prepared and architecture-verified on macOS.");
  }

  for (const stem of ["ffmpeg", "ffprobe"]) {
    const universalTarget = path.join(binariesDir, `${stem}-universal-apple-darwin`);
    if (await sidecarLooksCurrent(universalTarget, { id: stem, smoke: true, lipoArch: ["arm64", "x86_64"] })) continue;

    const universalSource = await firstExisting([
      path.join(process.env.HOME ?? "", "Library", "Application Support", "Multi-Converter", "tool-env", stem, ffmpegVersion, "bin", `${stem}-universal-apple-darwin`),
      path.join(root, "engine-sources", "macos-universal", stem, "bin", `${stem}-universal-apple-darwin`),
    ]);
    if (universalSource) {
      await fs.copyFile(universalSource, universalTarget);
      await ensureExecutable(universalTarget);
      if (await sidecarLooksCurrent(universalTarget, { id: stem, smoke: true, lipoArch: ["arm64", "x86_64"] })) continue;
    }

    const arm64Source = path.join(binariesDir, `${stem}-aarch64-apple-darwin`);
    const x64Source = path.join(binariesDir, `${stem}-x86_64-apple-darwin`);
    await createUniversalDarwinBinary(stem, arm64Source, x64Source, universalTarget);
    if (!(await sidecarLooksCurrent(universalTarget, { id: stem, smoke: true, lipoArch: ["arm64", "x86_64"] }))) {
      throw new Error(`${stem}: le sidecar universel macOS prepare ne repond pas avec la version attendue.`);
    }
  }
}

async function createUniversalDarwinBinary(stem, arm64Source, x64Source, universalTarget) {
  const missing = [];
  for (const filePath of [arm64Source, x64Source]) {
    const stat = await fs.stat(filePath).catch(() => null);
    if (!stat?.isFile()) missing.push(path.relative(root, filePath));
  }
  if (missing.length) {
    throw new Error(`${stem}: impossible de creer le sidecar universel macOS, fichiers manquants: ${missing.join(", ")}`);
  }

  await fs.rm(universalTarget, { force: true });
  const result = spawnSync("lipo", ["-create", arm64Source, x64Source, "-output", universalTarget], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(`${stem}: creation du sidecar universel macOS impossible: ${result.stderr || result.stdout}`);
  }
  await ensureExecutable(universalTarget);
}

async function prepareBundledEngine(engine) {
  const targetRoot = path.join(bundledEnginesDir, engine.id, engine.version);
  if (await bundledEngineLooksCurrent(targetRoot, engine)) {
    await stageCompressedBundledEngine(engine);
    return;
  }

  if (!engine.downloadUrl || !engine.sha256 || isPlaceholderUrl(engine.downloadUrl) || isPlaceholderSha(engine.sha256)) {
    throw new Error(`${engine.id}: archive publiee non configuree dans src-tauri/engines-manifest.json.`);
  }

  const archive = path.join(cacheDir, `${engine.id}-${engine.version}.zip`);
  await downloadVerified(engine.downloadUrl, archive, engine.sha256, engine.id);
  const extractDir = path.join(cacheDir, `${engine.id}-${engine.version}-extract`);
  await extractArchive(archive, extractDir, engine.archiveType);
  await pruneWindowsOnlyResourcesForNonWindowsEngine(extractDir, engine);
  await verifyPackageMetadata(extractDir, engine);
  await verifyExpectedFiles(extractDir, engine);

  await fs.rm(targetRoot, { recursive: true, force: true });
  await fs.mkdir(path.dirname(targetRoot), { recursive: true });
  await fs.cp(extractDir, targetRoot, { recursive: true, force: true });
  await pruneLibreOfficeOptionalLinuxBackends(targetRoot, engine);
  await ensureEngineExecutables(targetRoot, engine);
  await configureLinuxEngineRpaths(targetRoot, engine);
  await assertNoBrokenSymlinksForNonWindowsEngine(targetRoot, engine);

  if (!(await bundledEngineLooksCurrent(targetRoot, engine))) {
    throw new Error(`${engine.id}: le moteur embarque prepare est incomplet.`);
  }
  await stageCompressedBundledEngine(engine);
}

async function stageCompressedBundledEngine(engine) {
  if (platform !== "windows-x64" || engine.id !== "libreoffice") return;
  const source = path.join(cacheDir, `${engine.id}-${engine.version}.zip`);
  await verifySha256(source, engine.sha256);
  const platformDir = path.join(bundledEngineArchivesDir, platform);
  const target = path.join(platformDir, `${engine.id}.zip`);
  await fs.mkdir(platformDir, { recursive: true });
  const current = await sha256File(target).catch(() => null);
  if (current !== engine.sha256.toLowerCase()) await fs.copyFile(source, target);
}

async function pruneBundledEngines(expectedEngines) {
  const expectedRoots = new Set(expectedEngines.map((engine) => `${engine.id}/${engine.version}`));
  const entries = await fs.readdir(bundledEnginesDir, { withFileTypes: true }).catch(() => []);

  for (const entry of entries) {
    const engineDir = path.join(bundledEnginesDir, entry.name);
    if (!entry.isDirectory()) {
      await removeBundledPath(engineDir);
      continue;
    }

    const versionEntries = await fs.readdir(engineDir, { withFileTypes: true }).catch(() => []);
    for (const versionEntry of versionEntries) {
      const relative = `${entry.name}/${versionEntry.name}`;
      const versionDir = path.join(engineDir, versionEntry.name);
      if (!versionEntry.isDirectory() || !expectedRoots.has(relative)) {
        await removeBundledPath(versionDir);
      }
    }

    const remaining = await fs.readdir(engineDir).catch(() => []);
    if (remaining.length === 0) {
      await removeBundledPath(engineDir);
    }
  }
}

async function removeBundledPath(target) {
  assertInsideDirectory(target, bundledEnginesDir);
  await fs.rm(target, { recursive: true, force: true });
}

function assertInsideDirectory(candidate, parent) {
  const resolvedCandidate = path.resolve(candidate);
  const resolvedParent = path.resolve(parent);
  const relative = path.relative(resolvedParent, resolvedCandidate);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Refusing to remove path outside bundled engines: ${resolvedCandidate}`);
  }
}

function bundledAdvancedEngines(value) {
  return (value.engines ?? []).filter((engine) => engine.platform === platform && engine.mode === "advanced");
}

function embeddedBaseEngine(id) {
  if (platform !== "windows-x64") return null;
  const release = "https://github.com/Amix29/Multi-Converter/releases/download/engines-v0.1.0-alpha.0";
  const fallback = {
    ffmpeg: {
      downloadUrl: `${release}/ffmpeg-${ffmpegVersion}-windows-x64.zip`,
      sha256: "665f9b32924c3250138503d09df75c280be803a0fc3d8ae8fb2d9c972a061133",
    },
    ffprobe: {
      downloadUrl: `${release}/ffprobe-${ffmpegVersion}-windows-x64.zip`,
      sha256: "b8faf8c447a10b142dd8124852424094b5c6686cc97a4a297d4440660ca9cd64",
    },
  };
  return fallback[id];
}

async function verifyPackageMetadata(rootDir, engine) {
  const metadataPath = path.join(rootDir, "engine.json");
  const metadata = JSON.parse(await fs.readFile(metadataPath, "utf8"));
  const checks = [
    ["engineId", metadata.engineId, engine.id],
    ["displayName", metadata.displayName, engine.displayName],
    ["version", metadata.version, engine.version],
    ["platform", metadata.platform, engine.platform],
    ["healthCheck", metadata.healthCheck, engine.healthCheck],
    ["licenseName", metadata.licenseName, engine.licenseName],
  ];
  for (const [field, actual, expected] of checks) {
    if (actual !== expected) {
      throw new Error(`${engine.id}: engine.json invalide (${field}: ${actual ?? "<absent>"} au lieu de ${expected}).`);
    }
  }
  if (metadata.mode !== engine.mode) {
    metadata.mode = engine.mode;
    await fs.writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
  }
  if (JSON.stringify(metadata.binaryPaths ?? []) !== JSON.stringify(engine.binaryPaths ?? [])) {
    throw new Error(`${engine.id}: engine.json invalide (binaryPaths different).`);
  }
  if (!Array.isArray(metadata.licenseFiles) || metadata.licenseFiles.length === 0) {
    throw new Error(`${engine.id}: engine.json ne declare aucune licence.`);
  }
  for (const relative of metadata.licenseFiles) {
    await assertFile(path.join(rootDir, normalizeArchivePath(relative)), `${engine.id}: licence absente (${relative}).`);
  }
  for (const relative of metadata.noticeFiles ?? []) {
    await assertFile(path.join(rootDir, normalizeArchivePath(relative)), `${engine.id}: notice absente (${relative}).`);
  }
  await normalizeBundledNoticeText(rootDir, metadata);
}

async function verifyExpectedFiles(rootDir, engine) {
  for (const relative of engine.binaryPaths ?? []) {
    await assertFile(path.join(rootDir, normalizeArchivePath(relative)), `${engine.id}: binaire attendu absent (${relative}).`);
  }
}

async function bundledEngineLooksCurrent(rootDir, engine) {
  try {
    const stat = await fs.stat(rootDir);
    if (!stat.isDirectory()) return false;
    await verifyPackageMetadata(rootDir, engine);
    await verifyExpectedFiles(rootDir, engine);
    await validateLockedAdvancedEngine(rootDir, engine);
    await assertNoWindowsOnlyResourcesForNonWindowsEngine(rootDir, engine);
    await assertNoBrokenSymlinksForNonWindowsEngine(rootDir, engine);
    return true;
  } catch {
    return false;
  }
}

async function validateLockedAdvancedEngine(rootDir, engine) {
  if (engine.id === "pdfium" && engine.platform === "windows-x64") {
    await validateLockedPdfiumTree(rootDir, pdfiumLock, pdfiumFixtureRoot);
  }
}

async function firstExisting(candidates) {
  for (const candidate of candidates.filter(Boolean)) {
    try {
      const stat = await fs.stat(candidate);
      if (stat.isFile() && stat.size > 0) return candidate;
    } catch {
      // Try next candidate.
    }
  }
  return null;
}

async function binaryLooksCurrent(filePath) {
  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile() || stat.size <= 0) return false;
  } catch {
    return false;
  }
  const result = spawnSync(filePath, ["-version"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
    timeout: 30000,
  });
  const text = `${result.stdout || result.stderr}`;
  return result.status === 0 && text.includes(ffmpegVersion);
}

async function sidecarLooksCurrent(filePath, item) {
  if (item.lipoArch && !(await verifyDarwinArch(filePath, item.lipoArch))) {
    return false;
  }
  if (item.smoke === false) {
    const stat = await fs.stat(filePath).catch(() => null);
    return Boolean(stat?.isFile() && stat.size > 0);
  }
  return binaryLooksCurrent(filePath);
}
