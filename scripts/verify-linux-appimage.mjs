import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { readElfHeader } from "./lib/elf.mjs";
import { readRequiredFfmpegVersion } from "./lib/ffmpeg-version.mjs";

const root = process.cwd();
const args = parseArgs(process.argv.slice(2));
const version = args.version ?? readPackageVersion();
const appImagePath = args.appimage ? path.resolve(args.appimage) : fail("Missing --appimage <path>.");
const signaturePath = args.signature ? path.resolve(args.signature) : `${appImagePath}.sig`;
const expectedAppImageName = `Multi-Converter_${version}_linux-x64.AppImage`;
const expectedSidecarVersion = readRequiredFfmpegVersion(root);
const requiredAdvancedEngines = ["pdfium", "libreoffice", "pandoc", "libvips"];

if (process.platform !== "linux" || process.arch !== "x64") {
  fail(`Linux AppImage verification must run on Linux x64, current host is ${process.platform}/${process.arch}.`);
}
if (!version.match(/^\d+\.\d+\.\d+$/)) {
  fail(`Invalid version "${version}". Expected X.Y.Z.`);
}
if (path.basename(appImagePath) !== expectedAppImageName) {
  fail(`Unexpected AppImage name. Expected ${expectedAppImageName}, got ${path.basename(appImagePath)}.`);
}

assertFile(appImagePath, "Linux AppImage");
assertFile(signaturePath, "Linux AppImage updater signature");
assertElf(appImagePath);
assertSignature(signaturePath);
verifyUpdaterSignature(appImagePath, signaturePath);

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mc-appimage-verify-"));

try {
  fs.chmodSync(appImagePath, fs.statSync(appImagePath).mode | 0o755);
  run(appImagePath, ["--appimage-extract"], "Unable to extract Linux AppImage.", { cwd: tempDir, timeout: 120000 });

  const appDir = path.join(tempDir, "squashfs-root");
  const appRun = path.join(appDir, "AppRun");
  assertExecutable(appRun, "AppImage AppRun");

  const desktopFiles = findFiles(appDir, (filePath) => filePath.endsWith(".desktop"), { maxDepth: 4 });
  if (!desktopFiles.length) {
    fail("Extracted AppImage does not contain a desktop entry.");
  }
  if (!desktopFiles.some((filePath) => /Multi-Converter/i.test(fs.readFileSync(filePath, "utf8")))) {
    fail("Extracted AppImage desktop entry does not mention Multi-Converter.");
  }

  verifyNoForeignPlatformFiles(appDir);
  verifyLinuxSidecar(appDir, "ffmpeg");
  verifyLinuxSidecar(appDir, "ffprobe");
  verifyBundledEngines(appDir);

  console.log(`Linux AppImage verified: ${appImagePath}`);
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

function verifyLinuxSidecar(appDir, stem) {
  const candidates = findFiles(appDir, (filePath) => {
    const name = path.basename(filePath);
    return name === stem || name === `${stem}-x86_64-unknown-linux-gnu` || name.startsWith(`${stem}-`);
  }, { maxDepth: 8 });

  if (!candidates.length) {
    fail(`Missing ${stem} sidecar in extracted AppImage.`);
  }

  const selected = candidates.find((candidate) => fs.statSync(candidate).mode & 0o111) ?? candidates[0];
  assertExecutable(selected, `${stem} sidecar`);
  assertLinuxElfExecutable(selected, `${stem} sidecar`);
  const result = run(selected, ["-version"], `${stem} sidecar failed to start.`, { cwd: path.dirname(selected), timeout: 30000 });
  if (!result.stdout.includes(expectedSidecarVersion) && !result.stderr.includes(expectedSidecarVersion)) {
    fail(`${stem} sidecar version output does not include ${expectedSidecarVersion}.`);
  }
}

function verifyBundledEngines(appDir) {
  const metadataFiles = findFiles(appDir, (filePath) => path.basename(filePath) === "engine.json", { maxDepth: 16 });
  const foundAdvancedEngines = [];
  for (const metadataPath of metadataFiles) {
    const metadata = readJson(metadataPath, `Unable to read bundled engine metadata: ${path.relative(appDir, metadataPath)}`);
    if (metadata.platform !== "linux-x64") {
      fail(`Bundled engine metadata targets ${metadata.platform ?? "<missing>"} instead of linux-x64: ${path.relative(appDir, metadataPath)}`);
    }
    if (!metadata.engineId || !metadata.version) {
      fail(`Bundled engine metadata is missing engineId or version: ${path.relative(appDir, metadataPath)}`);
    }
    if (metadata.mode === "advanced") {
      foundAdvancedEngines.push(metadata.engineId);
    } else {
      fail(`Unexpected non-advanced Linux bundled engine metadata: ${metadata.engineId}.`);
    }
    for (const relative of metadata.binaryPaths ?? []) {
      const normalized = normalizeArchivePath(relative);
      if (/\.(app|bat|cmd|dll|dmg|dylib|exe|msi|pkg|ps1)(?:\/|$)/i.test(normalized)) {
        fail(`${metadata.engineId}: Linux bundled engine binaryPaths must not reference non-Linux files (${relative}).`);
      }
      const binaryPath = path.join(path.dirname(metadataPath), normalized);
      assertFile(binaryPath, `${metadata.engineId} bundled engine binary`);
      if (path.extname(binaryPath) === "") {
        assertExecutable(binaryPath, `${metadata.engineId} bundled engine executable`);
      }
    }
  }
  const duplicates = foundAdvancedEngines.filter((engineId, index) => foundAdvancedEngines.indexOf(engineId) !== index);
  if (duplicates.length > 0) {
    fail(`Linux AppImage contains duplicate advanced bundled engines: ${[...new Set(duplicates)].join(", ")}.`);
  }
  const unexpected = foundAdvancedEngines.filter((engineId) => !requiredAdvancedEngines.includes(engineId));
  if (unexpected.length > 0) {
    fail(`Linux AppImage contains unexpected advanced bundled engines: ${unexpected.join(", ")}.`);
  }
  const foundAdvancedEngineSet = new Set(foundAdvancedEngines);
  const missing = requiredAdvancedEngines.filter((engineId) => !foundAdvancedEngineSet.has(engineId));
  if (missing.length > 0) {
    fail(`Linux AppImage is missing required advanced bundled engines: ${missing.join(", ")}.`);
  }
}

function verifyNoForeignPlatformFiles(appDir) {
  const foreignPlatformFile = findFiles(appDir, (filePath) => /\.(bat|cmd|dll|dmg|dylib|exe|msi|pkg|ps1)$/i.test(filePath), {
    maxDepth: 16,
  })[0];
  if (foreignPlatformFile) {
    fail(`Non-Linux file found in Linux AppImage: ${path.relative(appDir, foreignPlatformFile)}`);
  }

  const foreignSidecar = findFiles(appDir, (filePath) => {
    const name = path.basename(filePath);
    return /^(ffmpeg|ffprobe)-/.test(name) && !/-x86_64-unknown-linux-gnu$/.test(name);
  }, { maxDepth: 16 })[0];
  if (foreignSidecar) {
    fail(`Non-Linux sidecar found in Linux AppImage: ${path.relative(appDir, foreignSidecar)}`);
  }
}

function assertElf(filePath) {
  const header = readElfHeader(filePath);
  if (!header.isElf) {
    fail(`Linux AppImage is not an ELF executable: ${filePath}`);
  }
  if (!header.is64Bit || !header.isLittleEndian || header.machine !== 0x3e) {
    fail(`Linux AppImage is not an x86_64 ELF executable: ${filePath}`);
  }
}

function assertLinuxElfExecutable(filePath, label) {
  const header = readElfHeader(filePath);
  if (!header.isElf) {
    fail(`${label} is not an ELF executable: ${filePath}`);
  }
  if (!header.is64Bit || !header.isLittleEndian || header.machine !== 0x3e) {
    fail(`${label} is not an x86_64 ELF executable: ${filePath}`);
  }
}

function assertSignature(filePath) {
  const signature = fs.readFileSync(filePath, "utf8").trim();
  if (signature.length < 32) {
    fail(`Linux AppImage updater signature is unexpectedly short: ${filePath}`);
  }
  if (/PRIVATE KEY/i.test(signature)) {
    fail(`Linux AppImage updater signature appears to contain private-key material: ${filePath}`);
  }
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
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    fail(result.stderr || result.stdout || "Linux AppImage updater signature verification failed.");
  }
}

function writeDecodedUpdaterSignature(signaturePath) {
  const raw = fs.readFileSync(signaturePath, "utf8").trim();
  if (raw.startsWith("untrusted comment:")) {
    return signaturePath;
  }
  const decoded = Buffer.from(raw, "base64").toString("utf8");
  if (!decoded.startsWith("untrusted comment:")) {
    fail("Linux AppImage updater signature is not a valid Tauri/minisign signature.");
  }
  const decodedPath = path.join(os.tmpdir(), `mc-linux-appimage-signature-${process.pid}.sig`);
  fs.writeFileSync(decodedPath, decoded, "utf8");
  return decodedPath;
}

function writeConfiguredUpdaterPublicKey() {
  const config = readJson(path.join(root, "src-tauri", "tauri.conf.json"), "Unable to read Tauri updater config");
  const encoded = config.plugins?.updater?.pubkey;
  if (typeof encoded !== "string" || encoded.trim() === "") {
    fail("Tauri updater public key is missing from src-tauri/tauri.conf.json.");
  }
  const publicKey = Buffer.from(encoded, "base64").toString("utf8");
  if (!publicKey.includes("minisign public key")) {
    fail("Tauri updater public key does not look like a minisign public key.");
  }
  const keyPath = path.join(os.tmpdir(), `mc-linux-appimage-public-key-${process.pid}.pub`);
  fs.writeFileSync(keyPath, publicKey, "utf8");
  return keyPath;
}

function assertFile(filePath, label) {
  const stat = fs.statSync(filePath, { throwIfNoEntry: false });
  if (!stat?.isFile() || stat.size <= 0) {
    fail(`Missing or empty ${label}: ${filePath}`);
  }
}

function assertExecutable(filePath, label) {
  assertFile(filePath, label);
  if ((fs.statSync(filePath).mode & 0o111) === 0) {
    fail(`${label} is not executable: ${filePath}`);
  }
}

function findFiles(startDir, predicate, options = {}) {
  const results = [];
  const maxDepth = options.maxDepth ?? 16;
  function walk(dir, depth) {
    if (depth > maxDepth) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath, depth + 1);
      } else if (entry.isFile() && predicate(fullPath)) {
        results.push(fullPath);
      }
    }
  }
  walk(startDir, 0);
  return results;
}

function readJson(filePath, message) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    fail(`${message}\n${error.message}`);
  }
}

function normalizeArchivePath(relative) {
  const normalized = String(relative).replaceAll("\\", "/");
  if (!normalized || normalized.startsWith("/") || /^[A-Za-z]:\//.test(normalized) || normalized.includes("//")) {
    fail(`Invalid bundled engine path in metadata: ${relative}`);
  }
  const parts = normalized.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) {
    fail(`Ambiguous bundled engine path in metadata: ${relative}`);
  }
  return normalized;
}

function run(command, commandArgs, message, options = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd: options.cwd ?? root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: options.timeout,
  });
  if (result.status !== 0) {
    fail(`${message}\n${result.stderr || result.stdout || `${command} failed.`}`);
  }
  return result;
}

function parseArgs(rawArgs) {
  const parsed = {};
  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];
    if (arg === "--version") parsed.version = rawArgs[++index];
    else if (arg === "--appimage") parsed.appimage = rawArgs[++index];
    else if (arg === "--signature") parsed.signature = rawArgs[++index];
    else if (arg === "--updater-public-key") parsed.updaterPublicKey = rawArgs[++index];
    else if (arg === "--updater-signature-verifier") parsed.updaterSignatureVerifier = rawArgs[++index];
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
