import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { inspectFilterableZip, readZipEntry } from "./lib/filtered-zip.mjs";
import { fileHash } from "./lib/direct-engine-resources.mjs";
import { nativeOcrRoot, nativeOcrPolicy, nativeWorkerSource, artifact, compiledSourceHash,
  createContentManifest, linkVerified, verifyManifestOrigin, verifyNativeOcr } from "./lib/native-ocr-profile.mjs";

if (process.platform !== "win32" || process.arch !== "x64") throw Error("Native OCR staging requires Windows x64");
if (process.argv.includes("--check")) {
  const policy = await verifyNativeOcr();
  console.log(JSON.stringify({ profileId: policy.profileId, runtime: policy.artifact, models: policy.modelArtifact }));
} else {
  if (!process.argv.includes("--write-lock")) throw Error("Explicit --write-lock required to curate a built native worker");
  const argument = name => { const index = process.argv.indexOf(name); if (index < 0 || !process.argv[index + 1]) throw Error(`Missing ${name}`); return path.resolve(process.argv[index + 1]); };
  const worker = argument("--worker");
  const ortRoot = argument("--ort-source");
  const runtime = path.join(nativeOcrRoot, "runtime/windows-x64");
  await fs.mkdir(runtime, { recursive: true });
  const lock = await json("src-tauri/ocr-runtime-lock.json");
  const selected = lock.platformSelections.find(item => item.platform === "windows-x64");
  const archivePath = "src-tauri/ocr-resources/runtime/windows-x64.zip";
  if (await fileHash(archivePath) !== selected.archive.sha256) throw Error("Original OCR ZIP differs from embedded origin");
  const archive = await inspectFilterableZip(archivePath);
  const originalBytes = await readZipEntry(archivePath, archive.entries.find(entry => entry.name === "runtime-manifest.json"));
  const original = JSON.parse(originalBytes.toString("utf8"));
  verifyManifestOrigin(original, selected.artifact);
  const originalByName = new Map(original.files.map(file => [file.path, file]));
  const old = "src-tauri/bundled-engine-profiles/windows-x64/v3/ocr/runtime/windows-x64";
  async function stageOriginal(entry, target) {
    const expected = originalByName.get(entry.name);
    if (!expected) throw Error("Original ZIP entry is not locked");
    const source = path.join(old, entry.name);
    if (await exists(source) && await fileHash(source) === expected.sha256) await linkVerified(source, target, expected.sha256);
    else {
      const bytes = await readZipEntry(archivePath, entry);
      if (digest(bytes) !== expected.sha256) throw Error("Original notice/runtime digest mismatch");
      await fs.mkdir(path.dirname(target), { recursive: true });
      if (await exists(target)) { if (await fileHash(target) !== expected.sha256) throw Error("Existing native resource changed"); }
      else await fs.writeFile(target, bytes, { flag: "wx" });
    }
  }
  const ort = await json(path.join(nativeWorkerSource, "runtime-sources.json"));
  for (const file of ort.files) {
    const target = file.path.startsWith("capi/") ? path.basename(file.path) : `licenses/onnxruntime/${file.path}`;
    await linkVerified(path.join(ortRoot, file.path), path.join(runtime, target), file.sha256);
  }
  for (const name of ["VCRUNTIME140.dll", "VCRUNTIME140_1.dll", "MSVCP140.dll"]) {
    const entry = archive.entries.find(entry => entry.name.toLowerCase() === `_internal/${name.toLowerCase()}`);
    if (!entry) throw Error(`Missing approved Microsoft runtime ${name}`);
    await stageOriginal(entry, path.join(runtime, name));
  }
  const isNotice = name => /(?:^|\/)(?:licenses?|licences?)(?:\/|$)/i.test(name)
    || /(?:^|\/)(?:licen[cs]e|copying|notice|copyright|authors)(?:[._-].*)?$/i.test(name);
  const notices = archive.entries.filter(entry => !entry.name.endsWith("/") && isNotice(entry.name));
  if (notices.reduce((total, entry) => total + entry.bytes, 0) > 32 * 1024 * 1024) throw Error("Notice inventory exceeds bound");
  for (const entry of notices) await stageOriginal(entry, path.join(runtime, "licenses/legacy", entry.name));
  await linkVerified(worker, path.join(runtime, "ocr-worker.exe"));
  await stageRustNotices(runtime, isNotice);
  const profileId = "windows-native-ocr-v1";
  const manifest = await createContentManifest(runtime, "runtime-manifest.json", {
    distributionProfile: profileId, sourceAggregateSha256: selected.artifact.aggregateSha256,
    runtime: "Rust OAR 0.10.2 / ONNX Runtime 1.26.0", provider: "cpu", sourceWheel: ort.wheel,
  });
  const models = await json(path.join(nativeOcrRoot, "models/models-lock.json"));
  const originalModels = await json("src-tauri/ocr-resources/models/models-lock.json");
  verifyManifestOrigin(originalModels, lock.modelArtifact);
  if (models.sourceAggregateSha256 !== lock.modelArtifact.aggregateSha256 || models.encoding !== "byte-shuffle4-v1") throw Error("Unexpected model profile");
  const currentPaths = new Set(manifest.files.map(file => file.path));
  const currentModels = new Set(models.files.map(file => file.path));
  const policy = { schemaVersion: 1, profileId, sourceArtifact: selected.artifact, artifact: artifact(manifest),
    sourceModelArtifact: lock.modelArtifact, modelArtifact: artifact(models),
    workerSourceSha256: await compiledSourceHash(), workerCargoLockSha256: await fileHash(path.join(nativeWorkerSource, "Cargo.lock")),
    retiredFiles: original.files.filter(file => !currentPaths.has(file.path)),
    retiredModelFiles: originalModels.files.filter(file => !currentModels.has(file.path)),
    preserved: "Five full-precision official models, original dictionary, CPU offline inference; original conversion engines unchanged" };
  await fs.writeFile(nativeOcrPolicy, JSON.stringify(policy, null, 2) + "\n");
  await verifyNativeOcr();
  console.log(JSON.stringify({ profileId, runtime: policy.artifact, models: policy.modelArtifact,
    legacyNotices: notices.length, workerSourceSha256: policy.workerSourceSha256 }));
}

async function stageRustNotices(runtime, isNotice) {
  const metadata = JSON.parse(execFileSync("cargo", ["metadata", "--offline", "--locked", "--format-version", "1",
    "--filter-platform", "x86_64-pc-windows-msvc", "--manifest-path", path.join(nativeWorkerSource, "Cargo.toml")],
  { encoding: "utf8", windowsHide: true, maxBuffer: 16 * 1024 * 1024 }));
  const active = new Set(metadata.resolve.nodes.map(node => node.id));
  const inventory = [];
  for (const pkg of metadata.packages.filter(pkg => active.has(pkg.id))) {
    const source = path.dirname(pkg.manifest_path);
    const files = (await fs.readdir(source, { withFileTypes: true })).filter(entry => entry.isFile() && isNotice(entry.name)).map(entry => entry.name);
    const target = path.join(runtime, "licenses/rust", `${pkg.name}-${pkg.version}`);
    for (const file of files) await linkVerified(path.join(source, file), path.join(target, file));
    if (pkg.name === "mc-offline-ocr") await linkVerified("LICENSE", path.join(target, "LICENSE"));
    const procMacro = pkg.targets.some(target => target.crate_types.includes("proc-macro"));
    const fallback = path.join(nativeWorkerSource, "notices", `${pkg.name}-${pkg.version}`);
    if (!files.length && await exists(path.join(fallback, "SOURCE.json"))) {
      const provenance = await json(path.join(fallback, "SOURCE.json"));
      if (provenance.package !== pkg.name || provenance.version !== pkg.version) throw Error("Supplemental notice identity mismatch");
      for (const file of provenance.files) {
        await linkVerified(path.join(fallback, file.path), path.join(target, file.path), file.sha256);
        files.push(file.path);
      }
      await linkVerified(path.join(fallback, "SOURCE.json"), path.join(target, "SOURCE.json"));
    }
    if (!files.length && !procMacro && pkg.name !== "mc-offline-ocr") throw Error(`Missing runtime license text: ${pkg.name}`);
    inventory.push({ name: pkg.name, version: pkg.version, license: pkg.license, repository: pkg.repository,
      role: procMacro ? "build-time proc-macro; not a shipped runtime library" : "runtime/build dependency",
      notices: pkg.name === "mc-offline-ocr" ? [...files, "LICENSE"] : files });
  }
  await linkVerified("vendor/oar-ocr-core/OpenCV-BSD-NOTICE.txt", path.join(runtime, "licenses/opencv/OpenCV-BSD-NOTICE.txt"));
  await fs.writeFile(path.join(runtime, "licenses/rust-inventory.json"), JSON.stringify(inventory, null, 2) + "\n");
}
async function json(file) { return JSON.parse(await fs.readFile(file, "utf8")); }
async function exists(file) { return fs.stat(file).then(() => true, error => { if (error.code === "ENOENT") return false; throw error; }); }
function digest(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
