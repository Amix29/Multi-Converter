import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pipeline } from "node:stream/promises";
import { spawnSync } from "node:child_process";
import { readElfHeader } from "./lib/elf.mjs";
import { ffmpegVersionFromEnv } from "./lib/ffmpeg-version.mjs";

const root = process.cwd();
const args = parseArgs(process.argv.slice(2));
const outDir = path.resolve(args.outDir ?? process.env.LINUX_SIDECAR_OUT_DIR ?? path.join(root, "dist-linux-sidecars"));
const expectedVersion = args.expectedVersion ?? ffmpegVersionFromEnv("FFMPEG_LINUX_X64_EXPECTED_VERSION", root);
const skipSmoke = args.skipSmoke === "1";
const sidecars = [
  {
    id: "ffmpeg",
    envPrefix: "FFMPEG_LINUX_X64",
    outputName: "ffmpeg-x86_64-unknown-linux-gnu",
    source: args.ffmpeg ?? process.env.FFMPEG_LINUX_X64_BINARY,
    sha256: args.ffmpegSha256 ?? process.env.FFMPEG_LINUX_X64_BINARY_SHA256,
  },
  {
    id: "ffprobe",
    envPrefix: "FFPROBE_LINUX_X64",
    outputName: "ffprobe-x86_64-unknown-linux-gnu",
    source: args.ffprobe ?? process.env.FFPROBE_LINUX_X64_BINARY,
    sha256: args.ffprobeSha256 ?? process.env.FFPROBE_LINUX_X64_BINARY_SHA256,
  },
];

assertSafeGeneratedDir(outDir);
for (const sidecar of sidecars) {
  if (sidecar.source && !/^[a-z]+:\/\//i.test(sidecar.source)) {
    assertSourceOutsideOutputDir(sidecar.source, outDir, sidecar.id);
  }
}
await fs.rm(outDir, { recursive: true, force: true });
await fs.mkdir(outDir, { recursive: true });

for (const sidecar of sidecars) {
  if (!sidecar.source) {
    fail(`${sidecar.envPrefix}_BINARY or --${sidecar.id} is required.`);
  }
  if (!/^[a-f0-9]{64}$/i.test(String(sidecar.sha256 ?? ""))) {
    fail(`${sidecar.envPrefix}_BINARY_SHA256 or --${sidecar.id}-sha256 must be a SHA-256 hash.`);
  }

  const stagedSource = path.join(outDir, `.source-${sidecar.outputName}`);
  await downloadOrCopy(sidecar.source, stagedSource);
  await verifySha256(stagedSource, sidecar.sha256, sidecar.id);
  const executableSource = await materializeExecutable(stagedSource, sidecar.source, sidecar.id, sidecar.outputName);
  await assertRealLinuxSidecar(executableSource, sidecar.id);

  const outputPath = path.join(outDir, sidecar.outputName);
  await fs.copyFile(executableSource, outputPath);
  await fs.chmod(outputPath, 0o755);
  await fs.rm(stagedSource, { force: true });
  await fs.rm(path.join(outDir, `.extract-${sidecar.outputName}`), { recursive: true, force: true });

  if (!skipSmoke) {
    smokeSidecar(outputPath, sidecar.id);
  }

  const hash = await sha256File(outputPath);
  await fs.writeFile(path.join(outDir, `${sidecar.outputName}.sha256`), `${hash}  ${sidecar.outputName}\n`, "ascii");
}

console.log(`Linux sidecar release assets prepared: ${path.relative(root, outDir) || outDir}`);
for (const sidecar of sidecars) {
  console.log(`- ${sidecar.outputName}`);
  console.log(`- ${sidecar.outputName}.sha256`);
}

async function downloadOrCopy(source, target) {
  rejectUnsupportedSource(source);
  if (/^https:\/\//i.test(source)) {
    const response = await fetch(source, { headers: { "User-Agent": "Multi-Converter-Linux-Sidecar-Staging" } });
    if (!response.ok || !response.body) {
      fail(`Unable to download Linux sidecar source (${response.status}): ${source}`);
    }
    await pipeline(response.body, createWriteStream(target));
    return;
  }
  if (/^[a-z]+:\/\//i.test(source)) {
    fail(`Refusing non-HTTPS Linux sidecar source URL: ${source}`);
  }
  const sourcePath = path.resolve(source);
  const stat = await fs.stat(sourcePath).catch(() => null);
  if (!stat?.isFile() || stat.size <= 0) {
    fail(`Missing or empty Linux sidecar source: ${sourcePath}`);
  }
  await fs.copyFile(sourcePath, target);
}

function rejectUnsupportedSource(source) {
  const normalized = String(source).split(/[?#]/, 1)[0].toLowerCase();
  if (/\.appimage$/i.test(normalized)) {
    fail(`Linux sidecar source must be a raw executable or archive containing one executable, not an AppImage: ${source}`);
  }
}

async function materializeExecutable(sourcePath, originalSource, executableName, outputName) {
  if (!isArchiveSource(originalSource)) return sourcePath;

  const extractDir = path.join(outDir, `.extract-${outputName}`);
  await extractArchive(sourcePath, extractDir, originalSource);
  const executable = await findExecutable(extractDir, executableName);
  if (!executable) {
    fail(`${executableName}: Linux sidecar archive does not contain a ${executableName} executable.`);
  }
  return executable;
}

function isArchiveSource(source) {
  const lower = String(source).split(/[?#]/, 1)[0].toLowerCase();
  return lower.endsWith(".zip") || lower.endsWith(".tar.gz") || lower.endsWith(".tgz") || lower.endsWith(".tar.xz");
}

async function extractArchive(archivePath, destination, originalSource) {
  await fs.rm(destination, { recursive: true, force: true });
  await fs.mkdir(destination, { recursive: true });
  const lower = String(originalSource).split(/[?#]/, 1)[0].toLowerCase();
  const command = lower.endsWith(".zip")
    ? extractZipCommand(archivePath, destination)
    : ["tar", ["-xf", archivePath, "-C", destination]];
  const result = spawnSync(command[0], command[1], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    fail(`Linux sidecar archive extraction failed: ${result.stderr || result.stdout || archivePath}`);
  }
}

function extractZipCommand(archivePath, destination) {
  if (process.platform === "win32") {
    return ["powershell", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      `Expand-Archive -LiteralPath ${psQuote(archivePath)} -DestinationPath ${psQuote(destination)} -Force`,
    ]];
  }
  return ["unzip", ["-q", archivePath, "-d", destination]];
}

async function findExecutable(dir, executableName) {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = await findExecutable(fullPath, executableName);
      if (found) return found;
    } else if (entry.isFile() && entry.name === executableName) {
      await fs.chmod(fullPath, 0o755);
      return fullPath;
    }
  }
  return null;
}

function psQuote(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

async function verifySha256(filePath, expected, label) {
  const actual = await sha256File(filePath);
  if (actual !== String(expected).toLowerCase()) {
    fail(`${label}: SHA-256 mismatch. Expected ${expected}, got ${actual}.`);
  }
}

async function assertRealLinuxSidecar(filePath, label) {
  const sample = (await fs.readFile(filePath)).subarray(0, 65536).toString("utf8");
  if (/CI placeholder sidecar/i.test(sample) || /placeholder/i.test(sample)) {
    fail(`${label}: placeholder sidecar rejected.`);
  }
  const header = readElfHeader(filePath);
  if (!header.isElf) {
    fail(`${label}: staged Linux sidecar is not an ELF executable.`);
  }
  if (!header.is64Bit || !header.isLittleEndian || header.machine !== 0x3e) {
    fail(`${label}: staged Linux sidecar is not an x86_64 ELF executable.`);
  }
}

function smokeSidecar(filePath, label) {
  if (process.platform !== "linux" || process.arch !== "x64") {
    fail(`Linux sidecar smoke tests must run on Linux x64, current host is ${process.platform}/${process.arch}. Use --skip-smoke 1 only for contract tests.`);
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

async function sha256File(filePath) {
  const hash = createHash("sha256");
  hash.update(await fs.readFile(filePath));
  return hash.digest("hex");
}

function assertSafeGeneratedDir(dir) {
  const normalized = path.resolve(dir);
  const parsed = path.parse(normalized);
  if (normalized === parsed.root || normalized === root) {
    fail(`Refusing unsafe output directory: ${normalized}`);
  }
}

function assertSourceOutsideOutputDir(source, dir, label) {
  const sourcePath = path.resolve(source);
  const outputPath = path.resolve(dir);
  const relative = path.relative(outputPath, sourcePath);
  if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) {
    fail(`${label}: source must not be inside the output directory because the output directory is cleaned first: ${sourcePath}`);
  }
}

function parseArgs(rawArgs) {
  const parsed = {};
  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];
    const value = rawArgs[index + 1];
    if (arg === "--ffmpeg") parsed.ffmpeg = requireValue(arg, value), index += 1;
    else if (arg === "--ffmpeg-sha256") parsed.ffmpegSha256 = requireValue(arg, value), index += 1;
    else if (arg === "--ffprobe") parsed.ffprobe = requireValue(arg, value), index += 1;
    else if (arg === "--ffprobe-sha256") parsed.ffprobeSha256 = requireValue(arg, value), index += 1;
    else if (arg === "--out-dir") parsed.outDir = requireValue(arg, value), index += 1;
    else if (arg === "--expected-version") parsed.expectedVersion = requireValue(arg, value), index += 1;
    else if (arg === "--skip-smoke") parsed.skipSmoke = requireValue(arg, value), index += 1;
    else fail(`Unknown argument: ${arg}`);
  }
  return parsed;
}

function requireValue(arg, value) {
  if (!value || value.startsWith("--")) fail(`Missing value for ${arg}.`);
  return value;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
