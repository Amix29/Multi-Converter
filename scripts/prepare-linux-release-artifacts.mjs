import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readElfHeader } from "./lib/elf.mjs";

const root = process.cwd();
const args = parseArgs(process.argv.slice(2));
const version = args.version ?? readPackageVersion();
const outDir = path.resolve(args.outDir ?? path.join(os.tmpdir(), "mc-linux-release-artifacts", `v${version}`));
const bundleDir = args.bundleDir ? path.resolve(args.bundleDir) : null;

if (!version.match(/^\d+\.\d+\.\d+$/)) {
  fail(`Invalid version "${version}". Expected X.Y.Z.`);
}

const sourceAppImage = args.appimage
  ? path.resolve(args.appimage)
  : findSingleArtifact("Linux AppImage", ".AppImage", defaultAppImageRoots());
const sourceSignature = args.signature ? path.resolve(args.signature) : `${sourceAppImage}.sig`;

assertFile(sourceAppImage, "source Linux AppImage");
assertFile(sourceSignature, "source Linux AppImage updater signature");
assertElf(sourceAppImage, "source Linux AppImage");
assertSourceVersion(sourceAppImage, "source Linux AppImage", { required: true });
assertSourceVersion(sourceSignature, "source Linux AppImage updater signature", { required: true });

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const versionedAppImage = `Multi-Converter_${version}_linux-x64.AppImage`;
const stableAppImage = "Multi-Converter_linux-x64.AppImage";
const signature = `${versionedAppImage}.sig`;
const checksum = `${versionedAppImage}.sha256`;

copyFile(sourceAppImage, path.join(outDir, versionedAppImage));
copyFile(sourceAppImage, path.join(outDir, stableAppImage));
copyFile(sourceSignature, path.join(outDir, signature));
fs.writeFileSync(path.join(outDir, checksum), `${sha256File(sourceAppImage)}  ${versionedAppImage}`, "ascii");

for (const name of [versionedAppImage, stableAppImage, signature, checksum]) {
  assertFile(path.join(outDir, name), name);
}

console.log(`Linux release artifacts prepared: ${outDir}`);
console.log(`- ${versionedAppImage}`);
console.log(`- ${stableAppImage}`);
console.log(`- ${signature}`);
console.log(`- ${checksum}`);

function defaultAppImageRoots() {
  return bundleDir ? [bundleDir] : defaultBundleRoots().map((candidate) => path.join(candidate, "appimage"));
}

function defaultBundleRoots() {
  const targetDir = path.resolve(process.env.CARGO_TARGET_DIR ?? path.join(root, "src-tauri", "target"));
  return [
    path.join(targetDir, "x86_64-unknown-linux-gnu", "release", "bundle"),
    path.join(targetDir, "release", "bundle"),
    path.join(root, "src-tauri", "target", "x86_64-unknown-linux-gnu", "release", "bundle"),
    path.join(root, "src-tauri", "target", "release", "bundle"),
  ];
}

function findSingleArtifact(label, extension, roots) {
  const artifacts = roots
    .filter((candidateRoot) => fs.existsSync(candidateRoot))
    .flatMap((candidateRoot) => findFiles(candidateRoot, extension))
    .filter((candidate, index, all) => all.indexOf(candidate) === index);

  if (artifacts.length === 0) {
    fail(`No ${label} found. Checked: ${roots.join(", ")}`);
  }
  if (artifacts.length > 1) {
    fail(`Expected exactly one ${label}, found ${artifacts.length}: ${artifacts.map((artifact) => path.relative(root, artifact)).join(", ")}`);
  }
  return artifacts[0];
}

function findFiles(startDir, extension) {
  const results = [];
  const stack = [startDir];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(fullPath);
      else if (entry.isFile() && entry.name.endsWith(extension)) results.push(fullPath);
    }
  }
  return results;
}

function copyFile(source, destination) {
  fs.copyFileSync(source, destination);
}

function assertFile(filePath, label) {
  const stat = fs.statSync(filePath, { throwIfNoEntry: false });
  if (!stat?.isFile() || stat.size <= 0) {
    fail(`Missing or empty ${label}: ${filePath}`);
  }
}

function assertSourceVersion(filePath, label, options = {}) {
  const sourceVersion = path.basename(filePath).match(/(?:^|[^\d])(\d+\.\d+\.\d+)(?:$|[^\d])/)?.[1] ?? null;
  if (!sourceVersion && options.required) {
    fail(`${label} filename must include version ${version}: ${filePath}`);
  }
  if (sourceVersion && sourceVersion !== version) {
    fail(`${label} appears to be version ${sourceVersion}, expected ${version}: ${filePath}`);
  }
}

function assertElf(filePath, label) {
  const header = readElfHeader(filePath);
  if (!header.isElf) {
    fail(`${label} is not an ELF executable: ${filePath}`);
  }
  if (!header.is64Bit || !header.isLittleEndian || header.machine !== 0x3e) {
    fail(`${label} is not an x86_64 ELF executable: ${filePath}`);
  }
}

function sha256File(file) {
  const hash = createHash("sha256");
  hash.update(fs.readFileSync(file));
  return hash.digest("hex");
}

function parseArgs(rawArgs) {
  const parsed = {};
  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];
    if (arg === "--version") parsed.version = rawArgs[++index];
    else if (arg === "--out-dir") parsed.outDir = rawArgs[++index];
    else if (arg === "--bundle-dir") parsed.bundleDir = rawArgs[++index];
    else if (arg === "--appimage") parsed.appimage = rawArgs[++index];
    else if (arg === "--signature") parsed.signature = rawArgs[++index];
    else fail(`Unknown argument: ${arg}`);
  }
  return parsed;
}

function readPackageVersion() {
  const pkg = JSON.parse(fs.readFileSync(path.resolve("package.json"), "utf8"));
  return pkg.version;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
