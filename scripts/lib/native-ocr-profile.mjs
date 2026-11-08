import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileHash, safeResourcePath, verifyContent } from "./direct-engine-resources.mjs";

export const nativeOcrRoot = "src-tauri/bundled-engine-profiles/windows-x64/native-v1/ocr";
export const nativeOcrPolicy = "src-tauri/windows-native-ocr-profile.json";
export const nativeWorkerSource = "tools/ocr-runtime/native-worker";

export async function regularFiles(root) {
  const files = [];
  async function walk(directory, prefix = "") {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const relative = prefix + entry.name;
      if (entry.isDirectory()) await walk(path.join(directory, entry.name), relative + "/");
      else if (entry.isFile()) files.push(relative);
      else throw Error(`Non-regular native OCR resource: ${relative}`);
    }
  }
  await walk(root);
  return files.sort();
}

export function artifact(manifest) {
  return Object.fromEntries(["fileCount", "totalBytes", "aggregateSha256"].map(key => [key, manifest[key]]));
}

export function verifyManifestOrigin(manifest, expected) {
  const hash = createHash("sha256");
  let total = 0;
  const names = new Set();
  for (const file of manifest.files) {
    safeResourcePath(file.path);
    if (names.has(file.path.toLowerCase())) throw Error("Duplicate OCR manifest entry");
    names.add(file.path.toLowerCase());
    total += file.bytes;
    hash.update(`${file.path}\0${file.bytes}\0${file.sha256}\n`);
  }
  if (manifest.files.length !== expected.fileCount || total !== expected.totalBytes
    || hash.digest("hex") !== expected.aggregateSha256
    || JSON.stringify(artifact(manifest)) !== JSON.stringify(artifact(expected))) {
    throw Error("Native OCR source manifest differs from approved origin");
  }
}

export async function compiledSourceHash() {
  const hash = createHash("sha256");
  for (const folder of [nativeWorkerSource, "vendor/oar-ocr", "vendor/oar-ocr-core"]) {
    for (const relative of await regularFiles(folder)) {
      if (!relative.endsWith(".rs") && !["Cargo.toml", "Cargo.lock", "model-sources.json", "runtime-sources.json", "microsoft-runtime-sources.json"].includes(relative)) continue;
      // Source text has a stable identity across Git line-ending settings.
      // Resource/model/DLL identities remain strict hashes of their raw bytes.
      const text = (await fs.readFile(path.join(folder, relative), "utf8")).replaceAll("\r\n", "\n");
      const digest = createHash("sha256").update(text).digest("hex");
      hash.update(`${folder}/${relative}\0${digest}\n`);
    }
  }
  return hash.digest("hex");
}

export async function createContentManifest(root, name, extra) {
  const files = [];
  const hash = createHash("sha256");
  for (const relative of (await regularFiles(root)).filter(relative => relative !== name)) {
    const file = path.join(root, safeResourcePath(relative));
    const entry = { path: relative, bytes: (await fs.stat(file)).size, sha256: await fileHash(file) };
    files.push(entry);
    hash.update(`${entry.path}\0${entry.bytes}\0${entry.sha256}\n`);
  }
  const manifest = { schemaVersion: 1, ...extra, fileCount: files.length,
    totalBytes: files.reduce((total, file) => total + file.bytes, 0), aggregateSha256: hash.digest("hex"), files };
  await fs.writeFile(path.join(root, name), JSON.stringify(manifest, null, 2) + "\n");
  return manifest;
}

export async function linkVerified(source, target, expected) {
  if (expected && await fileHash(source) !== expected) throw Error(`Changed native OCR source: ${source}`);
  await fs.mkdir(path.dirname(target), { recursive: true });
  try {
    await fs.link(source, target).catch(error => {
      if (error.code !== "EXDEV") throw error;
      return fs.copyFile(source, target, fs.constants.COPYFILE_EXCL);
    });
  } catch (error) {
    if (error.code !== "EEXIST" || !(await fs.lstat(target)).isFile()
      || await fileHash(target) !== (expected ?? await fileHash(source))) throw error;
  }
}

export async function verifyNativeOcr(root = nativeOcrRoot) {
  const policy = JSON.parse(await fs.readFile(nativeOcrPolicy, "utf8"));
  const source = JSON.parse(await fs.readFile("src-tauri/ocr-runtime-lock.json", "utf8"));
  const original = source.platformSelections.find(item => item.platform === "windows-x64");
  if (JSON.stringify(policy.sourceArtifact) !== JSON.stringify(original.artifact)
    || JSON.stringify(policy.sourceModelArtifact) !== JSON.stringify(source.modelArtifact)
    || policy.workerSourceSha256 !== await compiledSourceHash()) throw Error("Native OCR origin/source changed; rebuild and review the profile");
  const runtime = await verifyContent(path.join(root, "runtime/windows-x64"), "runtime-manifest.json", policy.artifact);
  const models = await verifyContent(path.join(root, "models"), "models-lock.json", policy.modelArtifact);
  if (runtime.distributionProfile !== policy.profileId || models.distributionProfile !== policy.profileId
    || runtime.sourceAggregateSha256 !== original.artifact.aggregateSha256
    || models.sourceAggregateSha256 !== source.modelArtifact.aggregateSha256
    || models.encoding !== "byte-shuffle4-v1") throw Error("Unknown native OCR distribution marker");
  return policy;
}
