import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const binariesDir = path.join(root, "src-tauri", "binaries");
const requiredTargets = ["aarch64-apple-darwin", "x86_64-apple-darwin"];
const sidecars = ["ffmpeg", "ffprobe"];
const expectedSidecarVersion = "8.1.1";

if (process.platform !== "darwin") {
  fail("Real macOS host validation must run on macOS. Use GitHub Actions macos-latest or a real Mac.");
}

requireCommand("xcode-select", ["-p"], "Xcode Command Line Tools are required.");
requireCommand("xcrun", ["-find", "lipo"], "lipo is required to validate universal sidecars.");

const installedTargets = commandOutput("rustup", ["target", "list", "--installed"], "rustup target list failed.");
for (const target of requiredTargets) {
  if (!installedTargets.split(/\r?\n/).includes(target)) {
    fail(`Missing Rust target ${target}. Run: rustup target add ${target}`);
  }
}

for (const stem of sidecars) {
  const arm64 = path.join(binariesDir, `${stem}-aarch64-apple-darwin`);
  const x64 = path.join(binariesDir, `${stem}-x86_64-apple-darwin`);
  const universal = path.join(binariesDir, `${stem}-universal-apple-darwin`);

  assertExecutableFile(arm64);
  assertExecutableFile(x64);
  assertExecutableFile(universal);
  verifyArch(arm64, "arm64");
  verifyArch(x64, "x86_64");
  verifyArch(universal, "arm64", "x86_64");
  verifySidecarVersion(universal, stem);
}

runNodeScript("scripts/validate-bundled-engines.mjs", "macOS bundled engine validation failed.");

console.log("macOS host validation passed.");

function assertExecutableFile(filePath) {
  const stat = fs.statSync(filePath, { throwIfNoEntry: false });
  if (!stat?.isFile() || stat.size <= 0) {
    fail(`Missing or empty macOS sidecar: ${path.relative(root, filePath)}`);
  }
  if ((stat.mode & 0o111) === 0) {
    fail(`macOS sidecar is not executable: ${path.relative(root, filePath)}`);
  }
}

function verifyArch(filePath, ...architectures) {
  const result = spawnSync("lipo", ["-verify_arch", ...architectures, filePath], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    fail(`Invalid architecture for ${path.relative(root, filePath)}. Expected ${architectures.join(" + ")}.\n${result.stderr || result.stdout}`);
  }
}

function verifySidecarVersion(filePath, stem) {
  const output = commandOutput(filePath, ["-version"], `${stem} universal sidecar failed to start.`);
  if (!output.includes(expectedSidecarVersion)) {
    fail(`${stem} universal sidecar version output does not include ${expectedSidecarVersion}.`);
  }
}

function requireCommand(command, args, message) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    fail(`${message}\n${result.stderr || result.stdout || `${command} failed.`}`);
  }
}

function commandOutput(command, args, message) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    fail(`${message}\n${result.stderr || result.stdout || `${command} failed.`}`);
  }
  return result.stdout;
}

function runNodeScript(scriptPath, message) {
  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: root,
    env: { ...process.env, MULTI_CONVERTER_ENGINE_PLATFORM: "macos-universal" },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    fail(`${message}\n${result.stderr || result.stdout || `${scriptPath} failed.`}`);
  }
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
