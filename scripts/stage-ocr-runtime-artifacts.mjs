import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const args = parseArgs(process.argv.slice(2));
const target = args.platform;
if (!target || !args.runtimeDir || !args.modelsDir) {
  throw new Error("Utilisation: --platform macos-universal|linux-x64 --runtime-dir <dossier> --models-dir <dossier>");
}

const expectedPlatforms = target === "macos-universal"
  ? ["macos-aarch64", "macos-x86_64"]
  : target === "linux-x64" ? ["linux-x64"] : null;
if (!expectedPlatforms) throw new Error(`Cible OCR invalide: ${target}`);

const runtimeSource = path.resolve(args.runtimeDir);
const modelsSource = path.resolve(args.modelsDir);
const runtimeDestination = path.join(root, "src-tauri", "ocr-resources", "runtime");
const modelsDestination = path.join(root, "src-tauri", "ocr-resources", "models");
const lockPath = path.join(root, "src-tauri", "ocr-runtime-lock.json");
const lock = JSON.parse(await fs.readFile(lockPath, "utf8"));

await rejectUnexpectedRuntimeFiles(runtimeSource, expectedPlatforms);
for (const platform of expectedPlatforms) await verifyRuntimeArtifact(runtimeSource, platform, lock);
await verifyModels(modelsSource, lock.modelArtifact);

await replaceDirectory(runtimeDestination, runtimeSource, expectedPlatforms.map((platform) => `${platform}.zip`));
await replaceDirectory(modelsDestination, modelsSource, ["models-lock.json", ...await modelFiles(modelsSource)]);

for (const platform of expectedPlatforms) {
  const selectionPath = path.join(runtimeSource, `${platform}.selection.json`);
  const staged = JSON.parse(await fs.readFile(selectionPath, "utf8"));
  const selection = lock.platformSelections.find((entry) => entry.platform === platform);
  selection.artifact = staged.artifact;
  selection.archive = staged.archive;
}
await fs.writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`);

console.log(`OCR resources staged for ${target}: ${expectedPlatforms.join(", ")}; shared model set verified.`);

function parseArgs(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === "--platform") parsed.platform = values[++index];
    else if (value === "--runtime-dir") parsed.runtimeDir = values[++index];
    else if (value === "--models-dir") parsed.modelsDir = values[++index];
    else throw new Error(`Argument de staging OCR inconnu: ${value}`);
  }
  return parsed;
}

async function rejectUnexpectedRuntimeFiles(directory, platforms) {
  const allowed = new Set(platforms.flatMap((platform) => [`${platform}.zip`, `${platform}.selection.json`]));
  const entries = await fs.readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile() || !allowed.has(entry.name)) {
      throw new Error(`Artefact OCR étranger ou ambigu: ${entry.name}`);
    }
  }
  if (entries.length !== allowed.size) throw new Error("Jeu d’artefacts OCR incomplet.");
}

async function verifyRuntimeArtifact(directory, platform, lockFile) {
  const archivePath = path.join(directory, `${platform}.zip`);
  const selectionPath = path.join(directory, `${platform}.selection.json`);
  await assertRegularFile(archivePath);
  await assertRegularFile(selectionPath);
  const staged = JSON.parse(await fs.readFile(selectionPath, "utf8"));
  const locked = lockFile.platformSelections.find((entry) => entry.platform === platform);
  if (!locked || staged.schemaVersion !== 1 || staged.platform !== platform) {
    throw new Error(`${platform}: sélection OCR invalide.`);
  }
  for (const key of ["runtime", "provider", "executable"]) {
    if (staged[key] !== locked[key]) throw new Error(`${platform}: contrat ${key} différent du verrou.`);
  }
  const stat = await fs.stat(archivePath);
  if (staged.archive?.bytes !== stat.size || staged.archive?.sha256 !== await sha256(archivePath)) {
    throw new Error(`${platform}: taille ou SHA-256 de l’archive invalide.`);
  }
  if (!Number.isInteger(staged.artifact?.fileCount) || staged.artifact.fileCount < 1
      || !Number.isInteger(staged.artifact?.totalBytes) || staged.artifact.totalBytes < 1
      || !isSha256(staged.artifact?.aggregateSha256)) {
    throw new Error(`${platform}: manifeste de contenu incomplet.`);
  }
}

async function verifyModels(directory, expected) {
  const manifestPath = path.join(directory, "models-lock.json");
  await assertRegularFile(manifestPath);
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  for (const key of ["fileCount", "totalBytes", "aggregateSha256"]) {
    if (manifest[key] !== expected[key]) throw new Error(`Modèles OCR: ${key} différent du verrou.`);
  }
  const actualFiles = await collectRegularFiles(directory, "models-lock.json");
  if (actualFiles.length !== manifest.files.length) throw new Error("Modèles OCR: nombre de fichiers inattendu.");
  for (const entry of manifest.files) {
    const normalized = safeRelative(entry.path);
    const filePath = path.join(directory, ...normalized.split("/"));
    await assertRegularFile(filePath);
    const stat = await fs.stat(filePath);
    if (stat.size !== entry.bytes || await sha256(filePath) !== entry.sha256) {
      throw new Error(`Modèle OCR modifié: ${normalized}`);
    }
  }
}

async function modelFiles(directory) {
  return collectRegularFiles(directory, "models-lock.json");
}

async function collectRegularFiles(directory, omitted = "") {
  const result = [];
  async function walk(relative = "") {
    const current = path.join(directory, relative);
    for (const entry of await fs.readdir(current, { withFileTypes: true })) {
      const child = path.join(relative, entry.name);
      if (entry.isDirectory()) await walk(child);
      else if (entry.isFile() && child !== omitted) result.push(child);
      else if (!entry.isFile()) throw new Error(`Entrée OCR non régulière: ${child}`);
    }
  }
  await walk();
  return result.sort((left, right) => left.localeCompare(right, "en"));
}

async function replaceDirectory(destination, source, relativeFiles) {
  const parent = path.dirname(destination);
  const staging = `${destination}.phase8-staging-${process.pid}`;
  await fs.rm(staging, { recursive: true, force: true });
  await fs.mkdir(staging, { recursive: true });
  try {
    for (const relative of relativeFiles) {
      const safe = safeRelative(relative.replaceAll("\\", "/"));
      const sourcePath = path.join(source, ...safe.split("/"));
      const destinationPath = path.join(staging, ...safe.split("/"));
      await assertRegularFile(sourcePath);
      await fs.mkdir(path.dirname(destinationPath), { recursive: true });
      await fs.copyFile(sourcePath, destinationPath);
    }
    await fs.mkdir(parent, { recursive: true });
    await fs.rm(destination, { recursive: true, force: true });
    await fs.rename(staging, destination);
  } catch (error) {
    await fs.rm(staging, { recursive: true, force: true });
    throw error;
  }
}

function safeRelative(value) {
  if (!value || value.includes("\\") || value.includes("\0") || value.startsWith("/")
      || /^[A-Za-z]:/.test(value) || value.split("/").includes("..")) {
    throw new Error(`Chemin OCR dangereux: ${value}`);
  }
  return value;
}

async function assertRegularFile(filePath) {
  const stat = await fs.lstat(filePath).catch(() => null);
  if (!stat?.isFile() || stat.isSymbolicLink() || stat.size === 0) {
    throw new Error(`Fichier OCR absent ou non régulier: ${filePath}`);
  }
}

async function sha256(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

function isSha256(value) {
  return /^[a-f0-9]{64}$/.test(value ?? "");
}
