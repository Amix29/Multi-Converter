import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import process from "node:process";

const root = process.cwd();
const args = parseArgs(process.argv.slice(2));
const dependencyQueue = [];
const recordsByTarget = new Map();
const targetByRealSource = new Map();
const targetNames = new Map();

if (process.platform !== "darwin") {
  throw new Error("macOS libvips runtime packaging must run on macOS.");
}

const arch = normalizeArch(args.arch ?? hostArch());
const lipoArch = arch === "aarch64" ? "arm64" : "x86_64";
const outputDir = path.resolve(args.outputDir ?? path.join(root, "dist-libvips-macos"));
const runtimeDir = path.resolve(args.runtimeDir ?? path.join(outputDir, `runtime-${arch}`));
const archivePath = path.resolve(args.archive ?? path.join(outputDir, `libvips-macos-${arch}.tar.gz`));
if (hostArch() !== arch) {
  throw new Error(`Host architecture ${hostArch()} cannot package libvips for ${arch}. Use a native macOS runner for each architecture.`);
}

requireCommand("brew", ["--version"]);
requireCommand("xcrun", ["-find", "otool"]);
requireCommand("xcrun", ["-find", "lipo"]);
requireCommand("xcrun", ["-find", "install_name_tool"]);

const brewRoot = await realpathText(runText("brew", ["--prefix"]).trim());
if (args.install || process.env.LIBVIPS_MACOS_HOMEBREW_INSTALL === "1") {
  run("brew", ["install", "vips"]);
}

const vipsPrefix = await realpathText(runText("brew", ["--prefix", "vips"]).trim());
if (!isInside(brewRoot, vipsPrefix)) {
  throw new Error(`Homebrew vips prefix is outside the Homebrew root: ${vipsPrefix}`);
}

const sourceVips = path.join(vipsPrefix, "bin", "vips");
await assertFile(sourceVips, "Homebrew vips executable is missing. Run `brew install vips` first.");

await fs.rm(runtimeDir, { recursive: true, force: true });
await fs.mkdir(path.join(runtimeDir, "bin"), { recursive: true });
await fs.mkdir(path.join(runtimeDir, "lib"), { recursive: true });
await fs.mkdir(path.join(runtimeDir, "licenses"), { recursive: true });

await copyFileRecord(sourceVips, path.join(runtimeDir, "bin", "vips"));
await copyTreeIfExists(path.join(vipsPrefix, "lib"), path.join(runtimeDir, "lib"));
await copyTreeIfExists(path.join(vipsPrefix, "share"), path.join(runtimeDir, "share"));
await copyTreeIfExists(path.join(vipsPrefix, "etc"), path.join(runtimeDir, "etc"));

for (const record of recordsByTarget.values()) {
  if (await isMachO(record.original)) dependencyQueue.push(record);
}

for (let index = 0; index < dependencyQueue.length; index += 1) {
  const record = dependencyQueue[index];
  const dependencies = parseOtoolDependencies(runText("otool", ["-L", record.original]));
  for (const dependency of dependencies) {
    const resolved = await resolveDependency(dependency, record.original);
    if (!resolved) continue;
    const dependencyTarget = await copyDependency(resolved);
    record.dependencies.push({ raw: dependency, target: dependencyTarget });
  }
}

await rewriteMachOLinks();
await verifyRuntime();
await stageLicenseAndNotices();
await smokeTest();
await createArchive();

const sha256 = await sha256File(archivePath);
if (process.env.GITHUB_OUTPUT) {
  await fs.appendFile(process.env.GITHUB_OUTPUT, `archive=${archivePath}\nruntime_dir=${runtimeDir}\nsha256=${sha256}\n`, "utf8");
}

console.log(`libvips macOS ${arch} runtime: ${path.relative(root, archivePath)} ${sha256}`);

function parseArgs(rawArgs) {
  const parsed = {};
  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];
    if (arg === "--arch") parsed.arch = rawArgs[++index];
    else if (arg === "--output-dir") parsed.outputDir = rawArgs[++index];
    else if (arg === "--runtime-dir") parsed.runtimeDir = rawArgs[++index];
    else if (arg === "--archive") parsed.archive = rawArgs[++index];
    else if (arg === "--install") parsed.install = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return parsed;
}

function normalizeArch(value) {
  if (value === "arm64" || value === "aarch64") return "aarch64";
  if (value === "x64" || value === "x86_64") return "x86_64";
  throw new Error(`Unsupported macOS architecture: ${value}`);
}

function hostArch() {
  return normalizeArch(runText("uname", ["-m"]).trim() || os.arch());
}

async function copyTreeIfExists(source, target) {
  const stat = await fs.lstat(source).catch(() => null);
  if (!stat) return;
  await copyTreeDereference(source, target);
}

async function copyTreeDereference(source, target) {
  const stat = await fs.lstat(source);
  if (stat.isSymbolicLink()) {
    const linkValue = await fs.readlink(source);
    const real = await fs.realpath(source);
    if (!path.isAbsolute(linkValue) || isInside(vipsPrefix, real)) {
      const targetLink = path.isAbsolute(linkValue)
        ? path.relative(path.dirname(target), path.join(runtimeDir, path.relative(vipsPrefix, real)))
        : linkValue;
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.symlink(targetLink || path.basename(real), target);
      return;
    }
    const realStat = await fs.stat(real);
    if (realStat.isDirectory()) {
      await copyTreeDereference(real, target);
    } else if (realStat.isFile()) {
      await copyFileRecord(real, target);
    }
    return;
  }
  if (stat.isDirectory()) {
    await fs.mkdir(target, { recursive: true });
    for (const entry of await fs.readdir(source)) {
      await copyTreeDereference(path.join(source, entry), path.join(target, entry));
    }
    return;
  }
  if (stat.isFile()) {
    await copyFileRecord(source, target);
  }
}

async function copyFileRecord(source, target) {
  const realSource = await fs.realpath(source);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.copyFile(realSource, target);
  const stat = await fs.stat(realSource);
  await fs.chmod(target, stat.mode);
  if (isRuntimeCodePath(target)) {
    registerRecord(realSource, target);
  }
}

function registerRecord(original, target) {
  const resolvedTarget = path.resolve(target);
  recordsByTarget.set(resolvedTarget, { original, target: resolvedTarget, dependencies: [] });
  targetByRealSource.set(original, resolvedTarget);
  const previous = targetNames.get(path.basename(resolvedTarget));
  if (previous && previous !== original) {
    throw new Error(`Two different libvips dependencies share the same filename: ${path.basename(resolvedTarget)}`);
  }
  targetNames.set(path.basename(resolvedTarget), original);
}

function isRuntimeCodePath(filePath) {
  const resolved = path.resolve(filePath);
  const binRoot = path.join(runtimeDir, "bin");
  const libRoot = path.join(runtimeDir, "lib");
  return isInside(binRoot, resolved) || isInside(libRoot, resolved);
}

async function copyDependency(source) {
  const realSource = await fs.realpath(source);
  const existing = targetByRealSource.get(realSource);
  if (existing) return existing;
  if (!isInside(brewRoot, realSource)) {
    throw new Error(`Refusing to bundle non-Homebrew dependency: ${realSource}`);
  }
  const target = path.join(runtimeDir, "lib", path.basename(realSource));
  await copyFileRecord(realSource, target);
  const record = recordsByTarget.get(path.resolve(target));
  if (record && await isMachO(realSource)) dependencyQueue.push(record);
  return target;
}

async function resolveDependency(value, loader) {
  if (isAllowedSystemDependency(value)) return null;

  if (path.isAbsolute(value)) {
    return await mustExistRealpath(value, loader);
  }

  if (value.startsWith("@loader_path/")) {
    const candidate = path.resolve(path.dirname(loader), value.slice("@loader_path/".length));
    return await mustExistRealpath(candidate, loader);
  }

  if (value.startsWith("@executable_path/")) {
    const candidate = path.resolve(path.dirname(sourceVips), value.slice("@executable_path/".length));
    return await mustExistRealpath(candidate, loader);
  }

  if (value.startsWith("@rpath/")) {
    const suffix = value.slice("@rpath/".length);
    for (const rpath of parseRpaths(runText("otool", ["-l", loader]))) {
      const candidate = path.resolve(resolveRpath(rpath, loader), suffix);
      const stat = await fs.stat(candidate).catch(() => null);
      if (stat?.isFile()) return await fs.realpath(candidate);
    }
    throw new Error(`Could not resolve ${value} used by ${loader}`);
  }

  throw new Error(`Unsupported non-system dependency ${value} used by ${loader}`);
}

async function mustExistRealpath(candidate, loader) {
  const stat = await fs.stat(candidate).catch(() => null);
  if (!stat?.isFile()) {
    throw new Error(`Dependency ${candidate} used by ${loader} does not exist.`);
  }
  return await fs.realpath(candidate);
}

function resolveRpath(value, loader) {
  if (value.startsWith("@loader_path/")) return path.resolve(path.dirname(loader), value.slice("@loader_path/".length));
  if (value === "@loader_path") return path.dirname(loader);
  if (value.startsWith("@executable_path/")) return path.resolve(path.dirname(sourceVips), value.slice("@executable_path/".length));
  if (value === "@executable_path") return path.dirname(sourceVips);
  return value;
}

async function rewriteMachOLinks() {
  for (const record of recordsByTarget.values()) {
    if (!await isMachO(record.target)) continue;
    run("lipo", [record.target, "-verify_arch", lipoArch]);
    await rewriteInstallId(record.target);
    addRpath(record.target, record.target.includes(`${path.sep}bin${path.sep}`) ? "@executable_path/../lib" : "@loader_path");
    for (const dependency of record.dependencies) {
      run("install_name_tool", ["-change", dependency.raw, `@rpath/${path.basename(dependency.target)}`, record.target]);
    }
  }
}

async function rewriteInstallId(filePath) {
  const output = runText("otool", ["-D", filePath]);
  const id = output.split(/\r?\n/).map((line) => line.trim()).find((line) => line && line !== filePath);
  if (!id) return;
  run("install_name_tool", ["-id", `@rpath/${path.basename(filePath)}`, filePath]);
}

function addRpath(filePath, rpath) {
  const result = spawnSync("install_name_tool", ["-add_rpath", rpath, filePath], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status === 0) return;
  const text = `${result.stdout}\n${result.stderr}`;
  if (text.includes("would duplicate path")) return;
  throw new Error(`install_name_tool -add_rpath failed for ${filePath}: ${result.stderr || result.stdout}`);
}

async function verifyRuntime() {
  for (const record of recordsByTarget.values()) {
    if (!await isMachO(record.target)) continue;
    const dependencies = parseOtoolDependencies(runText("otool", ["-L", record.target]));
    for (const dependency of dependencies) {
      if (isAllowedPackagedDependency(dependency)) continue;
      throw new Error(`Non-portable dependency remains in ${record.target}: ${dependency}`);
    }
  }
}

async function smokeTest() {
  const workDir = path.join(outputDir, `smoke-${arch}`);
  await fs.rm(workDir, { recursive: true, force: true });
  await fs.mkdir(workDir, { recursive: true });
  const input = path.join(workDir, "input.png");
  const output = path.join(workDir, "output.jpg");
  await fs.writeFile(input, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFElEQVR4nGP8z8Dwn4GBgYGJAQoAHxcCAkJ3kKIAAAAASUVORK5CYII=", "base64"));
  const result = spawnSync(path.join(runtimeDir, "bin", "vips"), ["copy", input, output], {
    cwd: runtimeDir,
    env: {
      ...process.env,
      DYLD_LIBRARY_PATH: path.join(runtimeDir, "lib"),
    },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 30000,
  });
  if (result.status !== 0) {
    throw new Error(`libvips smoke test failed: ${result.stderr || result.stdout}`);
  }
  const stat = await fs.stat(output).catch(() => null);
  if (!stat?.isFile() || stat.size === 0) {
    throw new Error("libvips smoke test did not create output.jpg.");
  }
}

async function stageLicenseAndNotices() {
  const license = await findAny(vipsPrefix, ["LICENSE", "LICENSE.txt", "COPYING", "COPYING.LESSER"])
    ?? await downloadLibvipsLicense();
  await fs.copyFile(license, path.join(runtimeDir, "licenses", "LICENSE.txt"));

  const copiedLibraries = [...recordsByTarget.values()]
    .filter((record) => record.target.includes(`${path.sep}lib${path.sep}`))
    .map((record) => `${path.basename(record.target)} <= ${record.original}`)
    .sort();
  const notices = [
    "libvips macOS Homebrew-derived portable runtime",
    `Architecture: ${arch}`,
    `Homebrew root: ${brewRoot}`,
    `vips prefix: ${vipsPrefix}`,
    `vips version: ${runText("brew", ["list", "--versions", "vips"]).trim()}`,
    "",
    "The packaging script rewrites non-system dynamic links to @rpath and rejects remaining absolute Homebrew, MacPorts or Fink links.",
    "Review copied dependency licenses before public release; this private staging asset is meant to prove runtime portability first.",
    "",
    "Copied runtime libraries:",
    ...copiedLibraries,
    "",
  ];
  await fs.writeFile(path.join(runtimeDir, "licenses", "THIRD_PARTY_NOTICES.txt"), notices.join("\n"), "utf8");
}

async function downloadLibvipsLicense() {
  const version = runText("brew", ["list", "--versions", "vips"]).trim().split(/\s+/)[1];
  const target = path.join(outputDir, `libvips-${version || "current"}-LICENSE.txt`);
  const urls = [
    version ? `https://raw.githubusercontent.com/libvips/libvips/v${version}/LICENSE` : null,
    "https://raw.githubusercontent.com/libvips/libvips/master/LICENSE",
  ].filter(Boolean);
  for (const url of urls) {
    const response = await fetch(url, { headers: { "User-Agent": "Multi-Converter-Packager" } });
    if (response.ok) {
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, await response.text(), "utf8");
      return target;
    }
  }
  throw new Error("Could not locate or download the libvips license.");
}

async function createArchive() {
  await fs.mkdir(path.dirname(archivePath), { recursive: true });
  await fs.rm(archivePath, { force: true });
  run("tar", ["-czf", archivePath, "-C", runtimeDir, "."]);
}

function parseOtoolDependencies(output) {
  return output.split(/\r?\n/).slice(1)
    .map((line) => line.trim().match(/^(\S+)/)?.[1])
    .filter(Boolean);
}

function parseRpaths(output) {
  const lines = output.split(/\r?\n/);
  const rpaths = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].trim() === "cmd LC_RPATH") {
      for (let cursor = index + 1; cursor < Math.min(index + 8, lines.length); cursor += 1) {
        const match = lines[cursor].trim().match(/^path\s+(.+?)\s+\(offset\s+\d+\)$/);
        if (match) rpaths.push(match[1]);
      }
    }
  }
  return rpaths;
}

async function findAny(dir, names) {
  const wanted = new Set(names.map((name) => name.toLowerCase()));
  async function walk(current) {
    for (const entry of await fs.readdir(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        const found = await walk(fullPath);
        if (found) return found;
      } else if (entry.isFile() && wanted.has(entry.name.toLowerCase())) {
        return fullPath;
      }
    }
    return null;
  }
  return walk(dir);
}

async function isMachO(filePath) {
  const result = spawnSync("file", ["-b", filePath], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return result.status === 0 && /\bMach-O\b/.test(result.stdout);
}

function isAllowedSystemDependency(value) {
  return value.startsWith("/usr/lib/") || value.startsWith("/System/Library/");
}

function isAllowedPackagedDependency(value) {
  if (value.startsWith("@rpath/") || value.startsWith("@loader_path/") || value.startsWith("@executable_path/")) return true;
  return isAllowedSystemDependency(value);
}

function isInside(parent, child) {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function assertFile(filePath, message) {
  const stat = await fs.stat(filePath).catch(() => null);
  if (!stat?.isFile()) throw new Error(message);
}

async function realpathText(value) {
  return await fs.realpath(value);
}

async function sha256File(filePath) {
  const hash = createHash("sha256");
  await new Promise((resolve, reject) => {
    createReadStream(filePath)
      .on("data", (chunk) => hash.update(chunk))
      .on("error", reject)
      .on("end", resolve);
  });
  return hash.digest("hex");
}

function requireCommand(command, commandArgs) {
  const result = spawnSync(command, commandArgs, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(`${command} is required: ${result.stderr || result.stdout}`);
  }
}

function run(command, commandArgs) {
  const result = spawnSync(command, commandArgs, {
    cwd: root,
    stdio: "inherit",
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function runText(command, commandArgs) {
  const result = spawnSync(command, commandArgs, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${commandArgs.join(" ")} failed: ${result.stderr || result.stdout}`);
  }
  return result.stdout;
}
