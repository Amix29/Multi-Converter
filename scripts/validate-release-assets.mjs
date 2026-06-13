import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expectedMacosDmgName, validateReleaseNotes } from "./lib/release-notes-validation.mjs";

const args = parseArgs(process.argv.slice(2));
const version = args.version ?? readPackageVersion();
const tag = `v${version}`;
const dir = args.dir ? path.resolve(args.dir) : path.join(os.tmpdir(), "mc-release-assets", tag);
const platformSet = args.platform ?? "windows";
const includeWindows = platformSet === "windows" || platformSet === "all";
const includeMacos = platformSet === "macos" || platformSet === "all";

if (!version.match(/^\d+\.\d+\.\d+$/)) {
  fail(`Invalid version "${version}". Expected X.Y.Z.`);
}
if (!fs.existsSync(dir)) {
  fail(`Release asset directory does not exist: ${dir}`);
}
if (!["windows", "macos", "all"].includes(platformSet)) {
  fail(`Invalid --platform "${platformSet}". Expected windows, macos or all.`);
}

const versionedInstaller = `Multi-Converter_${version}_x64-setup.exe`;
const stableInstaller = "Multi-Converter_windows-x64_setup.exe";
const signatureFile = `${versionedInstaller}.sig`;
const checksumFile = `${versionedInstaller}.sha256`;
const macosDmg = expectedMacosDmgName(version);
const expectedNames = [
  ...(includeWindows ? [checksumFile, "latest.json", signatureFile, stableInstaller, versionedInstaller] : []),
  ...(includeMacos ? [macosDmg] : []),
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
  const expectedPlatforms = ["windows-x86_64", "windows-x86_64-nsis"];
  const actualPlatforms = Object.keys(latest.platforms ?? {}).sort();
  assertArrayEqual(actualPlatforms, expectedPlatforms.sort(), "latest.json must contain exactly the expected updater platforms.");

  for (const platform of expectedPlatforms) {
    const entry = latest.platforms?.[platform];
    if (!entry) fail(`latest.json missing platform ${platform}.`);
    if (entry.url !== expectedUrl) fail(`latest.json ${platform} URL is ${entry.url}, expected ${expectedUrl}.`);
    if (entry.signature !== signature) fail(`latest.json ${platform} signature does not match ${signatureFile}.`);
  }

  const notesValidation = validateReleaseNotes({ body: latest.notes, version, includeMacos, minLength: 200 });
  if (!notesValidation.ok) fail(notesValidation.errors.join("\n"));
}

if (includeMacos) {
  const dmgPath = path.join(dir, macosDmg);
  const stat = fs.statSync(dmgPath);
  if (!stat.isFile() || stat.size <= 0) fail(`macOS DMG is missing or empty: ${macosDmg}`);
  if (args.macosDmgSha256) {
    const actual = sha256File(dmgPath);
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
    else fail(`Unknown argument: ${arg}`);
  }
  return parsed;
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
