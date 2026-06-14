import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { readElfHeader } from "./lib/elf.mjs";
import { readRequiredFfmpegVersion } from "./lib/ffmpeg-version.mjs";

const root = process.cwd();
const args = parseArgs(process.argv.slice(2));
const assetDir = args["asset-dir"] ? path.resolve(args["asset-dir"]) : fail("Missing --asset-dir <dir>.");
const outDir = args["out-dir"] ? path.resolve(args["out-dir"]) : path.join(root, "src-tauri", "binaries");
const expectedVersion = args["expected-version"] ?? readRequiredFfmpegVersion(root);
const skipSmoke = args["skip-smoke"] === "1";
const requiredAssets = [
  "ffmpeg-x86_64-unknown-linux-gnu",
  "ffprobe-x86_64-unknown-linux-gnu",
];

assertDirectory(assetDir, "Linux sidecar asset directory");
assertNoUnexpectedAssets();
fs.mkdirSync(outDir, { recursive: true });

for (const assetName of requiredAssets) {
  const source = path.join(assetDir, assetName);
  const checksum = path.join(assetDir, `${assetName}.sha256`);
  assertFile(source, assetName);
  assertFile(checksum, `${assetName}.sha256`);
  verifySha256(source, checksum);
  assertNotPlaceholder(source, assetName);
  assertElf(source, assetName);

  const target = path.join(outDir, assetName);
  fs.copyFileSync(source, target);
  fs.chmodSync(target, fs.statSync(target).mode | 0o755);

  if (!skipSmoke) {
    smokeSidecar(target, assetName);
  }
}

console.log(`Linux FFmpeg sidecars staged in ${path.relative(root, outDir) || outDir}.`);

function smokeSidecar(filePath, label) {
  if (process.platform !== "linux" || process.arch !== "x64") {
    fail(`Linux sidecar smoke tests must run on Linux x64, current host is ${process.platform}/${process.arch}. Use --skip-smoke only for contract tests.`);
  }

  const result = spawnSync(filePath, ["-version"], {
    cwd: path.dirname(filePath),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 30000,
  });

  if (result.status !== 0) {
    fail(`${label}: -version failed.\n${result.stderr || result.stdout || "No output."}`);
  }

  const text = `${result.stdout || ""}\n${result.stderr || ""}`;
  if (!text.includes(expectedVersion)) {
    const firstLine = text.split(/\r?\n/).find(Boolean) ?? "empty output";
    fail(`${label}: version output does not include ${expectedVersion} (${firstLine}).`);
  }
}

function assertNotPlaceholder(filePath, label) {
  const sample = fs.readFileSync(filePath).subarray(0, 65536).toString("utf8");
  if (/CI placeholder sidecar/i.test(sample) || /placeholder/i.test(sample)) {
    fail(`${label}: placeholder sidecar rejected.`);
  }
}

function assertElf(filePath, label) {
  const header = readElfHeader(filePath);
  if (!header.isElf) {
    fail(`${label}: staged Linux sidecar is not an ELF executable.`);
  }
  if (!header.is64Bit || !header.isLittleEndian || header.machine !== 0x3e) {
    fail(`${label}: staged Linux sidecar is not an x86_64 ELF executable.`);
  }
}

function verifySha256(filePath, checksumPath) {
  const expected = readSha256(checksumPath);
  const actual = sha256File(filePath);
  if (actual !== expected) {
    fail(`${path.basename(filePath)}: SHA-256 mismatch. Expected ${expected}, got ${actual}.`);
  }
}

function readSha256(filePath) {
  const content = fs.readFileSync(filePath, "utf8").trim();
  const match = content.match(/\b([a-f0-9]{64})\b/i);
  if (!match) {
    fail(`${path.basename(filePath)}: checksum file does not contain a SHA-256 hash.`);
  }
  return match[1].toLowerCase();
}

function sha256File(filePath) {
  const hash = createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

function assertDirectory(filePath, label) {
  const stat = fs.statSync(filePath, { throwIfNoEntry: false });
  if (!stat?.isDirectory()) {
    fail(`Missing ${label}: ${filePath}`);
  }
}

function assertFile(filePath, label) {
  const stat = fs.statSync(filePath, { throwIfNoEntry: false });
  if (!stat?.isFile() || stat.size <= 0) {
    fail(`Missing or empty ${label}: ${filePath}`);
  }
}

function assertNoUnexpectedAssets() {
  const expected = new Set(requiredAssets.flatMap((assetName) => [assetName, `${assetName}.sha256`]));
  const unexpected = fs.readdirSync(assetDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && !expected.has(entry.name))
    .map((entry) => entry.name)
    .sort();
  if (unexpected.length > 0) {
    fail(`Unexpected Linux sidecar assets: ${unexpected.join(", ")}.`);
  }
}

function parseArgs(rawArgs) {
  const parsed = {};
  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];
    if (!arg.startsWith("--")) fail(`Unexpected argument: ${arg}`);
    const key = arg.slice(2);
    const value = rawArgs[index + 1];
    if (!value || value.startsWith("--")) fail(`Missing value for ${arg}.`);
    parsed[key] = value;
    index += 1;
  }
  return parsed;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
