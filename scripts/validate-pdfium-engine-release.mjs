import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { download, sha256File } from "./lib/download-integrity.mjs";
import { extractZip } from "./lib/engine-package-files.mjs";
import {
  assertX64Pe,
  readPdfiumLock,
  validateLockedPdfiumTree,
  validatePdfiumLock,
  validatePdfiumZipEntries,
} from "./lib/pdfium-package.mjs";
import { inspectZipEntries } from "./lib/zip-inspection.mjs";

const root = process.cwd();
const args = process.argv.slice(2);

if (args.includes("--self-test")) await selfTest();
else await validateRelease();

async function validateRelease() {
  requireWindows();
  const lock = await readPdfiumLock(root);
  const temporary = args.includes("--download") ? await fs.mkdtemp(path.join(os.tmpdir(), "mc-pdfium-release-download-")) : null;
  const assetDir = temporary ?? path.resolve(requiredOption("--dir"));
  try {
    if (temporary) await downloadAssets(lock, temporary);
    const expectedNames = [lock.package.archiveName, `${lock.package.archiveName}.sha256`, "engines-manifest.json"].sort();
    const entries = (await fs.readdir(assetDir, { withFileTypes: true }));
    const actualNames = entries.filter((entry) => entry.isFile()).map((entry) => entry.name).sort();
    if (entries.some((entry) => !entry.isFile()) || JSON.stringify(actualNames) !== JSON.stringify(expectedNames)) {
      throw new Error(`Jeu d'assets PDFium invalide: ${actualNames.join(", ")}.`);
    }
    const archive = path.join(assetDir, lock.package.archiveName);
    const checksum = (await fs.readFile(`${archive}.sha256`, "utf8")).trim();
    const actualSha256 = await sha256File(archive);
    if (checksum !== `${actualSha256}  ${lock.package.archiveName}`) throw new Error("Fichier SHA-256 PDFium invalide.");
    const manifest = JSON.parse(await fs.readFile(path.join(assetDir, "engines-manifest.json"), "utf8"));
    if (manifest.manifestVersion !== 1 || manifest.engines?.length !== 1 || manifest.engines[0].id !== "pdfium") {
      throw new Error("Le manifeste de prerelease doit contenir uniquement PDFium.");
    }
    const engine = manifest.engines[0];
    if (engine.downloadUrl !== `${lock.package.releaseBaseUrl}${lock.package.archiveName}`) throw new Error("URL PDFium de prerelease invalide.");
    if (engine.sha256 !== actualSha256 || engine.compressedSizeBytes !== (await fs.stat(archive)).size) {
      throw new Error("Empreinte ou taille PDFium incoherente dans le manifeste.");
    }
    const inspection = validatePdfiumZipEntries(inspectZipEntries(archive));
    if (inspection.expandedBytes !== engine.installedSizeBytes) throw new Error("Taille installee PDFium incoherente.");
    const extractDir = path.join(assetDir, ".validated-pdfium");
    await extractZip(archive, extractDir);
    try {
      await validateMetadata(extractDir, engine);
      await validateLockedPdfiumTree(extractDir, lock, path.join(root, "tests", "fixtures", "ocr", "phase-6"));
    } finally {
      await fs.rm(extractDir, { recursive: true, force: true });
    }
    console.log(`PDFium engine release assets validated: ${actualSha256} (${engine.compressedSizeBytes} bytes).`);
  } finally {
    if (temporary) await fs.rm(temporary, { recursive: true, force: true });
  }
}

async function validateMetadata(engineRoot, engine) {
  const metadata = JSON.parse(await fs.readFile(path.join(engineRoot, "engine.json"), "utf8"));
  const lock = await readPdfiumLock(root);
  for (const field of ["engineId", "displayName", "version", "platform", "mode", "healthCheck", "licenseName", "createdAt", "packageFormatVersion"]) {
    const expected = field === "engineId"
      ? engine.id
      : field === "createdAt"
        ? lock.package.deterministicTimestamp
        : field === "packageFormatVersion"
          ? 1
          : engine[field];
    if (metadata[field] !== expected) throw new Error(`engine.json PDFium: ${field} invalide.`);
  }
  if (JSON.stringify(metadata.binaryPaths) !== JSON.stringify(engine.binaryPaths)) throw new Error("engine.json PDFium: binaryPaths invalides.");
  if (!metadata.licenseFiles?.length || !metadata.noticeFiles?.length) throw new Error("engine.json PDFium: licences ou notices absentes.");
}

async function downloadAssets(lock, destination) {
  for (const name of [lock.package.archiveName, `${lock.package.archiveName}.sha256`, "engines-manifest.json"]) {
    await download(`${lock.package.releaseBaseUrl}${name}`, path.join(destination, name), { "User-Agent": "Multi-Converter-PDFium-Validator" });
  }
}

async function selfTest() {
  const lock = await readPdfiumLock(root);
  assert.doesNotThrow(() => validatePdfiumLock(lock));
  assert.throws(() => validatePdfiumLock({ ...lock, platform: "linux-x64" }));
  assert.throws(() => validatePdfiumZipEntries([{ name: "../escape", length: 1, compressedLength: 1, externalAttributes: 0 }]));
  assert.throws(() => validatePdfiumZipEntries([
    { name: "bin/tool.exe", length: 1, compressedLength: 1, externalAttributes: 0 },
    { name: "BIN/TOOL.EXE", length: 1, compressedLength: 1, externalAttributes: 0 },
  ]));
  assert.throws(() => validatePdfiumZipEntries([{ name: "bin/link", length: 1, compressedLength: 1, externalAttributes: 0xa000 << 16 }]));
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "mc-pdfium-validator-self-test-"));
  try {
    const invalidPe = path.join(temporary, "invalid.exe");
    await fs.writeFile(invalidPe, Buffer.alloc(128));
    await assert.rejects(() => assertX64Pe(invalidPe, "fixture"));
  } finally {
    await fs.rm(temporary, { recursive: true, force: true });
  }
  console.log("PDFium release validator self-test passed.");
}

function requiredOption(name) {
  const index = args.indexOf(name);
  if (index < 0 || !args[index + 1]) throw new Error(`${name} est requis.`);
  return args[index + 1];
}

function requireWindows() {
  if (process.platform !== "win32" || process.arch !== "x64") throw new Error("La validation PDFium native Phase 7 exige Windows x64.");
}
