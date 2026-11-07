import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { filterZip, inspectFilterableZip } from "./lib/filtered-zip.mjs";
import { libreOfficeProfileId, retainLibreOfficeFile } from "./lib/libreoffice-profile.mjs";

const root = process.cwd();
const manifest = JSON.parse(await fs.readFile("src-tauri/engines-manifest.json", "utf8"));
const engine = manifest.engines.find(entry => entry.id === "libreoffice" && entry.platform === "windows-x64");
const source = path.join(root, "src-tauri/bundled-engine-archives/windows-x64/libreoffice.zip");
const output = path.join(root, "src-tauri/bundled-engine-archives/windows-x64/libreoffice.headless.zip");
const lockPath = "src-tauri/windows-libreoffice-profile.json";
const writeLock = process.argv.includes("--write-lock");
const checkOnly = process.argv.includes("--check");
if (await digest(source) !== engine.sha256) throw Error("Original LibreOffice archive differs from the distribution manifest");
const lock = writeLock ? null : JSON.parse(await fs.readFile(lockPath, "utf8"));
if (lock && (lock.profileId !== libreOfficeProfileId || lock.sourceArchiveSha256 !== engine.sha256)) throw Error("LibreOffice profile source/profile mismatch");
const existing = await digest(output).catch(() => null);
if (existing && !writeLock) {
  if (existing !== lock.archiveSha256) throw Error("Existing profile archive differs; preserve it before generating a new profile");
  console.log(`LibreOffice ${libreOfficeProfileId}: verified existing ${lock.compressedSizeBytes}-byte archive`);
} else {
  if (checkOnly) throw Error("Prepared LibreOffice profile archive is missing");
  const generated = `${output}.partial-${process.pid}`;
  const result = await filterZip(source, generated, retainLibreOfficeFile);
  const actual = {
    schemaVersion: 1, profileId: libreOfficeProfileId, engineId: engine.id, platform: engine.platform,
    sourceArchiveSha256: engine.sha256, archiveSha256: await digest(generated),
    compressedSizeBytes: (await fs.stat(generated)).size, installedSizeBytes: result.installedSizeBytes,
    fileCount: result.fileCount, archiveFileName: "libreoffice.headless.zip",
  };
  if (!writeLock && JSON.stringify(actual) !== JSON.stringify(lock)) throw Error("Generated LibreOffice profile differs from the committed lock");
  await fs.rename(generated, output);
  if (writeLock) await fs.writeFile(lockPath, JSON.stringify(actual, null, 2) + "\n");
  console.log(JSON.stringify({ ...actual, removedFileCount: result.removedFiles.length }));
}
const archive = await inspectFilterableZip(output);
const original = await inspectFilterableZip(source);
const expected = original.entries.filter(entry => retainLibreOfficeFile(entry.name));
const inventory = entries => entries.map(entry => [entry.name, entry.bytes, entry.compressedBytes, entry.record.readUInt32LE(16)]);
if (JSON.stringify(inventory(archive.entries)) !== JSON.stringify(inventory(expected))) throw Error("Profile membership/content differs from the selected source entries");
const activeLock = lock ?? JSON.parse(await fs.readFile(lockPath, "utf8"));
if (archive.size !== activeLock.compressedSizeBytes
  || archive.entries.reduce((sum, entry) => sum + entry.bytes, 0) !== activeLock.installedSizeBytes
  || archive.entries.filter(entry => !entry.name.endsWith("/")).length !== activeLock.fileCount) throw Error("Profile lock accounting mismatch");

async function digest(file) {
  const hash = createHash("sha256");
  for await (const block of createReadStream(file)) hash.update(block);
  return hash.digest("hex");
}
