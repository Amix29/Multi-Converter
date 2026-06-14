import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { readElfHeader } from "./lib/elf.mjs";
import { readRequiredFfmpegVersion } from "./lib/ffmpeg-version.mjs";

const root = process.cwd();
const binariesDir = path.join(root, "src-tauri", "binaries");
const expectedSidecarVersion = readRequiredFfmpegVersion(root);
const marker = "Multi-Converter CI placeholder sidecar for Tauri compile checks only.";
const requiredSidecars = [
  ["ffmpeg", "ffmpeg-x86_64-unknown-linux-gnu"],
  ["ffprobe", "ffprobe-x86_64-unknown-linux-gnu"],
];

if (process.platform !== "linux" || process.arch !== "x64") {
  console.error(`Linux host validation must run on Linux x64, current host is ${process.platform}/${process.arch}.`);
  process.exit(1);
}

for (const [id, fileName] of requiredSidecars) {
  const filePath = path.join(binariesDir, fileName);
  assertRealExecutable(id, filePath);
  runVersionSmoke(id, filePath);
}

runStep("Validating Linux bundled engines", "npm", ["run", "validate:bundled-engines"], {
  MULTI_CONVERTER_ENGINE_PLATFORM: "linux-x64",
  MULTI_CONVERTER_REQUIRE_ADVANCED_ENGINES: "1",
});

console.log("Linux host validation passed.");

function assertRealExecutable(id, filePath) {
  if (!fs.existsSync(filePath)) fail(`${id}: missing Linux sidecar ${path.relative(root, filePath)}.`);
  const stat = fs.statSync(filePath);
  if (!stat.isFile() || stat.size <= 0) fail(`${id}: sidecar is empty or invalid.`);
  if ((stat.mode & 0o111) === 0) fail(`${id}: sidecar is not executable.`);
  const head = fs.readFileSync(filePath, "utf8").slice(0, 256);
  if (head.includes(marker)) fail(`${id}: sidecar is a CI placeholder, not a real conversion sidecar.`);
  const header = readElfHeader(filePath);
  if (!header.isElf) fail(`${id}: sidecar is not an ELF executable.`);
  if (!header.is64Bit || !header.isLittleEndian || header.machine !== 0x3e) {
    fail(`${id}: sidecar is not an x86_64 ELF executable.`);
  }
}

function runVersionSmoke(id, filePath) {
  const result = spawnSync(filePath, ["-version"], {
    cwd: path.dirname(filePath),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 30000,
  });
  if (result.status !== 0) fail(`${id}: -version failed (${result.stderr || result.stdout || "no output"}).`);
  const text = `${result.stdout || result.stderr}`;
  if (!text.includes(expectedSidecarVersion)) {
    fail(`${id}: expected FFmpeg ${expectedSidecarVersion} sidecar, got ${text.split(/\r?\n/)[0] ?? "empty output"}.`);
  }
}

function runStep(label, command, args, env = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    env: { ...process.env, ...env },
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) fail(`${label} failed.`);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
