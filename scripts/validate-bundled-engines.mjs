import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const manifestPath = path.join(root, "src-tauri", "engines-manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const expectedVersion = "8.1.1";
const baseBinaries = [
  ["ffmpeg", path.join(root, "src-tauri", "binaries", "ffmpeg-x86_64-pc-windows-msvc.exe"), ["-version"], expectedVersion],
  ["ffprobe", path.join(root, "src-tauri", "binaries", "ffprobe-x86_64-pc-windows-msvc.exe"), ["-version"], expectedVersion],
];

const errors = [];

for (const [id, filePath, args, expectedText] of baseBinaries) {
  validateExecutable(id, filePath, args, expectedText);
}

for (const engine of bundledAdvancedEngines(manifest)) {
  const engineRoot = path.join(root, "src-tauri", "bundled-engines", engine.id, engine.version);
  validateEngineMetadata(engineRoot, engine);
  for (const relative of engine.binaryPaths ?? []) {
    validateFile(engine.id, path.join(engineRoot, normalizeArchivePath(relative)));
  }
  validateEngineSmoke(engineRoot, engine);
}

if (errors.length) {
  console.error("Bundled engine validation failed:");
  for (const error of errors) console.error(`- ${error}`);
  console.error("Run `npm run prepare:bundled-engines` to restore the Windows x64 bundled engines.");
  process.exit(1);
}

console.log("Bundled engine validation OK");

function bundledAdvancedEngines(value) {
  return (value.engines ?? []).filter((engine) => engine.platform === "windows-x64" && engine.mode === "advanced");
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
