import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const args = parseArgs(process.argv.slice(2));
const platform = args.platform ?? "windows-x64";
const lock = JSON.parse(
  await fs.readFile(path.join(root, "src-tauri", "ocr-runtime-lock.json"), "utf8"),
);
const selection = lock.platformSelections.find((value) => value.platform === platform);
if (!selection) throw new Error(`Plateforme OCR inconnue: ${platform}`);

const sourceDir = path.resolve(
  args.sourceDir ??
    path.join(root, "engine-sources", "ocr-runtime", platform, "dist", "ocr-worker"),
);
const defaultRuntimeRoot = path.join(root, "src-tauri", "ocr-resources", "runtime");
const outputRoot = path.resolve(args.outputDir ?? defaultRuntimeRoot);
const outputArchive = path.join(outputRoot, `${platform}.zip`);
const executableName = path.basename(selection.executable);
await assertFile(path.join(sourceDir, executableName), "exécutable OCR source");

const staging = await fs.mkdtemp(path.join(os.tmpdir(), "multi-converter-ocr-runtime-"));
try {
  await fs.cp(sourceDir, staging, { recursive: true, force: true });
  const files = await collectFiles(staging);
  const entries = [];
  let totalBytes = 0;
  for (const relativePath of files) {
    const filePath = path.join(staging, relativePath);
    const stat = await fs.stat(filePath);
    totalBytes += stat.size;
    entries.push({ path: portable(relativePath), bytes: stat.size, sha256: await sha256(filePath) });
  }
  const aggregateSha256 = aggregate(entries);
  const manifest = {
    schemaVersion: 1,
    platform,
    runtime: selection.runtime,
    provider: selection.provider,
    versions: lock.versions,
    executable: executableName,
    fileCount: entries.length,
    totalBytes,
    aggregateSha256,
    files: entries,
  };
  await fs.writeFile(
    path.join(staging, "runtime-manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  const temporaryArchive = path.join(os.tmpdir(), `multi-converter-ocr-runtime-${process.pid}.zip`);
  await fs.rm(temporaryArchive, { force: true });
  createStoredZip(staging, temporaryArchive);
  if (!args.outputDir) {
    await fs.rm(defaultRuntimeRoot, { recursive: true, force: true });
  } else {
    await fs.rm(outputArchive, { force: true });
  }
  await fs.mkdir(outputRoot, { recursive: true });
  await fs.rename(temporaryArchive, outputArchive);
  await fs.rm(staging, { recursive: true, force: true });
  console.log(
    `OCR runtime prepared in ${path.relative(root, outputArchive)} (${entries.length} files, ${totalBytes} bytes, ${aggregateSha256}).`,
  );
} catch (error) {
  await fs.rm(staging, { recursive: true, force: true });
  throw error;
}

function createStoredZip(sourceDir, archivePath) {
  if (process.platform === "win32") {
    const script = [
      "Add-Type -AssemblyName System.IO.Compression.FileSystem",
      "[System.IO.Compression.ZipFile]::CreateFromDirectory($env:MC_OCR_ZIP_SOURCE, $env:MC_OCR_ZIP_TARGET, [System.IO.Compression.CompressionLevel]::Optimal, $false)",
    ].join("; ");
    const result = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
      env: { ...process.env, MC_OCR_ZIP_SOURCE: sourceDir, MC_OCR_ZIP_TARGET: archivePath },
      stdio: "inherit",
    });
    if (result.status !== 0) throw new Error("Création de l’archive OCR Windows impossible.");
    return;
  }
  const result = spawnSync("zip", ["-9qry", archivePath, "."], { cwd: sourceDir, stdio: "inherit" });
  if (result.status !== 0) throw new Error("Création de l’archive OCR impossible.");
}

function parseArgs(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === "--platform") parsed.platform = values[++index];
    else if (value === "--source-dir") parsed.sourceDir = values[++index];
    else if (value === "--output-dir") parsed.outputDir = values[++index];
    else throw new Error(`Argument runtime OCR inconnu: ${value}`);
  }
  return parsed;
}

async function collectFiles(directory, relative = "") {
  const entries = await fs.readdir(path.join(directory, relative), { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name, "en"))) {
    const child = path.join(relative, entry.name);
    if (entry.isDirectory()) files.push(...(await collectFiles(directory, child)));
    else if (entry.isFile()) files.push(child);
    else throw new Error(`Le runtime OCR contient une entrée non régulière: ${child}`);
  }
  return files;
}

async function sha256(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

function aggregate(entries) {
  const hash = createHash("sha256");
  for (const entry of entries) hash.update(`${entry.path}\0${entry.bytes}\0${entry.sha256}\n`);
  return hash.digest("hex");
}

function portable(value) {
  return value.split(path.sep).join("/");
}

async function assertFile(filePath, label) {
  const stat = await fs.stat(filePath).catch(() => null);
  if (!stat?.isFile() || stat.size === 0) throw new Error(`${label} absent ou vide: ${filePath}`);
}
