import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const args = parseArgs(process.argv.slice(2));
const version = args.version ?? readPackageVersion();
const dmgPath = args.dmg ? path.resolve(args.dmg) : fail("Missing --dmg <path>.");
const expectedDmgName = `Multi-Converter_${version}_macos-universal.dmg`;
const expectedSidecarVersion = "8.1.1";

if (process.platform !== "darwin") {
  fail("macOS DMG verification must run on macOS. Use GitHub Actions macos-latest or a real Mac.");
}
if (!version.match(/^\d+\.\d+\.\d+$/)) {
  fail(`Invalid version "${version}". Expected X.Y.Z.`);
}
if (path.basename(dmgPath) !== expectedDmgName) {
  fail(`Unexpected DMG name. Expected ${expectedDmgName}, got ${path.basename(dmgPath)}.`);
}
assertFile(dmgPath, "macOS DMG");

run("hdiutil", ["verify", dmgPath], "DMG verification failed.");

const attachPlistPath = path.join(os.tmpdir(), `mc-dmg-attach-${process.pid}.plist`);
let mountPoint = null;

try {
  const attach = run("hdiutil", ["attach", dmgPath, "-nobrowse", "-readonly", "-plist"], "Unable to mount DMG.");
  fs.writeFileSync(attachPlistPath, attach.stdout, "utf8");
  const attachJson = plistToJson(attachPlistPath);
  mountPoint = mountPointFromAttach(attachJson);
  if (!mountPoint) fail("Unable to locate mounted DMG volume.");

  const appPath = findAppBundle(mountPoint);
  if (!appPath) fail("Mounted DMG does not contain a .app bundle.");
  if (path.basename(appPath) !== "Multi-Converter.app") {
    fail(`Unexpected app bundle name: ${path.basename(appPath)}`);
  }

  const info = plistToJson(path.join(appPath, "Contents", "Info.plist"));
  if (info.CFBundleShortVersionString !== version) {
    fail(`Info.plist version is ${info.CFBundleShortVersionString}, expected ${version}.`);
  }

  const executableName = info.CFBundleExecutable || "Multi-Converter";
  const appExecutable = path.join(appPath, "Contents", "MacOS", executableName);
  assertExecutable(appExecutable, "app executable");
  verifyUniversalBinary(appExecutable, "app executable");
  verifySidecar(appPath, "ffmpeg");
  verifySidecar(appPath, "ffprobe");
  verifyBundledEngines(appPath);

  run("codesign", ["--verify", "--deep", "--strict", appPath], "App code signature verification failed.");
  console.log(`macOS DMG verified: ${dmgPath}`);
} finally {
  if (mountPoint) {
    spawnSync("hdiutil", ["detach", mountPoint, "-quiet"], { stdio: "ignore" });
  }
  fs.rmSync(attachPlistPath, { force: true });
}

function verifySidecar(appPath, stem) {
  const candidates = sidecarSearchDirs(appPath)
    .flatMap((dir) => findFiles(dir, (filePath) => {
      const name = path.basename(filePath);
      return name === stem || name.startsWith(`${stem}-`);
    }, { maxDepth: 1 }))
    .filter((candidate, index, all) => all.indexOf(candidate) === index);
  if (!candidates.length) {
    fail(`Missing ${stem} sidecar in app bundle.`);
  }
  const universal = candidates.find((candidate) => hasArchitectures(candidate, "arm64", "x86_64"));
  if (!universal) {
    fail(`${stem} sidecar is present but no universal arm64 + x86_64 binary was found.`);
  }
  assertExecutable(universal, `${stem} sidecar`);
  verifySidecarVersion(universal, stem);
}

function sidecarSearchDirs(appPath) {
  return [
    path.join(appPath, "Contents", "MacOS"),
    path.join(appPath, "Contents", "Resources"),
    path.join(appPath, "Contents", "Resources", "binaries"),
  ].filter((dir) => fs.existsSync(dir));
}

function verifyBundledEngines(appPath) {
  const enginesDir = path.join(appPath, "Contents", "Resources", "engines");
  if (!fs.existsSync(enginesDir)) return;

  const files = findFiles(enginesDir, () => true, { maxDepth: 32 });
  if (!files.length) return;

  const windowsOnly = files.find((filePath) => isUnexpectedWindowsOnlyResource(appPath, filePath));
  if (windowsOnly) {
    fail(`Windows-only bundled engine resource found in macOS app bundle: ${path.relative(appPath, windowsOnly)}`);
  }

  const metadataFiles = files.filter((filePath) => path.basename(filePath) === "engine.json");
  if (!metadataFiles.length) {
    fail("Bundled engine resources are present in the macOS app bundle, but no engine.json metadata was found.");
  }

  for (const metadataPath of metadataFiles) {
    const metadata = readJson(metadataPath, `Unable to read bundled engine metadata: ${path.relative(appPath, metadataPath)}`);
    if (metadata.platform !== "macos-universal") {
      fail(`Bundled engine metadata targets ${metadata.platform ?? "<missing>"} instead of macos-universal: ${path.relative(appPath, metadataPath)}`);
    }
    if (!metadata.engineId || !metadata.version) {
      fail(`Bundled engine metadata is missing engineId or version: ${path.relative(appPath, metadataPath)}`);
    }
    for (const relative of metadata.binaryPaths ?? []) {
      const binaryPath = path.join(path.dirname(metadataPath), normalizeArchivePath(relative));
      assertFile(binaryPath, `${metadata.engineId} bundled engine binary`);
      if (path.extname(binaryPath) === "") {
        assertExecutable(binaryPath, `${metadata.engineId} bundled engine executable`);
      }
    }
  }
}

function isUnexpectedWindowsOnlyResource(appPath, filePath) {
  if (!/\.(bat|cmd|dll|exe|msi|ps1)$/i.test(filePath)) return false;
  const relativePath = path.relative(appPath, filePath).replaceAll(path.sep, "/");
  if (/^Contents\/Resources\/engines\/libreoffice\/compatible\/[^/]+\/LibreOffice\.app\/Contents\/Frameworks\/LibreOfficePython\.framework\/Versions\/[^/]+\/lib\/python[^/]+\/ctypes\/macholib\/fetch_macholib\.bat$/i.test(relativePath)) {
    return false;
  }
  return true;
}

function hasArchitectures(filePath, ...architectures) {
  const result = spawnSync("lipo", [filePath, "-verify_arch", ...architectures], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return result.status === 0;
}

function verifyUniversalBinary(filePath, label) {
  if (!hasArchitectures(filePath, "arm64", "x86_64")) {
    fail(`${label} is not universal arm64 + x86_64: ${filePath}`);
  }
}

function verifySidecarVersion(filePath, stem) {
  const result = run(filePath, ["-version"], `${stem} sidecar failed to start.`);
  if (!result.stdout.includes(expectedSidecarVersion) && !result.stderr.includes(expectedSidecarVersion)) {
    fail(`${stem} sidecar version output does not include ${expectedSidecarVersion}.`);
  }
}

function assertFile(filePath, label) {
  const stat = fs.statSync(filePath, { throwIfNoEntry: false });
  if (!stat?.isFile() || stat.size <= 0) {
    fail(`Missing or empty ${label}: ${filePath}`);
  }
}

function assertExecutable(filePath, label) {
  assertFile(filePath, label);
  const stat = fs.statSync(filePath);
  if ((stat.mode & 0o111) === 0) {
    fail(`${label} is not executable: ${filePath}`);
  }
}

function findAppBundle(mountPoint) {
  const apps = findFiles(mountPoint, (filePath) => filePath.endsWith(".app"), { directories: true, maxDepth: 2 });
  if (apps.length > 1) {
    fail(`Mounted DMG contains multiple app bundles: ${apps.map((app) => path.basename(app)).join(", ")}`);
  }
  return apps[0] ?? null;
}

function findFiles(startDir, predicate, options = {}) {
  const results = [];
  const maxDepth = options.maxDepth ?? 16;
  const includeDirectories = options.directories === true;

  function walk(dir, depth) {
    if (depth > maxDepth) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (includeDirectories && predicate(full)) results.push(full);
        walk(full, depth + 1);
      } else if (entry.isFile() && predicate(full)) {
        results.push(full);
      }
    }
  }

  walk(startDir, 0);
  return results;
}

function plistToJson(plistPath) {
  const result = run("plutil", ["-convert", "json", "-o", "-", plistPath], `Unable to read plist: ${plistPath}`);
  return JSON.parse(result.stdout);
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
  if (!normalized || normalized.startsWith("/") || normalized.includes("//")) {
    fail(`Invalid bundled engine path in metadata: ${relative}`);
  }
  const parts = normalized.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) {
    fail(`Ambiguous bundled engine path in metadata: ${relative}`);
  }
  return normalized;
}

function mountPointFromAttach(attachJson) {
  for (const entity of attachJson["system-entities"] ?? []) {
    if (typeof entity["mount-point"] === "string" && entity["mount-point"]) {
      return entity["mount-point"];
    }
  }
  return null;
}

function run(command, commandArgs, message) {
  const result = spawnSync(command, commandArgs, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
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
