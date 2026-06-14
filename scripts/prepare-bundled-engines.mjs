import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import path from "node:path";
import process from "node:process";
import { pipeline } from "node:stream/promises";
import { spawnSync } from "node:child_process";
import { publicSourceLabel } from "./lib/download-integrity.mjs";
import { readRequiredFfmpegVersion } from "./lib/ffmpeg-version.mjs";

const root = process.cwd();
const platform = process.env.MULTI_CONVERTER_ENGINE_PLATFORM?.trim() || hostEnginePlatform();
const ffmpegVersion = readRequiredFfmpegVersion(root);
const manifestPath = path.join(root, "src-tauri", "engines-manifest.json");
const binariesDir = path.join(root, "src-tauri", "binaries");
const bundledEnginesDir = path.join(root, "src-tauri", "bundled-engines");
const cacheDir = path.join(root, "engine-sources", ".bundled-engine-cache");
const baseSidecars = baseSidecarsForPlatform(platform);
const requireAdvancedEngines = process.env.MULTI_CONVERTER_REQUIRE_ADVANCED_ENGINES === "1";

if (platform === "unsupported") {
  throw new Error(`Plateforme de moteurs non supportee: ${process.platform}/${process.arch}`);
}

await fs.mkdir(binariesDir, { recursive: true });
await fs.mkdir(bundledEnginesDir, { recursive: true });
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
  if (await bundledEngineLooksCurrent(targetRoot, engine)) return;

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
    await assertNoWindowsOnlyResourcesForNonWindowsEngine(rootDir, engine);
    await assertNoBrokenSymlinksForNonWindowsEngine(rootDir, engine);
    return true;
  } catch {
    return false;
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

async function verifyDarwinArch(filePath, arches) {
  if (process.platform !== "darwin") return false;
  const stat = await fs.stat(filePath).catch(() => null);
  if (!stat?.isFile() || stat.size <= 0) return false;
  const required = Array.isArray(arches) ? arches : [arches];
  for (const arch of required) {
    const result = spawnSync("lipo", [filePath, "-verify_arch", arch], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    if (result.status !== 0) return false;
  }
  return true;
}

async function downloadVerified(url, target, expectedSha256, label) {
  try {
    await verifySha256(target, expectedSha256);
    return;
  } catch {
    // Download below.
  }
  console.log(`Downloading ${label}: ${publicSourceLabel(url)}`);
  const response = await fetch(url, { headers: { "User-Agent": "Multi-Converter-Packager" } });
  if (!response.ok || !response.body) {
    throw new Error(`${label}: telechargement impossible (${response.status})`);
  }
  await fs.mkdir(path.dirname(target), { recursive: true });
  await pipeline(response.body, createWriteStream(target));
  await verifySha256(target, expectedSha256);
}

async function verifySha256(filePath, expected) {
  const actual = await sha256File(filePath);
  if (actual !== expected.toLowerCase()) {
    await fs.rm(filePath, { force: true });
    throw new Error(`SHA-256 inattendu pour ${path.relative(root, filePath)}. Attendu ${expected}, obtenu ${actual}.`);
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

async function extractArchive(archive, destination, archiveType = "tar") {
  await fs.rm(destination, { recursive: true, force: true });
  await fs.mkdir(destination, { recursive: true });
  const result = archiveType === "zip"
    ? extractZipArchive(archive, destination)
    : spawnSync("tar", ["-xf", archive, "-C", destination], { stdio: "inherit" });
  if (result.status !== 0) throw new Error(`Extraction impossible : ${archive}`);
}

function extractZipArchive(archive, destination) {
  if (process.platform === "win32") {
    return spawnSync("powershell", ["-NoProfile", "-Command", `Expand-Archive -LiteralPath '${archive.replaceAll("'", "''")}' -DestinationPath '${destination.replaceAll("'", "''")}' -Force`], { stdio: "inherit", windowsHide: true });
  }
  return spawnSync("unzip", ["-q", archive, "-d", destination], { stdio: "inherit" });
}

async function findFile(base, name) {
  const matches = [];
  async function walk(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      if (entry.isFile() && entry.name.toLowerCase() === name.toLowerCase()) matches.push(full);
    }
  }
  await walk(base);
  if (!matches[0]) throw new Error(`Fichier introuvable dans l'archive : ${name}`);
  return matches[0];
}

async function assertFile(filePath, message) {
  const stat = await fs.stat(filePath).catch(() => null);
  if (!stat?.isFile() || stat.size <= 0) throw new Error(message);
}

async function normalizeBundledNoticeText(rootDir, metadata) {
  for (const relative of metadata.noticeFiles ?? []) {
    const noticePath = path.join(rootDir, normalizeArchivePath(relative));
    const content = await fs.readFile(noticePath, "utf8").catch(() => null);
    if (content === null) continue;
    const updated = content.replace(
      /This package is only used by the optional Multi-Converter .+\./g,
      "This package is bundled with Multi-Converter for local advanced conversions.",
    );
    if (updated !== content) {
      await fs.writeFile(noticePath, updated);
    }
  }
}

async function pruneWindowsOnlyResourcesForNonWindowsEngine(rootDir, engine) {
  if (platform === "windows-x64") return;

  const removed = [];
  await walkFiles(rootDir, async (filePath) => {
    if (!isWindowsOnlyResource(filePath)) return;
    await fs.rm(filePath, { force: true });
    removed.push(path.relative(rootDir, filePath).replaceAll(path.sep, "/"));
  });

  if (removed.length) {
    console.log(`${engine.id}: removed ${removed.length} Windows-only resource(s) from ${platform} bundle.`);
  }
}

async function assertNoWindowsOnlyResourcesForNonWindowsEngine(rootDir, engine) {
  if (platform === "windows-x64") return;

  const found = [];
  await walkFiles(rootDir, async (filePath) => {
    if (isWindowsOnlyResource(filePath)) {
      found.push(path.relative(rootDir, filePath).replaceAll(path.sep, "/"));
    }
  });

  if (found.length) {
    throw new Error(`${engine.id}: ressource Windows-only inattendue dans le moteur ${platform}: ${found[0]}`);
  }
}

async function assertNoBrokenSymlinksForNonWindowsEngine(rootDir, engine) {
  if (platform === "windows-x64") return;

  const broken = [];
  await walkEntries(rootDir, async (filePath, entry) => {
    if (!entry.isSymbolicLink()) return;
    const stat = await fs.stat(filePath).catch(() => null);
    if (!stat) {
      broken.push(path.relative(rootDir, filePath).replaceAll(path.sep, "/"));
    }
  });

  if (broken.length) {
    throw new Error(`${engine.id}: lien symbolique casse dans le moteur ${platform}: ${broken[0]}`);
  }
}

async function pruneLibreOfficeOptionalLinuxBackends(rootDir, engine) {
  if (platform !== "linux-x64" || engine.id !== "libreoffice") return;
  const optionalBackends = [
    "program/libkf5be1lo.so",
    "program/libvclplug_kf5lo.so",
    "program/libvclplug_qt5lo.so",
    "program/libvclplug_qt6lo.so",
    "program/libvclplug_gtk3lo.so",
    "program/libvclplug_gtk3_kde5lo.so",
    "program/libvclplug_gtk4lo.so",
    "program/lo_gtk3filepicker",
    "program/lo_gtk4filepicker",
    "program/lo_kde5filepicker",
    "program/lo_qt5filepicker",
    "program/lo_qt6filepicker",
    "program/libavmediagtk.so",
    "program/libavmediagst.so",
    "program/libavmediaqt6.so",
    "program/libdeploymentgui.so",
    "program/liblibreofficekitgtk.so",
    "program/libofficebean.so",
  ];
  const removed = [];
  for (const relative of optionalBackends) {
    const filePath = path.join(rootDir, relative);
    const stat = await fs.stat(filePath).catch(() => null);
    if (!stat?.isFile()) continue;
    await fs.rm(filePath, { force: true });
    removed.push(relative);
  }
  const optionalPythonModulePattern =
    /^program\/python-core-[^/]+\/lib\/lib-dynload\/_crypt\.cpython-[^/]+\.so$/;
  await walkFiles(path.join(rootDir, "program"), async (filePath) => {
    const relative = path.relative(rootDir, filePath).replaceAll(path.sep, "/");
    if (!optionalPythonModulePattern.test(relative)) return;
    await fs.rm(filePath, { force: true });
    removed.push(relative);
  });
  if (removed.length) {
    console.log(`${engine.id}: removed ${removed.length} optional Linux UI backend(s) from headless bundle.`);
  }
}

async function walkFiles(startDir, visit) {
  const entries = await fs.readdir(startDir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const full = path.join(startDir, entry.name);
    if (entry.isDirectory()) {
      await walkFiles(full, visit);
    } else if (entry.isFile()) {
      await visit(full);
    }
  }
}

async function walkEntries(startDir, visit) {
  const entries = await fs.readdir(startDir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const full = path.join(startDir, entry.name);
    await visit(full, entry);
    if (entry.isDirectory()) {
      await walkEntries(full, visit);
    }
  }
}

function isWindowsOnlyResource(filePath) {
  return /\.(bat|cmd|dll|exe|msi|ps1)$/i.test(filePath);
}

function isPlaceholderUrl(url) {
  return String(url).includes("REPLACE_WITH_RELEASE_BASE_URL");
}

function isPlaceholderSha(value) {
  return !/^[a-f0-9]{64}$/i.test(String(value)) || /^0{64}$/i.test(String(value));
}

function hostEnginePlatform() {
  if (process.platform === "win32" && process.arch === "x64") return "windows-x64";
  if (process.platform === "darwin") return "macos-universal";
  if (process.platform === "linux" && process.arch === "x64") return "linux-x64";
  return "unsupported";
}

function baseSidecarsForPlatform(targetPlatform) {
  if (targetPlatform === "windows-x64") {
    return [
      {
        id: "ffmpeg",
        fileName: "ffmpeg-x86_64-pc-windows-msvc.exe",
        localCandidates: [
          path.join(process.env.LOCALAPPDATA ?? "", "Multi-Converter", "tool-env", "ffmpeg", ffmpegVersion, "bin", "ffmpeg-x86_64-pc-windows-msvc.exe"),
          path.join(root, "engine-sources", "windows-x64", "ffmpeg", "bin", "ffmpeg-x86_64-pc-windows-msvc.exe"),
        ],
      },
      {
        id: "ffprobe",
        fileName: "ffprobe-x86_64-pc-windows-msvc.exe",
        localCandidates: [
          path.join(process.env.LOCALAPPDATA ?? "", "Multi-Converter", "tool-env", "ffprobe", ffmpegVersion, "bin", "ffprobe-x86_64-pc-windows-msvc.exe"),
          path.join(root, "engine-sources", "windows-x64", "ffprobe", "bin", "ffprobe-x86_64-pc-windows-msvc.exe"),
        ],
      },
    ];
  }

  if (targetPlatform === "macos-universal") {
    const nativeTriple = nativeDarwinTriple();
    return ["aarch64-apple-darwin", "x86_64-apple-darwin"].flatMap((targetTriple) => [
      {
        id: "ffmpeg",
        fileName: `ffmpeg-${targetTriple}`,
        smoke: process.platform === "darwin" && targetTriple === nativeTriple,
        lipoArch: targetTriple === "aarch64-apple-darwin" ? "arm64" : "x86_64",
        localCandidates: [
          path.join(process.env.HOME ?? "", "Library", "Application Support", "Multi-Converter", "tool-env", "ffmpeg", ffmpegVersion, "bin", `ffmpeg-${targetTriple}`),
          path.join(root, "engine-sources", "macos-universal", "ffmpeg", "bin", `ffmpeg-${targetTriple}`),
        ],
      },
      {
        id: "ffprobe",
        fileName: `ffprobe-${targetTriple}`,
        smoke: process.platform === "darwin" && targetTriple === nativeTriple,
        lipoArch: targetTriple === "aarch64-apple-darwin" ? "arm64" : "x86_64",
        localCandidates: [
          path.join(process.env.HOME ?? "", "Library", "Application Support", "Multi-Converter", "tool-env", "ffprobe", ffmpegVersion, "bin", `ffprobe-${targetTriple}`),
          path.join(root, "engine-sources", "macos-universal", "ffprobe", "bin", `ffprobe-${targetTriple}`),
        ],
      },
    ]);
  }

  if (targetPlatform === "linux-x64") {
    return [
      {
        id: "ffmpeg",
        fileName: "ffmpeg-x86_64-unknown-linux-gnu",
        localCandidates: [
          path.join(process.env.HOME ?? "", ".local", "share", "Multi-Converter", "tool-env", "ffmpeg", ffmpegVersion, "bin", "ffmpeg-x86_64-unknown-linux-gnu"),
          path.join(root, "engine-sources", "linux-x64", "ffmpeg", "bin", "ffmpeg-x86_64-unknown-linux-gnu"),
        ],
      },
      {
        id: "ffprobe",
        fileName: "ffprobe-x86_64-unknown-linux-gnu",
        localCandidates: [
          path.join(process.env.HOME ?? "", ".local", "share", "Multi-Converter", "tool-env", "ffprobe", ffmpegVersion, "bin", "ffprobe-x86_64-unknown-linux-gnu"),
          path.join(root, "engine-sources", "linux-x64", "ffprobe", "bin", "ffprobe-x86_64-unknown-linux-gnu"),
        ],
      },
    ];
  }

  return [];
}

function nativeDarwinTriple() {
  return process.arch === "arm64" ? "aarch64-apple-darwin" : "x86_64-apple-darwin";
}

async function ensureEngineExecutables(rootDir, engine) {
  if (platform === "windows-x64") return;
  for (const relative of engine.binaryPaths ?? []) {
    await ensureExecutable(path.join(rootDir, normalizeArchivePath(relative)));
  }
}

async function configureLinuxEngineRpaths(rootDir, engine) {
  if (platform !== "linux-x64" || process.platform !== "linux" || engine.id !== "libvips") return;
  const libDir = path.join(rootDir, "lib");
  if (!(await isDirectory(libDir))) return;

  const elfFiles = [];
  await walkFiles(rootDir, async (filePath) => {
    if (await isElfFile(filePath)) elfFiles.push(filePath);
  });

  for (const filePath of elfFiles) {
    const result = spawnSync("patchelf", ["--set-rpath", linuxRpathFor(filePath, libDir), filePath], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    if (result.status !== 0) {
      throw new Error(`${engine.id}: impossible de configurer le RPATH Linux pour ${path.relative(rootDir, filePath)} (${result.stderr || result.stdout})`);
    }
  }
}

function linuxRpathFor(filePath, libDir) {
  const relative = path.relative(path.dirname(filePath), libDir).replaceAll(path.sep, "/");
  return relative ? `$ORIGIN/${relative}` : "$ORIGIN";
}

async function isElfFile(filePath) {
  const handle = await fs.open(filePath, "r").catch(() => null);
  if (!handle) return false;
  try {
    const header = Buffer.alloc(4);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    return bytesRead === 4 && header[0] === 0x7f && header[1] === 0x45 && header[2] === 0x4c && header[3] === 0x46;
  } finally {
    await handle.close();
  }
}

async function isDirectory(filePath) {
  const stat = await fs.stat(filePath).catch(() => null);
  return stat?.isDirectory() === true;
}

async function ensureExecutable(filePath) {
  if (platform === "windows-x64") return;
  await fs.chmod(filePath, 0o755).catch(() => {});
}

function normalizeArchivePath(relative) {
  const normalized = String(relative).replaceAll("\\", "/");
  if (!normalized || normalized.startsWith("/") || normalized.includes("//")) {
    throw new Error(`Chemin invalide dans l'archive : ${relative}`);
  }
  const parts = normalized.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) {
    throw new Error(`Chemin ambigu dans l'archive : ${relative}`);
  }
  return normalized;
}
