import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { isX86_64Elf } from "./lib/elf.mjs";
import { validateReleaseNotes } from "./lib/release-notes-validation.mjs";

const args = parseArgs(process.argv.slice(2));
const version = args.version ?? readPackageVersion();
const tag = args.tag ?? `v${version}`;
const bundleDir = path.resolve(
  args.bundleDir ?? path.join(os.tmpdir(), "mc-cargo-target-tauri-dev", "release", "bundle", "nsis"),
);
const outDir = path.resolve(args.dir ?? path.join(os.tmpdir(), "mc-release-assets", tag));
const notes = readReleaseNotes(args).trim();
const includeMacos = Boolean(args.macosDmg);
const includeLinux = Boolean(args.linuxAppImage);

if (!version.match(/^\d+\.\d+\.\d+$/)) fail(`Invalid version "${version}". Expected X.Y.Z.`);
if (tag !== `v${version}`) fail(`Tag "${tag}" does not match version "${version}". Expected v${version}.`);

const versionedInstaller = `Multi-Converter_${version}_x64-setup.exe`;
const stableInstaller = "Multi-Converter_windows-x64_setup.exe";
const installerPath = path.join(bundleDir, versionedInstaller);
const signaturePath = path.join(bundleDir, `${versionedInstaller}.sig`);

if (!fs.existsSync(installerPath)) fail(`Missing NSIS installer: ${installerPath}`);
if (!fs.existsSync(signaturePath)) fail(`Missing updater signature: ${signaturePath}`);
const notesValidation = validateReleaseNotes({ body: notes, version, includeMacos, includeLinux, minLength: 200 });
if (!notesValidation.ok) fail(notesValidation.errors.join("\n"));

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

copyFile(installerPath, path.join(outDir, versionedInstaller));
copyFile(signaturePath, path.join(outDir, `${versionedInstaller}.sig`));
copyFile(installerPath, path.join(outDir, stableInstaller));

if (args.macosDmg) {
  if (!args.macosUpdaterArchive || !args.macosUpdaterSignature) {
    fail("macOS releases require --macos-updater-archive and --macos-updater-signature so automatic updates can be enabled.");
  }
  const macosDmgSource = path.resolve(args.macosDmg);
  const macosUpdaterArchiveSource = path.resolve(args.macosUpdaterArchive);
  const macosUpdaterSignatureSource = path.resolve(args.macosUpdaterSignature);
  const macosDmgName = `Multi-Converter_${version}_macos-universal.dmg`;
  const stableMacosDmgName = "Multi-Converter_macos-universal.dmg";
  const macosUpdaterArchiveName = `Multi-Converter_${version}_macos-universal.app.tar.gz`;
  const macosUpdaterSignatureName = `${macosUpdaterArchiveName}.sig`;
  if (!fs.existsSync(macosDmgSource)) fail(`Missing macOS DMG: ${macosDmgSource}`);
  if (!fs.existsSync(macosUpdaterArchiveSource)) fail(`Missing macOS updater archive: ${macosUpdaterArchiveSource}`);
  if (!fs.existsSync(macosUpdaterSignatureSource)) fail(`Missing macOS updater signature: ${macosUpdaterSignatureSource}`);
  assertSourceVersion(macosDmgSource, "macOS DMG");
  assertSourceVersion(macosUpdaterArchiveSource, "macOS updater archive");
  assertSourceVersion(macosUpdaterSignatureSource, "macOS updater signature");
  copyFile(macosDmgSource, path.join(outDir, macosDmgName));
  copyFile(macosDmgSource, path.join(outDir, stableMacosDmgName));
  copyFile(macosUpdaterArchiveSource, path.join(outDir, macosUpdaterArchiveName));
  copyFile(macosUpdaterSignatureSource, path.join(outDir, macosUpdaterSignatureName));
}

if (args.linuxAppImage) {
  if (!args.linuxAppImageSignature) {
    fail("Linux releases require --linux-appimage-signature so automatic updates can be enabled.");
  }
  const linuxAppImageSource = path.resolve(args.linuxAppImage);
  const linuxAppImageSignatureSource = path.resolve(args.linuxAppImageSignature);
  const linuxAppImageName = `Multi-Converter_${version}_linux-x64.AppImage`;
  const stableLinuxAppImageName = "Multi-Converter_linux-x64.AppImage";
  const linuxAppImageSignatureName = `${linuxAppImageName}.sig`;
  if (!fs.existsSync(linuxAppImageSource)) fail(`Missing Linux AppImage: ${linuxAppImageSource}`);
  if (!fs.existsSync(linuxAppImageSignatureSource)) fail(`Missing Linux AppImage updater signature: ${linuxAppImageSignatureSource}`);
  assertSourceVersion(linuxAppImageSource, "Linux AppImage", { required: true });
  assertSourceVersion(linuxAppImageSignatureSource, "Linux AppImage updater signature", { required: true });
  if (!isX86_64Elf(linuxAppImageSource)) fail(`Linux AppImage source is not an x86_64 ELF executable: ${linuxAppImageSource}`);
  copyFile(linuxAppImageSource, path.join(outDir, linuxAppImageName));
  copyFile(linuxAppImageSource, path.join(outDir, stableLinuxAppImageName));
  copyFile(linuxAppImageSignatureSource, path.join(outDir, linuxAppImageSignatureName));
  const linuxHash = sha256File(linuxAppImageSource);
  fs.writeFileSync(path.join(outDir, `${linuxAppImageName}.sha256`), `${linuxHash}  ${linuxAppImageName}`, "ascii");
}

const hash = sha256File(installerPath);
fs.writeFileSync(path.join(outDir, `${versionedInstaller}.sha256`), `${hash}  ${versionedInstaller}`, "ascii");

const signature = fs.readFileSync(signaturePath, "utf8").trim();
const downloadUrl = `https://github.com/Amix29/Multi-Converter/releases/download/${tag}/${versionedInstaller}`;
const macosUpdaterArchiveName = `Multi-Converter_${version}_macos-universal.app.tar.gz`;
const macosUpdaterSignaturePath = path.join(outDir, `${macosUpdaterArchiveName}.sig`);
const macosUpdaterSignature = args.macosDmg ? fs.readFileSync(macosUpdaterSignaturePath, "utf8").trim() : null;
const macosUpdaterUrl = `https://github.com/Amix29/Multi-Converter/releases/download/${tag}/${macosUpdaterArchiveName}`;
const linuxAppImageName = `Multi-Converter_${version}_linux-x64.AppImage`;
const linuxAppImageSignaturePath = path.join(outDir, `${linuxAppImageName}.sig`);
const linuxAppImageSignature = includeLinux ? fs.readFileSync(linuxAppImageSignaturePath, "utf8").trim() : null;
const linuxAppImageUrl = `https://github.com/Amix29/Multi-Converter/releases/download/${tag}/${linuxAppImageName}`;
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
    ...(args.macosDmg ? {
      "darwin-aarch64": {
        signature: macosUpdaterSignature,
        url: macosUpdaterUrl,
      },
      "darwin-x86_64": {
        signature: macosUpdaterSignature,
        url: macosUpdaterUrl,
      },
    } : {}),
    ...(includeLinux ? {
      "linux-x86_64": {
        signature: linuxAppImageSignature,
        url: linuxAppImageUrl,
      },
    } : {}),
  },
};

fs.writeFileSync(path.join(outDir, "latest.json"), `${JSON.stringify(latest, null, 2)}\n`, "utf8");

console.log(`Release assets prepared for Multi-Converter v${version}: ${outDir}`);
console.log(`SHA256 ${versionedInstaller}: ${hash}`);
if (args.macosDmg) {
  console.log(`macOS DMG copied as Multi-Converter_${version}_macos-universal.dmg`);
  console.log("macOS stable DMG alias copied as Multi-Converter_macos-universal.dmg");
  console.log(`macOS updater archive copied as Multi-Converter_${version}_macos-universal.app.tar.gz`);
  console.log(`macOS updater signature copied as Multi-Converter_${version}_macos-universal.app.tar.gz.sig`);
}
if (includeLinux) {
  console.log(`Linux AppImage copied as Multi-Converter_${version}_linux-x64.AppImage`);
  console.log("Linux stable AppImage alias copied as Multi-Converter_linux-x64.AppImage");
  console.log(`Linux updater signature copied as Multi-Converter_${version}_linux-x64.AppImage.sig`);
}

function parseArgs(rawArgs) {
  const parsed = {};
  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];
    if (arg === "--version") parsed.version = rawArgs[++index];
    else if (arg === "--tag") parsed.tag = rawArgs[++index];
    else if (arg === "--dir") parsed.dir = rawArgs[++index];
    else if (arg === "--bundle-dir") parsed.bundleDir = rawArgs[++index];
    else if (arg === "--notes") parsed.notes = rawArgs[++index];
    else if (arg === "--notes-env") parsed.notesEnv = rawArgs[++index];
    else if (arg === "--macos-dmg") parsed.macosDmg = rawArgs[++index];
    else if (arg === "--macos-updater-archive") parsed.macosUpdaterArchive = rawArgs[++index];
    else if (arg === "--macos-updater-signature") parsed.macosUpdaterSignature = rawArgs[++index];
    else if (arg === "--linux-appimage") parsed.linuxAppImage = rawArgs[++index];
    else if (arg === "--linux-appimage-signature") parsed.linuxAppImageSignature = rawArgs[++index];
    else fail(`Unknown argument: ${arg}`);
  }
  return parsed;
}

function readReleaseNotes(parsedArgs) {
  if (parsedArgs.notesEnv) {
    const value = process.env[parsedArgs.notesEnv];
    if (!value) fail(`Release notes environment variable is empty or missing: ${parsedArgs.notesEnv}`);
    return value;
  }

  if (parsedArgs.notes) {
    const notesPath = path.resolve(parsedArgs.notes);
    if (!fs.existsSync(notesPath)) fail(`Missing release notes: ${notesPath}`);
    return fs.readFileSync(notesPath, "utf8");
  }

  fail("Missing release notes. Pass --notes-env RELEASE_NOTES_BODY or --notes <path>.");
}

function readPackageVersion() {
  const pkg = JSON.parse(fs.readFileSync(path.resolve("package.json"), "utf8"));
  return pkg.version;
}

function copyFile(source, destination) {
  fs.copyFileSync(source, destination);
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

function sha256File(file) {
  const hash = createHash("sha256");
  hash.update(fs.readFileSync(file));
  return hash.digest("hex");
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
