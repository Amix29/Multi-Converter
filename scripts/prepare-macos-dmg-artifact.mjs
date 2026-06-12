import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const args = parseArgs(process.argv.slice(2));
const version = args.version ?? readPackageVersion();
const expectedName = `Multi-Converter_${version}_macos-universal.dmg`;
const outDir = path.resolve(args.outDir ?? path.join(os.tmpdir(), "mc-macos-dmg-artifact", `v${version}`));
const sourceDmg = args.dmg ? path.resolve(args.dmg) : findSourceDmg(args.bundleDir);

if (!version.match(/^\d+\.\d+\.\d+$/)) {
  fail(`Invalid version "${version}". Expected X.Y.Z.`);
}
assertFile(sourceDmg, "source macOS DMG");

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const outputPath = path.join(outDir, expectedName);
fs.copyFileSync(sourceDmg, outputPath);
assertFile(outputPath, "prepared macOS DMG");

console.log(`macOS DMG artifact prepared: ${outputPath}`);

function findSourceDmg(bundleDirArg) {
  const candidateRoots = bundleDirArg
    ? [path.resolve(bundleDirArg)]
    : defaultBundleRoots();
  const dmgs = candidateRoots
    .filter((candidateRoot) => fs.existsSync(candidateRoot))
    .flatMap((candidateRoot) => findDmgs(candidateRoot))
    .filter((candidate, index, all) => all.indexOf(candidate) === index);

  if (dmgs.length === 0) {
    fail(`No macOS DMG found. Checked: ${candidateRoots.join(", ")}`);
  }
  if (dmgs.length > 1) {
    fail(`Expected exactly one macOS DMG, found ${dmgs.length}: ${dmgs.map((dmg) => path.relative(root, dmg)).join(", ")}`);
  }
  return dmgs[0];
}

function defaultBundleRoots() {
  const targetDir = path.resolve(process.env.CARGO_TARGET_DIR ?? path.join(root, "src-tauri", "target"));
  return [
    path.join(targetDir, "universal-apple-darwin", "release", "bundle", "dmg"),
    path.join(targetDir, "release", "bundle", "dmg"),
    path.join(root, "src-tauri", "target", "universal-apple-darwin", "release", "bundle", "dmg"),
    path.join(root, "src-tauri", "target", "release", "bundle", "dmg"),
  ];
}

function findDmgs(startDir) {
  const results = [];
  const stack = [startDir];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(fullPath);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith(".dmg")) results.push(fullPath);
    }
  }
  return results;
}

function assertFile(filePath, label) {
  const stat = fs.statSync(filePath, { throwIfNoEntry: false });
  if (!stat?.isFile() || stat.size <= 0) {
    fail(`Missing or empty ${label}: ${filePath}`);
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
