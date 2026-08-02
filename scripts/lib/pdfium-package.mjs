import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { normalizeZipPath, sha256File } from "./engine-package-files.mjs";

const EXPECTED_MACHINE = 0x8664;
const MAX_ARCHIVE_ENTRIES = 20_000;
const MAX_EXPANDED_BYTES = 64 * 1024 * 1024;
const MAX_COMPRESSION_RATIO = 1_000;

export async function readPdfiumLock(root) {
  const lockPath = path.join(root, "tools", "pdfium-windows-x64.lock.json");
  const lock = JSON.parse(await fs.readFile(lockPath, "utf8"));
  validatePdfiumLock(lock);
  return lock;
}

export function validatePdfiumLock(lock) {
  if (lock.schemaVersion !== 1 || lock.platform !== "windows-x64") throw new Error("Verrou PDFium Windows x64 invalide.");
  if (lock.upstream?.version !== "149.0.7825.0" || lock.upstream?.releaseTag !== "chromium/7825") {
    throw new Error("Version PDFium verrouillee inattendue.");
  }
  for (const [label, value] of [
    ["archive PDFium", lock.upstream?.archiveSha256],
    ["DLL PDFium", lock.upstream?.librarySha256],
  ]) {
    if (!/^[a-f0-9]{64}$/.test(value ?? "")) throw new Error(`${label}: SHA-256 invalide.`);
  }
  if (lock.wrapper?.version !== "0.3.0" || lock.wrapper?.target !== "x86_64-pc-windows-msvc") {
    throw new Error("Wrapper PDFium verrouille inattendu.");
  }
  if (lock.wrapper.buildRustVersion !== "1.96.0" || lock.wrapper.linker !== "rust-lld" || !/^[a-f0-9]{64}$/.test(lock.wrapper.cargoLockSha256 ?? "")) {
    throw new Error("Toolchain ou Cargo.lock PDFium non verrouille.");
  }
  if (lock.wrapper.binarySizeBytes !== 969_216 || !/^[a-f0-9]{64}$/.test(lock.wrapper.binarySha256 ?? "")) {
    throw new Error("Binaire du wrapper PDFium non verrouille.");
  }
  if (lock.package?.archiveName !== "pdfium-compatible-windows-x64.zip") throw new Error("Nom d'archive PDFium inattendu.");
  if (lock.package?.releaseTag !== "engines-v0.1.1-alpha.0") throw new Error("Tag de prerelease PDFium inattendu.");
  const expectedBase = `https://github.com/Amix29/Multi-Converter/releases/download/${lock.package.releaseTag}/`;
  if (lock.package.releaseBaseUrl !== expectedBase) throw new Error("URL de prerelease PDFium inattendue.");
  const timestamp = new Date(lock.package.deterministicTimestamp);
  if (!Number.isFinite(timestamp.valueOf()) || timestamp.getUTCFullYear() < 1980) throw new Error("Horodatage deterministe PDFium invalide.");
  if (!/^[a-f0-9]{64}$/.test(lock.package.archiveSha256 ?? "") || !Number.isSafeInteger(lock.package.archiveSizeBytes)) {
    throw new Error("Archive finale PDFium non verrouillee.");
  }
}

export async function validateLockedPdfiumTree(engineRoot, lock, fixtureRoot) {
  const dll = path.join(engineRoot, ...lock.upstream.libraryPath.split("/"));
  const wrapper = path.join(engineRoot, ...lock.wrapper.binaryPath.split("/"));
  await assertExactFile(dll, lock.upstream.librarySizeBytes, lock.upstream.librarySha256, "pdfium.dll");
  await assertExactFile(wrapper, lock.wrapper.binarySizeBytes, lock.wrapper.binarySha256, "wrapper PDFium");
  await assertX64Pe(dll, "pdfium.dll");
  await assertX64Pe(wrapper, "wrapper PDFium");
  await runPdfiumHealth({ wrapper, dll, fixtureRoot });
  return { dll, wrapper, wrapperSha256: await sha256File(wrapper) };
}

export async function runPdfiumHealth({ wrapper, dll, fixtureRoot }) {
  const nativePdf = path.join(fixtureRoot, "pdf-native.pdf");
  const scannedPdf = path.join(fixtureRoot, "pdf-scanned.pdf");
  await assertRegularFile(nativePdf, "fixture PDF native");
  await assertRegularFile(scannedPdf, "fixture PDF scannee");
  const before = [await sha256File(nativePdf), await sha256File(scannedPdf)];
  const version = run(wrapper, ["--version"], dll, "version PDFium");
  if (version.stdout.trim() !== "pdfium-render-wrapper 0.3.0") {
    throw new Error(`Wrapper PDFium obsolete ou inattendu: ${version.stdout.trim() || "sortie vide"}.`);
  }
  run(wrapper, ["--check"], dll, "chargement PDFium");
  const inspection = run(wrapper, ["--inspect-text", nativePdf], dll, "inspection de texte PDFium");
  const parsed = JSON.parse(inspection.stdout);
  if (parsed.schemaVersion !== 1 || parsed.pageCount < 1 || !parsed.pages?.some(({ text }) => String(text).trim())) {
    throw new Error("Inspection PDFium sans texte natif exploitable.");
  }
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "mc-pdfium-health-"));
  try {
    const output = path.join(temporary, "page.png");
    run(wrapper, ["--render", scannedPdf, output, "--page", "1", "--format", "png", "--dpi", "300"], dll, "rendu PDFium 300 DPI");
    await assertPng(output);
  } finally {
    await fs.rm(temporary, { recursive: true, force: true });
  }
  const after = [await sha256File(nativePdf), await sha256File(scannedPdf)];
  if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error("Le smoke PDFium a modifie une fixture source.");
}

export function validatePdfiumZipEntries(entries) {
  if (!Array.isArray(entries) || entries.length === 0) throw new Error("Archive PDFium vide.");
  if (entries.length > MAX_ARCHIVE_ENTRIES) throw new Error("Archive PDFium avec trop d'entrees.");
  const seen = new Set();
  let expanded = 0;
  for (const entry of entries) {
    const name = String(entry.name ?? "");
    if (name.endsWith("/")) continue;
    if (name.includes("\\")) throw new Error(`Separateur ZIP non portable refuse: ${name}`);
    const normalized = normalizeZipPath(name);
    const key = normalized.toLowerCase();
    if (seen.has(key)) throw new Error(`Entree ZIP PDFium dupliquee: ${name}`);
    seen.add(key);
    const length = Number(entry.length);
    const compressedLength = Number(entry.compressedLength);
    if (!Number.isSafeInteger(length) || length < 0 || !Number.isSafeInteger(compressedLength) || compressedLength < 0) {
      throw new Error(`Taille ZIP PDFium invalide: ${name}`);
    }
    if (length > 0 && compressedLength === 0) throw new Error(`Entree ZIP PDFium ambigue: ${name}`);
    if (compressedLength > 0 && length / compressedLength > MAX_COMPRESSION_RATIO) throw new Error(`Ratio ZIP PDFium excessif: ${name}`);
    if (((Number(entry.externalAttributes) >>> 16) & 0xf000) === 0xa000) throw new Error(`Lien symbolique ZIP PDFium refuse: ${name}`);
    expanded += length;
    if (expanded > MAX_EXPANDED_BYTES) throw new Error("Archive PDFium trop volumineuse apres extraction.");
  }
  return { count: seen.size, expandedBytes: expanded };
}

export async function assertX64Pe(filePath, label) {
  const bytes = await fs.readFile(filePath);
  if (bytes.length < 64 || bytes[0] !== 0x4d || bytes[1] !== 0x5a) throw new Error(`${label}: executable PE invalide.`);
  const offset = bytes.readUInt32LE(0x3c);
  if (offset + 6 > bytes.length || bytes.toString("ascii", offset, offset + 4) !== "PE\0\0") throw new Error(`${label}: en-tete PE absent.`);
  const machine = bytes.readUInt16LE(offset + 4);
  if (machine !== EXPECTED_MACHINE) throw new Error(`${label}: architecture PE 0x${machine.toString(16)}, attendu x86_64.`);
}

async function assertExactFile(filePath, expectedBytes, expectedSha256, label) {
  const stat = await assertRegularFile(filePath, label);
  if (stat.size !== expectedBytes) throw new Error(`${label}: taille ${stat.size}, attendu ${expectedBytes}.`);
  const actual = await sha256File(filePath);
  if (actual !== expectedSha256) throw new Error(`${label}: SHA-256 ${actual}, attendu ${expectedSha256}.`);
}

async function assertRegularFile(filePath, label) {
  const stat = await fs.lstat(filePath).catch(() => null);
  if (!stat?.isFile() || stat.isSymbolicLink() || stat.size <= 0) throw new Error(`${label}: fichier regulier non vide requis.`);
  return stat;
}

async function assertPng(filePath) {
  const bytes = await fs.readFile(filePath);
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (bytes.length < 24 || !bytes.subarray(0, 8).equals(signature)) throw new Error("Rendu PDFium: PNG invalide.");
  if (bytes.readUInt32BE(16) === 0 || bytes.readUInt32BE(20) === 0) throw new Error("Rendu PDFium: dimensions PNG invalides.");
}

function run(executable, args, dll, label) {
  const result = spawnSync(executable, args, {
    cwd: path.dirname(executable),
    env: { ...process.env, PDFIUM_LIBRARY_PATH: dll, PDFIUM_DLL_PATH: dll },
    encoding: "utf8",
    timeout: 120_000,
    windowsHide: true,
  });
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`${label}: ${result.stderr || result.stdout || `code ${result.status}`}`);
  return result;
}
