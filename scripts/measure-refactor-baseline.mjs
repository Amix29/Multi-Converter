#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

import {
  SOURCE_SELECTION,
  classifySourcePath,
  countTextLines,
  normalizeRepositoryPath,
  summarizeDistEntries,
  summarizeGateStatus,
  summarizeSizedFiles,
  summarizeSourceEntries,
} from "./lib/refactor-baseline.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const outputPath = resolveLocalPath(options.output ?? "test-results/phase-1-baseline/refactor-baseline.json");
  assertJsonOutputIsSafe(outputPath);

  const packageJson = readJson(path.join(root, "package.json"), "package.json");
  const sourceEntries = collectSourceEntries();
  const dist = collectDistMetrics();
  const bundledEngines = collectDirectoryMetrics("src-tauri/bundled-engines");
  const binaries = collectDirectoryMetrics("src-tauri/binaries");
  const gate = options.gateStatus ? collectGateStatus(options.gateStatus) : null;

  const report = {
    schemaVersion: 1,
    kind: "refactor-baseline",
    generatedAt: new Date().toISOString(),
    measurementPolicy: {
      localOnly: true,
      telemetry: false,
      userContentRead: false,
      symlinksFollowed: false,
      sourceSelection: SOURCE_SELECTION,
      distCompression: "gzip level 9, each file measured independently",
    },
    project: { name: packageJson.name ?? null, version: packageJson.version ?? null },
    environment: { platform: process.platform, architecture: process.arch },
    git: collectGitMetadata(),
    tools: collectToolVersions(packageJson),
    source: summarizeSourceEntries(sourceEntries),
    frontendDist: dist,
    engines: {
      bundledEngines,
      binaries,
      combined: {
        fileCount: bundledEngines.fileCount + binaries.fileCount,
        bytes: bundledEngines.bytes + binaries.bytes,
      },
    },
    artifacts: collectArtifacts(options.artifacts),
    gate,
  };

  writeJsonReport(outputPath, report);
  console.log(`Refactor baseline written to ${displayLocation(outputPath).path}`);
}

function collectSourceEntries() {
  const candidates = new Map();
  for (const relativeRoot of SOURCE_SELECTION.includedRoots) {
    const fullRoot = path.join(root, relativeRoot);
    for (const file of walkRegularFiles(fullRoot)) candidates.set(file.fullPath, file);
  }
  for (const relativePath of SOURCE_SELECTION.includedConfigFiles) {
    const fullPath = path.join(root, relativePath);
    if (isRegularFile(fullPath)) candidates.set(fullPath, fileEntry(fullPath));
  }

  return [...candidates.values()]
    .map((file) => {
      const relativePath = normalizeRepositoryPath(path.relative(root, file.fullPath));
      const group = classifySourcePath(relativePath);
      if (!group) return null;
      const text = fs.readFileSync(file.fullPath, "utf8");
      return { group, bytes: file.bytes, ...countTextLines(text) };
    })
    .filter(Boolean);
}

function collectDistMetrics() {
  const distPath = path.join(root, "dist");
  if (!isDirectory(distPath)) return summarizeDistEntries([], false);
  const entries = walkRegularFiles(distPath).map((file) => {
    const content = fs.readFileSync(file.fullPath);
    return { path: normalizeRepositoryPath(path.relative(distPath, file.fullPath)), rawBytes: file.bytes, gzipBytes: gzipSync(content, { level: 9 }).byteLength };
  });
  return summarizeDistEntries(entries);
}

function collectDirectoryMetrics(relativePath) {
  const directory = path.join(root, relativePath);
  return summarizeSizedFiles(isDirectory(directory) ? walkRegularFiles(directory) : [], isDirectory(directory));
}

function collectArtifacts(explicitValues) {
  const candidates = new Map();
  for (const value of explicitValues) {
    const fullPath = resolveLocalPath(value);
    if (!isRegularFile(fullPath)) throw new Error(`--artifact must reference a regular file: ${value}`);
    candidates.set(pathKey(fullPath), { fullPath, origin: "explicit" });
  }

  for (const fullPath of detectedArtifactPaths()) {
    const key = pathKey(fullPath);
    if (!candidates.has(key)) candidates.set(key, { fullPath, origin: "detected" });
  }

  return [...candidates.values()]
    .map(({ fullPath, origin }) => ({
      name: path.basename(fullPath),
      type: artifactType(fullPath),
      origin,
      location: displayLocation(fullPath),
      bytes: fs.statSync(fullPath).size,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function detectedArtifactPaths() {
  const tempTarget = path.join(os.tmpdir(), "mc-cargo-target-tauri-dev", "release");
  const exactCandidates = [
    path.join(root, "src-tauri", "target", "release", executableName()),
    path.join(root, "target", "release", executableName()),
    path.join(tempTarget, executableName()),
  ];
  const directories = [
    path.join(root, "src-tauri", "target", "release", "bundle"),
    path.join(root, "target", "release", "bundle"),
    path.join(tempTarget, "bundle"),
    path.join(root, "release"),
    path.join(root, "release-artifacts"),
    path.join(root, "release-direct"),
  ];

  const detected = exactCandidates.filter(isRegularFile);
  for (const directory of directories) {
    if (!isDirectory(directory)) continue;
    detected.push(...walkRegularFiles(directory).filter((file) => isPackagedArtifact(file.fullPath)).map((file) => file.fullPath));
  }
  return detected;
}

function collectGateStatus(value) {
  const fullPath = resolveLocalPath(value);
  if (!isRegularFile(fullPath)) throw new Error(`--gate-status must reference a JSON file: ${value}`);
  return {
    location: displayLocation(fullPath),
    ...summarizeGateStatus(readJson(fullPath, "gate status")),
  };
}

function collectGitMetadata() {
  const commit = commandOutput("git", ["rev-parse", "HEAD"]);
  const branch = commandOutput("git", ["branch", "--show-current"]);
  const status = commandOutput("git", ["status", "--porcelain=v1", "--untracked-files=normal"]);
  return {
    commit,
    branch: branch || null,
    dirty: status === null ? null : status.length > 0,
    changedPathCount: status === null || status.length === 0 ? 0 : status.split(/\r?\n/).length,
  };
}

function collectToolVersions(packageJson) {
  return {
    node: process.version,
    npm:
      process.platform === "win32"
        ? commandOutput("cmd.exe", ["/d", "/s", "/c", "npm", "--version"])
        : commandOutput("npm", ["--version"]),
    git: commandOutput("git", ["--version"]),
    rustc: commandOutput("rustc", ["--version"]),
    cargo: commandOutput("cargo", ["--version"]),
    declared: {
      packageManager: packageJson.packageManager ?? null,
      typescript: packageJson.devDependencies?.typescript ?? null,
      vite: packageJson.devDependencies?.vite ?? null,
      vitest: packageJson.devDependencies?.vitest ?? null,
      playwright: packageJson.devDependencies?.["@playwright/test"] ?? null,
      tauriCli: packageJson.devDependencies?.["@tauri-apps/cli"] ?? null,
    },
  };
}

function walkRegularFiles(directory) {
  if (!isDirectory(directory)) return [];
  const files = [];
  const pending = [directory];
  while (pending.length > 0) {
    const current = pending.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue;
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) pending.push(fullPath);
      else if (entry.isFile()) files.push(fileEntry(fullPath));
    }
  }
  return files.sort((left, right) => left.fullPath.localeCompare(right.fullPath));
}

function fileEntry(fullPath) {
  return { fullPath, bytes: fs.statSync(fullPath).size };
}

function isRegularFile(fullPath) {
  try {
    return fs.lstatSync(fullPath).isFile();
  } catch {
    return false;
  }
}

function isDirectory(fullPath) {
  try {
    const stat = fs.lstatSync(fullPath);
    return stat.isDirectory() && !stat.isSymbolicLink();
  } catch {
    return false;
  }
}

function parseArguments(args) {
  const options = { artifacts: [], gateStatus: null, help: false, output: null };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--help" || argument === "-h") options.help = true;
    else if (argument === "--artifact" || argument.startsWith("--artifact=")) {
      const [value, nextIndex] = argumentValue(args, index, "--artifact");
      options.artifacts.push(value);
      index = nextIndex;
    } else if (argument === "--gate-status" || argument.startsWith("--gate-status=")) {
      [options.gateStatus, index] = argumentValue(args, index, "--gate-status");
    } else if (argument === "--output" || argument.startsWith("--output=")) {
      [options.output, index] = argumentValue(args, index, "--output");
    } else throw new Error(`Unknown option: ${argument}`);
  }
  return options;
}

function argumentValue(args, index, name) {
  const argument = args[index];
  const inlineValue = argument.startsWith(`${name}=`) ? argument.slice(name.length + 1) : null;
  const value = inlineValue ?? args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires a value.`);
  return [value, inlineValue === null ? index + 1 : index];
}

function resolveLocalPath(value) {
  return path.resolve(root, value);
}

function assertJsonOutputIsSafe(outputPath) {
  if (path.extname(outputPath).toLowerCase() !== ".json") throw new Error("--output must use a .json file.");
  if (!fs.existsSync(outputPath)) return;
  if (!isRegularFile(outputPath)) throw new Error("--output must reference a file path, not a directory.");
  const current = readJson(outputPath, "existing output");
  if (current?.kind !== "refactor-baseline" || current?.schemaVersion !== 1) {
    throw new Error("Refusing to overwrite a JSON file that is not a refactor baseline report.");
  }
}

function writeJsonReport(outputPath, report) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

function readJson(fullPath, label) {
  try {
    return JSON.parse(fs.readFileSync(fullPath, "utf8"));
  } catch (error) {
    throw new Error(`Unable to read ${label} JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function commandOutput(command, args) {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8", timeout: 10_000, windowsHide: true });
  return result.status === 0 ? result.stdout.trim() : null;
}

function displayLocation(fullPath) {
  const relative = path.relative(root, fullPath);
  const inside = relative.length > 0 && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
  return inside
    ? { scope: "repository", path: normalizeRepositoryPath(relative) }
    : { scope: "external", path: path.basename(fullPath) };
}

function isPackagedArtifact(fullPath) {
  return /(?:\.app\.tar\.gz|\.appimage|\.dmg|\.exe|\.msi)$/i.test(fullPath);
}

function artifactType(fullPath) {
  const lower = fullPath.toLowerCase();
  if (lower.endsWith(".app.tar.gz")) return "macos-updater";
  if (lower.endsWith(".appimage")) return "linux-appimage";
  if (lower.endsWith(".dmg")) return "macos-dmg";
  if (lower.endsWith(".msi")) return "windows-msi";
  if (lower.endsWith(".exe")) return "windows-executable";
  return "file";
}

function executableName() {
  return process.platform === "win32" ? "multi-converter.exe" : "multi-converter";
}

function pathKey(fullPath) {
  const resolved = path.resolve(fullPath);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function printHelp() {
  console.log(`Usage: node scripts/measure-refactor-baseline.mjs [options]\n\nOptions:\n  --output <file>       JSON output (default: test-results/phase-1-baseline/refactor-baseline.json)\n  --artifact <file>     Include an artifact; repeat for multiple files\n  --gate-status <file>  Include a summarized Windows gate status JSON\n  --help                Show this help`);
}
