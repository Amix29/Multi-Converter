import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const args = parseArgs(process.argv.slice(2));
const version = args.version ?? readPackageVersion();
const tag = args.tag ?? `v${version}`;
const bundleDir = path.resolve(
  args.bundleDir ?? path.join(os.tmpdir(), "mc-cargo-target-tauri-dev", "release", "bundle", "nsis"),
);
const outDir = path.resolve(args.dir ?? path.join(os.tmpdir(), "mc-release-assets", tag));
const notesPath = path.resolve(args.notes ?? path.join("docs", `RELEASE_NOTES_v${version}.md`));

if (!version.match(/^\d+\.\d+\.\d+$/)) fail(`Invalid version "${version}". Expected X.Y.Z.`);
if (tag !== `v${version}`) fail(`Tag "${tag}" does not match version "${version}". Expected v${version}.`);

const versionedInstaller = `Multi-Converter_${version}_x64-setup.exe`;
const stableInstaller = "Multi-Converter_windows-x64_setup.exe";
const installerPath = path.join(bundleDir, versionedInstaller);
const signaturePath = path.join(bundleDir, `${versionedInstaller}.sig`);

if (!fs.existsSync(installerPath)) fail(`Missing NSIS installer: ${installerPath}`);
if (!fs.existsSync(signaturePath)) fail(`Missing updater signature: ${signaturePath}`);
if (!fs.existsSync(notesPath)) fail(`Missing release notes: ${notesPath}`);

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

copyFile(installerPath, path.join(outDir, versionedInstaller));
copyFile(signaturePath, path.join(outDir, `${versionedInstaller}.sig`));
copyFile(installerPath, path.join(outDir, stableInstaller));

const hash = sha256File(installerPath);
fs.writeFileSync(path.join(outDir, `${versionedInstaller}.sha256`), `${hash}  ${versionedInstaller}`, "ascii");

const signature = fs.readFileSync(signaturePath, "utf8").trim();
const notes = fs.readFileSync(notesPath, "utf8").trim();
const downloadUrl = `https://github.com/Amix29/Multi-Converter/releases/download/${tag}/${versionedInstaller}`;
const latest = {
  version,
  notes,
  pub_date: new Date().toISOString(),
  platforms: {
    "windows-x86_64": {
      signature,
      url: downloadUrl,
    },
    "windows-x86_64-nsis": {
      signature,
      url: downloadUrl,
    },
  },
};

fs.writeFileSync(path.join(outDir, "latest.json"), `${JSON.stringify(latest, null, 2)}\n`, "utf8");

console.log(`Release assets prepared for Multi-Converter v${version}: ${outDir}`);
console.log(`SHA256 ${versionedInstaller}: ${hash}`);

function parseArgs(rawArgs) {
  const parsed = {};
  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];
    if (arg === "--version") parsed.version = rawArgs[++index];
    else if (arg === "--tag") parsed.tag = rawArgs[++index];
    else if (arg === "--dir") parsed.dir = rawArgs[++index];
    else if (arg === "--bundle-dir") parsed.bundleDir = rawArgs[++index];
    else if (arg === "--notes") parsed.notes = rawArgs[++index];
    else fail(`Unknown argument: ${arg}`);
  }
  return parsed;
}

function readPackageVersion() {
  const pkg = JSON.parse(fs.readFileSync(path.resolve("package.json"), "utf8"));
  return pkg.version;
}

function copyFile(source, destination) {
  fs.copyFileSync(source, destination);
}

function sha256File(file) {
  const hash = createHash("sha256");
  hash.update(fs.readFileSync(file));
  return hash.digest("hex");
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
