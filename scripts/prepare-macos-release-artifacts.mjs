import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const args = parseArgs(process.argv.slice(2));
const version = args.version ?? readPackageVersion();
const outDir = path.resolve(args.outDir ?? path.join(os.tmpdir(), "mc-macos-release-artifacts", `v${version}`));
const bundleDir = args.bundleDir ? path.resolve(args.bundleDir) : null;

if (!version.match(/^\d+\.\d+\.\d+$/)) {
  fail(`Invalid version "${version}". Expected X.Y.Z.`);
}

const sourceDmg = args.dmg ? path.resolve(args.dmg) : findSingleArtifact("DMG", ".dmg", defaultDmgRoots());
const sourceUpdater = args.updaterArchive
  ? path.resolve(args.updaterArchive)
  : findSingleArtifact("macOS updater archive", ".app.tar.gz", defaultMacosBundleRoots());
const sourceUpdaterSig = args.updaterSignature
  ? path.resolve(args.updaterSignature)
  : `${sourceUpdater}.sig`;

assertFile(sourceDmg, "source macOS DMG");
assertFile(sourceUpdater, "source macOS updater archive");
assertFile(sourceUpdaterSig, "source macOS updater signature");
assertSourceVersion(sourceDmg, "source macOS DMG");
assertSourceVersion(sourceUpdater, "source macOS updater archive");
assertSourceVersion(sourceUpdaterSig, "source macOS updater signature");

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const versionedDmg = `Multi-Converter_${version}_macos-universal.dmg`;
const stableDmg = "Multi-Converter_macos-universal.dmg";
const updaterArchive = `Multi-Converter_${version}_macos-universal.app.tar.gz`;
const updaterSignature = `${updaterArchive}.sig`;

copyFile(sourceDmg, path.join(outDir, versionedDmg));
copyFile(sourceDmg, path.join(outDir, stableDmg));
copyFile(sourceUpdater, path.join(outDir, updaterArchive));
copyFile(sourceUpdaterSig, path.join(outDir, updaterSignature));

for (const name of [versionedDmg, stableDmg, updaterArchive, updaterSignature]) {
  assertFile(path.join(outDir, name), name);
}

console.log(`macOS release artifacts prepared: ${outDir}`);
console.log(`- ${versionedDmg}`);
console.log(`- ${stableDmg}`);
console.log(`- ${updaterArchive}`);
console.log(`- ${updaterSignature}`);

function defaultDmgRoots() {
  return bundleDir ? [bundleDir] : defaultBundleRoots().map((candidate) => path.join(candidate, "dmg"));
}

function defaultMacosBundleRoots() {
  return bundleDir ? [bundleDir] : defaultBundleRoots().map((candidate) => path.join(candidate, "macos"));
}

function defaultBundleRoots() {
  const targetDir = path.resolve(process.env.CARGO_TARGET_DIR ?? path.join(root, "src-tauri", "target"));
  return [
    path.join(targetDir, "universal-apple-darwin", "release", "bundle"),
    path.join(targetDir, "release", "bundle"),
    path.join(root, "src-tauri", "target", "universal-apple-darwin", "release", "bundle"),
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
      else if (entry.isFile() && entry.name.toLowerCase().endsWith(extension.toLowerCase())) results.push(fullPath);
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

function assertSourceVersion(filePath, label) {
  const sourceVersion = path.basename(filePath).match(/(?:^|[^\d])(\d+\.\d+\.\d+)(?:$|[^\d])/)?.[1] ?? null;
  if (sourceVersion && sourceVersion !== version) {
    fail(`${label} appears to be version ${sourceVersion}, expected ${version}: ${filePath}`);
  }
}

function parseArgs(rawArgs) {
  const parsed = {};
  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];
    if (arg === "--version") parsed.version = rawArgs[++index];
    else if (arg === "--out-dir") parsed.outDir = rawArgs[++index];
    else if (arg === "--bundle-dir") parsed.bundleDir = rawArgs[++index];
    else if (arg === "--dmg") parsed.dmg = rawArgs[++index];
    else if (arg === "--updater-archive") parsed.updaterArchive = rawArgs[++index];
    else if (arg === "--updater-signature") parsed.updaterSignature = rawArgs[++index];
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
