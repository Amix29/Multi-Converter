import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { randomUUID, createHash } from "node:crypto";
import { inspectFilterableZip, readZipEntry } from "./lib/filtered-zip.mjs";
import { retainLibreOfficeFile } from "./lib/libreoffice-profile.mjs";
import { fileHash, stageEntry, treeManifest, verifyContent } from "./lib/direct-engine-resources.mjs";

const root = process.cwd();
const sourceRoot = path.join(root, "src-tauri");
const profileRoot = path.join(sourceRoot, "bundled-engine-profiles/windows-x64");
const current = path.join(profileRoot, "current");
const policyRoot = path.join(import.meta.dirname, "../tools/engine-profiles");
const policy = await json(path.join(policyRoot, "windows-libreoffice-v2.json"));
const lock = await json(path.join(sourceRoot, "ocr-runtime-lock.json"));
const selection = lock.platformSelections.find(item => item.platform === "windows-x64");
const checkOnly = process.argv.includes("--check");
if (process.platform !== "win32" || process.arch !== "x64") throw Error("Windows x64 staging requires a Windows x64 host");

if (await exists(current)) {
  await verify(current);
  console.log("Windows direct resources verified: Office profile, identical OCR runtime and all five models");
} else {
  if (checkOnly) throw Error("Prepare Windows direct resources before validation/bundling");
  await fs.mkdir(profileRoot, { recursive: true });
  const staging = path.join(profileRoot, `.staging-${randomUUID()}`);
  await fs.mkdir(staging);
  // Failed staging is retained for inspection; never remove old engine trees.
  await stageOffice(staging);
  await stageOcr(staging);
  await verify(staging);
  await fs.rename(staging, current);
  console.log("Prepared and verified Windows direct resources without full temporary engine copies");
}

async function stageOffice(destination) {
  const source = path.join(sourceRoot, "bundled-engine-archives/windows-x64/libreoffice.zip");
  if (await fileHash(source) !== policy.sourceArchiveSha256) throw Error("LibreOffice source archive differs from approved profile");
  const archive = await inspectFilterableZip(source);
  const omit = new Set(policy.omitFiles);
  const overlays = new Map(policy.replacements.map(item => [item.path, item]));
  const references = [process.env.MULTI_CONVERTER_LO_REFERENCE,
    path.join(process.env.LOCALAPPDATA ?? os.tmpdir(), "Multi-Converter/tool-env/bundled/libreoffice/compatible"),
    path.join(sourceRoot, "bundled-engines/libreoffice/compatible")].filter(Boolean);
  for (const entry of archive.entries.filter(item => !item.name.endsWith("/") && retainLibreOfficeFile(item.name) && !omit.has(item.name))) {
    const target = path.join(destination, "libreoffice", entry.name);
    const overlay = overlays.get(entry.name);
    if (overlay) {
      const original = await readZipEntry(source, entry);
      if (digest(original) !== overlay.sourceSha256) throw Error(`Dictionary registry source changed: ${entry.name}`);
      const replacement = await fs.readFile(path.join(policyRoot, overlay.file));
      if (digest(replacement) !== overlay.sha256) throw Error(`Dictionary overlay changed: ${entry.name}`);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, replacement, { flag: "wx" });
    } else {
      // Package notices can be normalized by ordinary engine preparation. Keep
      // their approved original ZIP bytes without touching the source tree.
      await stageEntry(source, entry, target, /^(engine.json|licenses\/)/.test(entry.name) ? [] : references);
    }
  }
  await fs.writeFile(path.join(destination, "libreoffice-profile.json"), JSON.stringify({ profileId: policy.profileId, ...policy.expectedLibreOffice }, null, 2) + "\n");
}

async function stageOcr(destination) {
  const source = path.join(sourceRoot, "ocr-resources/runtime/windows-x64.zip");
  if (await fileHash(source) !== selection.archive.sha256) throw Error("OCR source ZIP differs from embedded lock");
  const archive = await inspectFilterableZip(source);
  const reference = path.join(process.env.LOCALAPPDATA ?? os.tmpdir(), "com.multiconverter.desktop/ocr-runtime", `windows-x64-${selection.artifact.aggregateSha256}`);
  for (const entry of archive.entries.filter(item => !item.name.endsWith("/"))) {
    await stageEntry(source, entry, path.join(destination, "ocr/runtime/windows-x64", entry.name), [reference]);
  }
  const models = path.join(sourceRoot, "ocr-resources/models");
  const manifest = await json(path.join(models, "models-lock.json"));
  for (const relative of ["models-lock.json", ...manifest.files.map(item => item.path)]) {
    const target = path.join(destination, "ocr/models", relative);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.link(path.join(models, relative), target);
  }
}

async function verify(destination) {
  const office = await treeManifest(path.join(destination, "libreoffice"));
  if (JSON.stringify(office) !== JSON.stringify(policy.expectedLibreOffice)) throw Error(`Office direct profile integrity mismatch: ${JSON.stringify(office)}`);
  await verifyContent(path.join(destination, "ocr/runtime/windows-x64"), "runtime-manifest.json", selection.artifact);
  await verifyContent(path.join(destination, "ocr/models"), "models-lock.json", lock.modelArtifact);
}

async function json(file) { return JSON.parse(await fs.readFile(file, "utf8")); }
async function exists(file) { return fs.stat(file).then(() => true, error => { if (error.code === "ENOENT") return false; throw error; }); }
function digest(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
