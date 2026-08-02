import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

if (process.platform !== "win32") throw new Error("Le candidat PyInstaller ciblé se construit uniquement sur Windows x64.");
const root = process.cwd();
const buildRoot = path.join(root, "engine-sources", "ocr-runtime-candidate", "windows-x64");
const defaultPython = path.join(root, "engine-sources", "ocr-runtime", "windows-x64", ".venv", "Scripts", "python.exe");
const python = path.resolve(process.env.MULTI_CONVERTER_OCR_BUILD_PYTHON ?? defaultPython);
const spec = path.join(root, "tools", "ocr-runtime", "worker-targeted.spec");
const reference = path.join(root, "engine-sources", "ocr-runtime", "windows-x64", "dist", "ocr-worker");
const output = path.join(buildRoot, "dist", "ocr-worker");
await assertFile(python, "Python OCR verrouillé");
await assertDirectory(reference, "runtime OCR officiel de référence");
await fs.mkdir(buildRoot, { recursive: true });

const build = spawnSync(python, [
  "-m", "PyInstaller", "--noconfirm", "--clean", "--distpath", path.join(buildRoot, "dist"),
  "--workpath", path.join(buildRoot, "build"), spec,
], { cwd: root, stdio: "inherit", windowsHide: true });
if (build.status !== 0) throw new Error(`Construction du candidat OCR en échec (${build.status ?? "signal"}).`);

const environment = path.dirname(path.dirname(python));
const sitePackages = path.join(environment, "Lib", "site-packages");
const internal = path.join(output, "_internal");
for (const entry of await fs.readdir(sitePackages, { withFileTypes: true })) {
  if (entry.isDirectory() && entry.name.endsWith(".dist-info")) {
    await fs.cp(path.join(sitePackages, entry.name), path.join(internal, entry.name), { recursive: true, force: true });
  }
}

const [referenceMeasure, candidateMeasure] = await Promise.all([measure(reference), measure(output)]);
const installedGain = 1 - candidateMeasure.totalBytes / referenceMeasure.totalBytes;
const report = {
  schemaVersion: 1,
  platform: "windows-x64",
  createdAt: new Date().toISOString(),
  reference: referenceMeasure,
  candidate: candidateMeasure,
  installedGain,
  minimumGain: 0.10,
  sizeGatePassed: installedGain >= 0.10,
  selection: "reference",
  selectionReason: "Le candidat reste rejeté tant que le corpus, les erreurs, les PDF hybrides, l’annulation et la reprise ne sont pas tous validés.",
};
const reportPath = path.join(root, "test-results", "phase-6", "ocr-runtime-candidate.json");
await fs.mkdir(path.dirname(reportPath), { recursive: true });
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`OCR targeted candidate: ${formatBytes(candidateMeasure.totalBytes)} vs ${formatBytes(referenceMeasure.totalBytes)} (${(installedGain * 100).toFixed(2)} % gain).`);
console.log(`Production selection unchanged: official Phase 5 runtime (${report.sizeGatePassed ? "quality gates pending" : "size gate missed"}).`);

async function measure(directory) {
  const entries = [];
  await walk(directory, directory, entries);
  entries.sort((left, right) => left.path.localeCompare(right.path));
  const aggregate = createHash("sha256");
  for (const entry of entries) aggregate.update(`${entry.path}\0${entry.bytes}\0${entry.sha256}\n`);
  return {
    path: path.relative(root, directory).replaceAll("\\", "/"),
    fileCount: entries.length,
    totalBytes: entries.reduce((total, entry) => total + entry.bytes, 0),
    aggregateSha256: aggregate.digest("hex"),
  };
}

async function walk(base, current, entries) {
  for (const item of await fs.readdir(current, { withFileTypes: true })) {
    const fullPath = path.join(current, item.name);
    if (item.isDirectory()) await walk(base, fullPath, entries);
    else if (item.isFile()) {
      const bytes = await fs.readFile(fullPath);
      entries.push({
        path: path.relative(base, fullPath).replaceAll("\\", "/"),
        bytes: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      });
    }
  }
}

function formatBytes(value) {
  return `${(value / 1024 / 1024).toFixed(1)} MiB`;
}

async function assertFile(filePath, label) {
  const stat = await fs.stat(filePath).catch(() => null);
  if (!stat?.isFile()) throw new Error(`${label} absent: ${filePath}`);
}

async function assertDirectory(filePath, label) {
  const stat = await fs.stat(filePath).catch(() => null);
  if (!stat?.isDirectory()) throw new Error(`${label} absent: ${filePath}`);
}
