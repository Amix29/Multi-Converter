import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

export async function readWindowsProfiles(root) {
  const policyRoot = path.join(root, "tools/engine-profiles");
  const base = JSON.parse(await fs.readFile(path.join(policyRoot, "windows-libreoffice-v2.json"), "utf8"));
  const office = JSON.parse(await fs.readFile(path.join(policyRoot, "windows-libreoffice-v3.json"), "utf8"));
  if (office.basePolicy !== "windows-libreoffice-v2.json" || office.sourceArchiveSha256 !== base.sourceArchiveSha256) throw Error("Office profile origins disagree");
  const ocr = JSON.parse(await fs.readFile(path.join(root, "src-tauri/windows-ocr-profile.json"), "utf8"));
  const lock = JSON.parse(await fs.readFile(path.join(root, "src-tauri/ocr-runtime-lock.json"), "utf8"));
  const original = lock.platformSelections.find(item => item.platform === "windows-x64").artifact;
  for (const key of ["fileCount", "totalBytes", "aggregateSha256"]) if (original[key] !== ocr.sourceArtifact[key]) throw Error("OCR profile origin disagrees with reference lock");
  return { office: { ...base, ...office }, ocr };
}

export function validateOcrProfileMarker(manifest, profile) {
  if (manifest.distributionProfile !== profile.profileId || manifest.sourceAggregateSha256 !== profile.sourceArtifact.aggregateSha256) throw Error("OCR distribution marker differs from approved profile");
  for (const key of ["fileCount", "totalBytes", "aggregateSha256"]) if (manifest[key] !== profile.artifact[key]) throw Error("OCR distribution metadata differs from approved artifact");
}

export function retainOcrFile(name, profile) {
  // Preserve notices even when nested under an excluded build-only folder.
  if (/(^|\/)(licen[sc]e|copying|copyright|notice)[^/]*$/i.test(name)) return true;
  return !profile.omitFiles.includes(name) && !profile.omitPrefixes.some(prefix => name.startsWith(prefix));
}

export function filterRegistryBytes(input, transform) {
  if (sha(input) !== transform.sourceSha256) throw Error("Office UI registry source differs from approved origin");
  const blocks = [];
  let cursor = 0;
  for (const [start, end] of transform.ranges) {
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < cursor || end <= start || end > input.length) throw Error("Invalid Office XML byte range");
    blocks.push(input.subarray(cursor, start)); cursor = end;
  }
  blocks.push(input.subarray(cursor));
  const result = Buffer.concat(blocks);
  if (sha(result) !== transform.sha256) throw Error("Office UI registry result differs from approved profile");
  return result;
}

export function deriveOcrManifest(manifest, profile) {
  for (const key of ["fileCount", "totalBytes", "aggregateSha256"]) {
    if (manifest[key] !== profile.sourceArtifact[key]) throw Error("OCR profile origin differs from runtime source");
  }
  const files = manifest.files.filter(entry => retainOcrFile(entry.path, profile));
  const retired = manifest.files.filter(entry => !retainOcrFile(entry.path, profile));
  if (JSON.stringify(retired) !== JSON.stringify(profile.retiredFiles)) throw Error("OCR retired-file hashes disagree with authenticated origin");
  const hash = createHash("sha256");
  for (const entry of files) hash.update(`${entry.path}\0${entry.bytes}\0${entry.sha256}\n`);
  if (files.length !== profile.artifact.fileCount || files.reduce((sum, entry) => sum + entry.bytes, 0) !== profile.artifact.totalBytes
    || hash.digest("hex") !== profile.artifact.aggregateSha256) throw Error("OCR derived membership differs from approved lock");
  return { ...manifest, ...profile.artifact, files, distributionProfile: profile.profileId, sourceAggregateSha256: profile.sourceArtifact.aggregateSha256 };
}

function sha(input) { return createHash("sha256").update(input).digest("hex"); }
