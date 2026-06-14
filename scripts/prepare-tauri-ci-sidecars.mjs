import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const binariesDir = path.join(root, "src-tauri", "binaries");
const bundledEnginesDir = path.join(root, "src-tauri", "bundled-engines");
const marker = "Multi-Converter CI placeholder sidecar for Tauri compile checks only.";
const darwinTargets = new Set(["aarch64-apple-darwin", "x86_64-apple-darwin"]);
const linuxTargets = new Set(["x86_64-unknown-linux-gnu"]);
const supportedTargets = new Set([...darwinTargets, ...linuxTargets]);
const allowed = process.env.CI === "true" || process.env.MULTI_CONVERTER_ALLOW_PLACEHOLDER_SIDECARS === "1";

if (!allowed) {
  console.error("Refusing to create placeholder sidecars outside CI. Set MULTI_CONVERTER_ALLOW_PLACEHOLDER_SIDECARS=1 for local dry-runs.");
  process.exit(1);
}

const targets = parseTargets(process.argv.slice(2));
fs.mkdirSync(binariesDir, { recursive: true });
fs.mkdirSync(bundledEnginesDir, { recursive: true });

for (const target of targets) {
  for (const stem of ["ffmpeg", "ffprobe"]) {
    writePlaceholder(`${stem}-${target}`);
  }
}

console.log(`Prepared Tauri CI sidecar placeholders for ${[...targets].join(", ")}.`);

function parseTargets(args) {
  const result = new Set();
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--target") {
      const value = args[index + 1];
      if (!value) fail("--target requires a value");
      addTargetValues(result, value);
      index += 1;
      continue;
    }
    if (arg.startsWith("--target=")) {
      addTargetValues(result, arg.slice("--target=".length));
      continue;
    }
    fail(`Unknown argument: ${arg}`);
  }
  if (result.size === 0) result.add(hostDarwinTarget());
  return result;
}

function addTargetValues(result, value) {
  for (const part of value.split(",")) {
    const target = part.trim();
    if (!target) continue;
    if (target === "host") {
      result.add(hostDarwinTarget());
      continue;
    }
    if (!supportedTargets.has(target)) fail(`Unsupported CI sidecar target: ${target}`);
    result.add(target);
  }
}

function hostDarwinTarget() {
  if (process.platform === "darwin") {
    return process.arch === "arm64" ? "aarch64-apple-darwin" : "x86_64-apple-darwin";
  }
  if (process.platform === "linux" && process.arch === "x64") {
    return "x86_64-unknown-linux-gnu";
  }
  fail(`Host placeholder target is only defined on macOS or Linux x64, current host is ${process.platform}/${process.arch}`);
}

function writePlaceholder(fileName) {
  const filePath = path.join(binariesDir, fileName);
  if (fs.existsSync(filePath)) {
    if (fileStartsWithMarker(filePath)) {
      fs.chmodSync(filePath, 0o755);
      return;
    }
    console.log(`Keeping existing sidecar ${path.relative(root, filePath)}.`);
    return;
  }
  fs.writeFileSync(filePath, `#!/bin/sh\nprintf '%s\\n' '${marker}' >&2\nexit 127\n`);
  fs.chmodSync(filePath, 0o755);
}

function fileStartsWithMarker(filePath) {
  const fd = fs.openSync(filePath, "r");
  try {
    const buffer = Buffer.alloc(marker.length + 64);
    const bytesRead = fs.readSync(fd, buffer, 0, buffer.length, 0);
    return buffer.subarray(0, bytesRead).toString("utf8").includes(marker);
  } finally {
    fs.closeSync(fd);
  }
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
