import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expectedMacosDmgName, stableMacosDmgName, validateReleaseNotes } from "./lib/release-notes-validation.mjs";
import { isX86_64Elf } from "./lib/elf.mjs";

const args = parseArgs(process.argv.slice(2));
const version = args.version ?? readPackageVersion();
const tag = `v${version}`;
const dir = args.dir ? path.resolve(args.dir) : path.join(os.tmpdir(), "mc-release-assets", tag);
const platformSet = args.platform ?? "windows";
const includeWindows = platformSet === "windows" || platformSet === "all" || platformSet === "windows-linux" || platformSet === "desktop";
const includeMacos = platformSet === "macos" || platformSet === "all" || platformSet === "desktop";
const includeLinux = platformSet === "linux" || platformSet === "windows-linux" || platformSet === "desktop";

if (!version.match(/^\d+\.\d+\.\d+$/)) {
  fail(`Invalid version "${version}". Expected X.Y.Z.`);
}
if (!fs.existsSync(dir)) {
  fail(`Release asset directory does not exist: ${dir}`);
}
if (!["windows", "macos", "linux", "all", "windows-linux", "desktop"].includes(platformSet)) {
  fail(`Invalid --platform "${platformSet}". Expected windows, macos, linux, all, windows-linux or desktop.`);
}

const versionedInstaller = `Multi-Converter_${version}_x64-setup.exe`;
const stableInstaller = "Multi-Converter_windows-x64_setup.exe";
const signatureFile = `${versionedInstaller}.sig`;
const checksumFile = `${versionedInstaller}.sha256`;
const macosDmg = expectedMacosDmgName(version);
const stableMacosDmg = stableMacosDmgName();
const macosUpdaterArchive = `Multi-Converter_${version}_macos-universal.app.tar.gz`;
const macosUpdaterSignature = `${macosUpdaterArchive}.sig`;
const linuxAppImage = `Multi-Converter_${version}_linux-x64.AppImage`;
const stableLinuxAppImage = "Multi-Converter_linux-x64.AppImage";
const linuxAppImageSignature = `${linuxAppImage}.sig`;
const linuxAppImageChecksum = `${linuxAppImage}.sha256`;
const expectedNames = [
  ...(includeWindows ? [checksumFile, "latest.json", signatureFile, stableInstaller, versionedInstaller] : []),
  ...(includeMacos ? [macosDmg, stableMacosDmg, macosUpdaterArchive, macosUpdaterSignature] : []),
  ...(includeLinux ? [linuxAppImage, stableLinuxAppImage, linuxAppImageSignature, linuxAppImageChecksum, ...(includeWindows ? [] : ["latest.json"])] : []),
].sort();
const actualNames = fs.readdirSync(dir).filter((name) => fs.statSync(path.join(dir, name)).isFile()).sort();

assertArrayEqual(actualNames, expectedNames, "Release asset set must contain exactly the required files.");

const versionedPath = path.join(dir, versionedInstaller);
const stablePath = path.join(dir, stableInstaller);
const signaturePath = path.join(dir, signatureFile);
const checksumPath = path.join(dir, checksumFile);
const latestPath = path.join(dir, "latest.json");

let latest = null;

if (includeWindows) {
  const versionedHash = sha256File(versionedPath);
  const stableHash = sha256File(stablePath);
  if (versionedHash !== stableHash) {
    fail(`Stable setup alias hash does not match versioned installer hash.\n${versionedHash}\n${stableHash}`);
  }

  const checksumText = fs.readFileSync(checksumPath, "utf8").trim();
  if (checksumText !== `${versionedHash}  ${versionedInstaller}`) {
    fail(`Checksum file must be "<sha256>  ${versionedInstaller}".`);
  }

  const signature = fs.readFileSync(signaturePath, "utf8").trim();
  if (!signature || signature.length < 100) {
    fail("Updater signature is missing or unexpectedly short.");
  }
  verifyUpdaterSignature(versionedPath, signaturePath);

  latest = JSON.parse(fs.readFileSync(latestPath, "utf8"));
  if (latest.version !== version) fail(`latest.json version is ${latest.version}, expected ${version}.`);
  if (!latest.pub_date || Number.isNaN(Date.parse(latest.pub_date))) fail("latest.json pub_date is missing or invalid.");
  if (typeof latest.notes !== "string" || latest.notes.length < 200) fail("latest.json notes are missing or too short.");

  const expectedUrl = `https://github.com/Amix29/Multi-Converter/releases/download/${tag}/${versionedInstaller}`;
  const expectedPlatforms = [
    "windows-x86_64",
    "windows-x86_64-nsis",
    ...(includeMacos ? ["darwin-aarch64", "darwin-x86_64"] : []),
    ...(includeLinux ? ["linux-x86_64"] : []),
  ];
  const actualPlatforms = Object.keys(latest.platforms ?? {}).sort();
  assertArrayEqual(actualPlatforms, expectedPlatforms.sort(), "latest.json must contain exactly the expected updater platforms.");

  for (const platform of ["windows-x86_64", "windows-x86_64-nsis"]) {
    const entry = latest.platforms?.[platform];
    if (!entry) fail(`latest.json missing platform ${platform}.`);
    if (entry.url !== expectedUrl) fail(`latest.json ${platform} URL is ${entry.url}, expected ${expectedUrl}.`);
    if (entry.signature !== signature) fail(`latest.json ${platform} signature does not match ${signatureFile}.`);
  }

  if (includeMacos) {
    const macosSignatureText = fs.readFileSync(path.join(dir, macosUpdaterSignature), "utf8").trim();
    const expectedMacosUpdaterUrl = `https://github.com/Amix29/Multi-Converter/releases/download/${tag}/${macosUpdaterArchive}`;
    if (!macosSignatureText || macosSignatureText.length < 100) {
      fail("macOS updater signature is missing or unexpectedly short.");
    }
    verifyUpdaterSignature(path.join(dir, macosUpdaterArchive), path.join(dir, macosUpdaterSignature));
    for (const platform of ["darwin-aarch64", "darwin-x86_64"]) {
      const entry = latest.platforms?.[platform];
      if (!entry) fail(`latest.json missing platform ${platform}.`);
      if (entry.url !== expectedMacosUpdaterUrl) fail(`latest.json ${platform} URL is ${entry.url}, expected ${expectedMacosUpdaterUrl}.`);
      if (entry.signature !== macosSignatureText) fail(`latest.json ${platform} signature does not match ${macosUpdaterSignature}.`);
    }
  }

  if (includeLinux) {
    validateLinuxUpdaterEntry(latest);
  }

  const notesValidation = validateReleaseNotes({ body: latest.notes, version, includeMacos, includeLinux, minLength: 200 });
  if (!notesValidation.ok) fail(notesValidation.errors.join("\n"));
}

if (includeLinux) {
  const appImagePath = path.join(dir, linuxAppImage);
  const stableAppImagePath = path.join(dir, stableLinuxAppImage);
  const signaturePath = path.join(dir, linuxAppImageSignature);
  const checksumPath = path.join(dir, linuxAppImageChecksum);
  const stat = fs.statSync(appImagePath);
  if (!stat.isFile() || stat.size <= 0) fail(`Linux AppImage is missing or empty: ${linuxAppImage}`);
  if (!isX86_64Elf(appImagePath)) fail(`Linux AppImage is not an x86_64 ELF executable: ${linuxAppImage}`);
  const stableStat = fs.statSync(stableAppImagePath);
  if (!stableStat.isFile() || stableStat.size <= 0) fail(`Stable Linux AppImage alias is missing or empty: ${stableLinuxAppImage}`);
  if (!isX86_64Elf(stableAppImagePath)) fail(`Stable Linux AppImage alias is not an x86_64 ELF executable: ${stableLinuxAppImage}`);
  const versionedHash = sha256File(appImagePath);
  const stableHash = sha256File(stableAppImagePath);
  if (versionedHash !== stableHash) {
    fail(`Stable Linux AppImage alias hash does not match versioned AppImage hash.\n${versionedHash}\n${stableHash}`);
  }
  const checksumText = fs.readFileSync(checksumPath, "utf8").trim();
  if (checksumText !== `${versionedHash}  ${linuxAppImage}`) {
    fail(`Linux checksum file must be "<sha256>  ${linuxAppImage}".`);
  }
  const signature = fs.readFileSync(signaturePath, "utf8").trim();
  if (!signature || signature.length < 100) {
    fail("Linux updater signature is missing or unexpectedly short.");
  }
  verifyUpdaterSignature(appImagePath, signaturePath);
  if (args.linuxAppImageSha256 && versionedHash !== args.linuxAppImageSha256.toLowerCase()) {
    fail(`Linux AppImage SHA-256 mismatch. Expected ${args.linuxAppImageSha256}, got ${versionedHash}.`);
  }
  if (!includeWindows) {
    latest = JSON.parse(fs.readFileSync(latestPath, "utf8"));
    if (latest.version !== version) fail(`latest.json version is ${latest.version}, expected ${version}.`);
    if (!latest.pub_date || Number.isNaN(Date.parse(latest.pub_date))) fail("latest.json pub_date is missing or invalid.");
    if (typeof latest.notes !== "string" || latest.notes.length < 200) fail("latest.json notes are missing or too short.");
    assertArrayEqual(Object.keys(latest.platforms ?? {}).sort(), ["linux-x86_64"], "latest.json must contain exactly the expected Linux updater platform.");
    validateLinuxUpdaterEntry(latest);
    const notesValidation = validateReleaseNotes({ body: latest.notes, version, includeMacos: false, includeLinux: true, minLength: 200 });
    if (!notesValidation.ok) fail(notesValidation.errors.join("\n"));
  }
}

if (includeMacos) {
  const dmgPath = path.join(dir, macosDmg);
  const stableDmgPath = path.join(dir, stableMacosDmg);
  const stat = fs.statSync(dmgPath);
  if (!stat.isFile() || stat.size <= 0) fail(`macOS DMG is missing or empty: ${macosDmg}`);
  const stableStat = fs.statSync(stableDmgPath);
  if (!stableStat.isFile() || stableStat.size <= 0) fail(`Stable macOS DMG alias is missing or empty: ${stableMacosDmg}`);
  const versionedDmgHash = sha256File(dmgPath);
  const stableDmgHash = sha256File(stableDmgPath);
  if (versionedDmgHash !== stableDmgHash) {
    fail(`Stable macOS DMG alias hash does not match versioned DMG hash.\n${versionedDmgHash}\n${stableDmgHash}`);
  }
  if (args.macosDmgSha256) {
    const actual = versionedDmgHash;
    if (actual !== args.macosDmgSha256.toLowerCase()) {
      fail(`macOS DMG SHA-256 mismatch. Expected ${args.macosDmgSha256}, got ${actual}.`);
    }
  } else if (process.platform === "darwin") {
    const result = spawnSync(process.execPath, [
      "scripts/verify-macos-dmg.mjs",
      "--version",
      version,
      "--dmg",
      dmgPath,
    ], {
      cwd: path.resolve("."),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    if (result.status !== 0) fail(result.stderr || result.stdout || "macOS DMG verification failed.");
  } else {
    fail("macOS DMG validation requires --macos-dmg-sha256 from a verified macOS DMG job when running off macOS.");
  }
  const updaterPath = path.join(dir, macosUpdaterArchive);
  const updaterStat = fs.statSync(updaterPath);
  if (!updaterStat.isFile() || updaterStat.size <= 0) fail(`macOS updater archive is missing or empty: ${macosUpdaterArchive}`);
  if (args.macosUpdaterSha256) {
    const actual = sha256File(updaterPath);
    if (actual !== args.macosUpdaterSha256.toLowerCase()) {
      fail(`macOS updater archive SHA-256 mismatch. Expected ${args.macosUpdaterSha256}, got ${actual}.`);
    }
  }
}

console.log(`Release assets validated for Multi-Converter v${version} (${platformSet}): ${dir}`);

function parseArgs(rawArgs) {
  const parsed = {};
  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];
    if (arg === "--version") parsed.version = rawArgs[++index];
    else if (arg === "--dir") parsed.dir = rawArgs[++index];
    else if (arg === "--platform") parsed.platform = rawArgs[++index];
    else if (arg === "--updater-public-key") parsed.updaterPublicKey = rawArgs[++index];
    else if (arg === "--updater-signature-verifier") parsed.updaterSignatureVerifier = rawArgs[++index];
    else if (arg === "--macos-dmg-sha256") parsed.macosDmgSha256 = rawArgs[++index];
    else if (arg === "--macos-updater-sha256") parsed.macosUpdaterSha256 = rawArgs[++index];
    else if (arg === "--linux-appimage-sha256") parsed.linuxAppImageSha256 = rawArgs[++index];
    else fail(`Unknown argument: ${arg}`);
  }
  return parsed;
}

function validateLinuxUpdaterEntry(latestJson) {
  const linuxSignatureText = fs.readFileSync(path.join(dir, linuxAppImageSignature), "utf8").trim();
  const expectedLinuxUrl = `https://github.com/Amix29/Multi-Converter/releases/download/${tag}/${linuxAppImage}`;
  const entry = latestJson.platforms?.["linux-x86_64"];
  if (!entry) fail("latest.json missing platform linux-x86_64.");
  if (entry.url !== expectedLinuxUrl) fail(`latest.json linux-x86_64 URL is ${entry.url}, expected ${expectedLinuxUrl}.`);
  if (entry.signature !== linuxSignatureText) fail(`latest.json linux-x86_64 signature does not match ${linuxAppImageSignature}.`);
}

function readPackageVersion() {
  const pkg = JSON.parse(fs.readFileSync(path.resolve("package.json"), "utf8"));
  return pkg.version;
}

function sha256File(file) {
  const hash = createHash("sha256");
  hash.update(fs.readFileSync(file));
  return hash.digest("hex");
}

function verifyUpdaterSignature(filePath, signaturePath) {
  const publicKeyPath = args.updaterPublicKey
    ? path.resolve(args.updaterPublicKey)
    : writeConfiguredUpdaterPublicKey();
  const decodedSignaturePath = writeDecodedUpdaterSignature(signaturePath);
  const verifier = args.updaterSignatureVerifier ? path.resolve(args.updaterSignatureVerifier) : null;
  const command = verifier ?? "cargo";
  const commandArgs = verifier ? [
    "--public-key",
    publicKeyPath,
    "--file",
    filePath,
    "--signature",
    decodedSignaturePath,
  ] : [
    "run",
    "--quiet",
    "--manifest-path",
    path.join("tools", "updater-signature-verifier", "Cargo.toml"),
    "--",
    "--public-key",
    publicKeyPath,
    "--file",
    filePath,
    "--signature",
    decodedSignaturePath,
  ];
  const result = spawnSync(command, commandArgs, {
    cwd: path.resolve("."),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  if (result.status !== 0) {
    fail(result.stderr || result.stdout || "Updater signature verification failed.");
  }
}

function writeDecodedUpdaterSignature(signaturePath) {
  const raw = fs.readFileSync(signaturePath, "utf8").trim();
  if (raw.startsWith("untrusted comment:")) {
    return signaturePath;
  }
  const decoded = Buffer.from(raw, "base64").toString("utf8");
  if (!decoded.startsWith("untrusted comment:")) {
    fail("Updater signature is not a valid Tauri/minisign signature.");
  }
  const decodedPath = path.join(os.tmpdir(), `mc-updater-signature-${process.pid}.sig`);
  fs.writeFileSync(decodedPath, decoded, "utf8");
  return decodedPath;
}

function writeConfiguredUpdaterPublicKey() {
  const config = JSON.parse(fs.readFileSync(path.join("src-tauri", "tauri.conf.json"), "utf8"));
  const encoded = config.plugins?.updater?.pubkey;
  if (typeof encoded !== "string" || encoded.trim() === "") {
    fail("Tauri updater public key is missing from src-tauri/tauri.conf.json.");
  }
  const publicKey = Buffer.from(encoded, "base64").toString("utf8");
  if (!publicKey.includes("minisign public key")) {
    fail("Tauri updater public key does not look like a minisign public key.");
  }
  const keyPath = path.join(os.tmpdir(), `mc-updater-public-key-${process.pid}.pub`);
  fs.writeFileSync(keyPath, publicKey, "utf8");
  return keyPath;
}

function assertArrayEqual(actual, expected, message) {
  if (actual.length !== expected.length || actual.some((value, index) => value !== expected[index])) {
    fail(`${message}\nExpected: ${expected.join(", ")}\nActual:   ${actual.join(", ")}`);
  }
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
