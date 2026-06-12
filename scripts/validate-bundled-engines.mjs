import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const manifestPath = path.join(root, "src-tauri", "engines-manifest.json");
const bundledEnginesDir = path.join(root, "src-tauri", "bundled-engines");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const expectedVersion = "8.1.1";
const platform = process.env.MULTI_CONVERTER_ENGINE_PLATFORM?.trim() || hostEnginePlatform();
const baseBinaries = baseBinariesForPlatform(platform);

const errors = [];

if (platform === "unsupported") {
  errors.push(`Plateforme de moteurs non supportee: ${process.platform}/${process.arch}`);
}

for (const item of baseBinaries) {
  if (item.smoke === false) validateFile(item.id, item.filePath);
  else validateExecutable(item.id, item.filePath, item.args, item.expectedText);
}

for (const engine of bundledAdvancedEngines(manifest)) {
  const engineRoot = path.join(root, "src-tauri", "bundled-engines", engine.id, engine.version);
  validateEngineMetadata(engineRoot, engine);
  for (const relative of engine.binaryPaths ?? []) {
    validateFile(engine.id, path.join(engineRoot, normalizeArchivePath(relative)));
  }
  validateEngineSmoke(engineRoot, engine);
}

validateNoStaleBundledEngines(manifest);

if (errors.length) {
  console.error("Bundled engine validation failed:");
  for (const error of errors) console.error(`- ${error}`);
  console.error(`Run \`npm run prepare:bundled-engines\` to restore the bundled engines for ${platform}.`);
  process.exit(1);
}

if (platform !== "windows-x64" && bundledAdvancedEngines(manifest).length === 0) {
  console.warn(`No advanced bundled engines declared for ${platform}; advanced conversions are not validated on this platform.`);
}

console.log(`Bundled engine validation OK for ${platform}`);

function bundledAdvancedEngines(value) {
  return (value.engines ?? []).filter((engine) => engine.platform === platform && engine.mode === "advanced");
}

function validateNoStaleBundledEngines(value) {
  if (!fs.existsSync(bundledEnginesDir)) return;
  const expectedRoots = new Set(bundledAdvancedEngines(value).map((engine) => `${engine.id}/${engine.version}`));
  for (const engineEntry of fs.readdirSync(bundledEnginesDir, { withFileTypes: true })) {
    const enginePath = path.join(bundledEnginesDir, engineEntry.name);
    if (!engineEntry.isDirectory()) {
      errors.push(`ressource moteur inattendue pour ${platform} (${path.relative(root, enginePath)})`);
      continue;
    }
    const versionEntries = fs.readdirSync(enginePath, { withFileTypes: true });
    if (versionEntries.length === 0) {
      errors.push(`dossier moteur vide ou hors plateforme pour ${platform} (${path.relative(root, enginePath)})`);
      continue;
    }
    for (const versionEntry of versionEntries) {
      const relative = `${engineEntry.name}/${versionEntry.name}`;
      const versionPath = path.join(enginePath, versionEntry.name);
      if (!versionEntry.isDirectory() || !expectedRoots.has(relative)) {
        errors.push(`moteur embarque hors plateforme pour ${platform} (${path.relative(root, versionPath)})`);
      }
    }
  }
}

function validateEngineMetadata(engineRoot, engine) {
  const metadataPath = path.join(engineRoot, "engine.json");
  if (!validateFile(engine.id, metadataPath)) return;
  let metadata;
  try {
    metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
  } catch (error) {
    errors.push(`${engine.id}: engine.json illisible (${error.message})`);
    return;
  }
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
      errors.push(`${engine.id}: engine.json ${field} inattendu (${actual ?? "<absent>"} au lieu de ${expected})`);
    }
  }
  if (metadata.mode !== engine.mode) {
    errors.push(`${engine.id}: engine.json mode inattendu (${metadata.mode ?? "<absent>"})`);
  }
  if (JSON.stringify(metadata.binaryPaths ?? []) !== JSON.stringify(engine.binaryPaths ?? [])) {
    errors.push(`${engine.id}: engine.json binaryPaths ne correspond pas au manifeste`);
  }
  if (!Array.isArray(metadata.licenseFiles) || metadata.licenseFiles.length === 0) {
    errors.push(`${engine.id}: engine.json ne declare aucune licence`);
  }
  for (const relative of metadata.licenseFiles ?? []) {
    validateFile(engine.id, path.join(engineRoot, normalizeArchivePath(relative)));
  }
  for (const relative of metadata.noticeFiles ?? []) {
    validateFile(engine.id, path.join(engineRoot, normalizeArchivePath(relative)));
  }
}

function validateEngineSmoke(engineRoot, engine) {
  const executable = primaryExecutable(engineRoot, engine);
  if (!executable) {
    errors.push(`${engine.id}: executable principal introuvable`);
    return;
  }
  if (engine.id === "libreoffice") {
    return;
  }
  const smoke = {
    pdfium: ["--check"],
    pandoc: ["--version"],
    libvips: ["--version"],
  }[engine.id];
  if (smoke) validateExecutable(engine.id, executable, smoke, null, path.dirname(executable));
}

function primaryExecutable(engineRoot, engine) {
  const candidates = (engine.binaryPaths ?? [])
    .map((relative) => path.join(engineRoot, normalizeArchivePath(relative)))
    .filter((candidate) => fs.existsSync(candidate));
  return candidates.sort((left, right) => executableScore(right) - executableScore(left))[0] ?? null;
}

function executableScore(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (process.platform !== "win32" && extension === "") return 2;
  if (extension === ".exe") return 2;
  if (extension === ".com") return 1;
  return 0;
}

function validateExecutable(id, filePath, args, expectedText, cwd = path.dirname(filePath)) {
  if (!validateFile(id, filePath)) return;
  const result = spawnSync(filePath, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
    timeout: 30000,
  });
  if (result.status !== 0) {
    errors.push(`${id}: ${args.join(" ")} echoue (${result.stderr || result.stdout || "aucun detail"})`);
    return;
  }
  if (expectedText) {
    const firstLine = `${result.stdout || result.stderr}`.split(/\r?\n/).find(Boolean) ?? "";
    if (!firstLine.includes(expectedText)) {
      errors.push(`${id}: version inattendue (${firstLine || "sortie vide"}), attendu ${expectedText}`);
    }
  }
}

function validateFile(id, filePath) {
  if (!fs.existsSync(filePath)) {
    errors.push(`${id}: fichier absent (${path.relative(root, filePath)})`);
    return false;
  }
  const stat = fs.statSync(filePath);
  if (!stat.isFile() || stat.size <= 0) {
    errors.push(`${id}: fichier vide ou invalide (${path.relative(root, filePath)})`);
    return false;
  }
  if (platform !== "windows-x64" && (stat.mode & 0o111) === 0) {
    errors.push(`${id}: fichier non executable (${path.relative(root, filePath)})`);
    return false;
  }
  return true;
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

function hostEnginePlatform() {
  if (process.platform === "win32" && process.arch === "x64") return "windows-x64";
  if (process.platform === "darwin") return "macos-universal";
  if (process.platform === "linux" && process.arch === "x64") return "linux-x64";
  return "unsupported";
}

function baseBinariesForPlatform(targetPlatform) {
  if (targetPlatform === "windows-x64") {
    return [
      {
        id: "ffmpeg",
        filePath: path.join(root, "src-tauri", "binaries", "ffmpeg-x86_64-pc-windows-msvc.exe"),
        args: ["-version"],
        expectedText: expectedVersion,
      },
      {
        id: "ffprobe",
        filePath: path.join(root, "src-tauri", "binaries", "ffprobe-x86_64-pc-windows-msvc.exe"),
        args: ["-version"],
        expectedText: expectedVersion,
      },
    ];
  }

  if (targetPlatform === "macos-universal") {
    const nativeTriple = process.arch === "arm64" ? "aarch64-apple-darwin" : "x86_64-apple-darwin";
    return ["ffmpeg", "ffprobe"].flatMap((stem) => [
      ...["aarch64-apple-darwin", "x86_64-apple-darwin"].map((targetTriple) => ({
        id: `${stem}-${targetTriple}`,
        filePath: path.join(root, "src-tauri", "binaries", `${stem}-${targetTriple}`),
        args: ["-version"],
        expectedText: expectedVersion,
        smoke: process.platform === "darwin" && targetTriple === nativeTriple,
      })),
      {
        id: `${stem}-universal-apple-darwin`,
        filePath: path.join(root, "src-tauri", "binaries", `${stem}-universal-apple-darwin`),
        args: ["-version"],
        expectedText: expectedVersion,
        smoke: process.platform === "darwin",
      },
    ]);
  }

  return [];
}
