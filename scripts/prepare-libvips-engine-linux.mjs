import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import process from "node:process";
import { download, publicSourceLabel } from "./lib/download-integrity.mjs";

const root = process.cwd();
const sourceDir = path.join(root, "engine-sources", "linux-x64", "libvips");
const workDir = path.join(root, "engine-sources", ".extracts", "libvips-linux-smoke");
const runtimeLibraries = new Map();
const dependencyQueue = [];
const copiedPackageNames = new Set();
const moduleRuntimeDirs = new Set();
const librarySearchDirs = [
  "/lib/x86_64-linux-gnu",
  "/usr/lib/x86_64-linux-gnu",
  "/usr/local/lib",
  "/lib64",
  "/lib",
  "/usr/lib",
];
const coreSystemLibraryPattern = /\/(?:ld-linux|libc\.so|libpthread\.so|libdl\.so|libm\.so|librt\.so|libresolv\.so|libanl\.so)/;

if (process.platform !== "linux" || process.arch !== "x64") {
  throw new Error(`Linux libvips engine preparation must run on Linux x64, current host is ${process.platform}/${process.arch}.`);
}

requireCommand("ldd", ["--version"]);
requireCommand("file", ["--version"]);
requireCommand("dpkg-query", ["--version"]);

if (process.env.LIBVIPS_LINUX_APT_INSTALL === "1") {
  run("sudo", ["apt-get", "update"]);
  run("sudo", ["apt-get", "install", "-y", "libvips-tools"]);
}

const sourceVips = runText("sh", ["-lc", "command -v vips"]).trim();
if (!sourceVips) {
  throw new Error("vips executable is missing. Install libvips-tools or set LIBVIPS_LINUX_APT_INSTALL=1.");
}

await fs.rm(sourceDir, { recursive: true, force: true });
await fs.mkdir(path.join(sourceDir, "bin"), { recursive: true });
await fs.mkdir(path.join(sourceDir, "lib"), { recursive: true });
await fs.mkdir(path.join(sourceDir, "licenses"), { recursive: true });

await copyRuntimeFile(sourceVips, path.join(sourceDir, "bin", "vips"));
await copyLibvipsModules();
for (let index = 0; index < dependencyQueue.length; index += 1) {
  const filePath = dependencyQueue[index];
  for (const dependency of parseLddDependencies(runText("ldd", [filePath]))) {
    if (!shouldBundleDependency(dependency)) continue;
    await copyDependency(dependency);
  }
}

await stageLicenseAndNotices();
await verifyRuntime();
await smokeTest();

console.log(`Linux libvips portable runtime staged from ${sourceVips}.`);

async function copyRuntimeFile(source, target) {
  const realSource = await fs.realpath(source);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.copyFile(realSource, target);
  const stat = await fs.stat(realSource);
  await fs.chmod(target, stat.mode | 0o755);
  if (await isElf(realSource)) dependencyQueue.push(target);
  await recordPackageFor(realSource);
}

async function copyDependency(source) {
  const normalizedSource = path.resolve(source);
  const existing = runtimeLibraries.get(normalizedSource);
  if (existing) return existing;
  const target = path.join(sourceDir, "lib", path.basename(source));
  await copyRuntimeFile(source, target);
  runtimeLibraries.set(normalizedSource, target);
  return target;
}

async function copyLibvipsModules() {
  for (const base of librarySearchDirs) {
    const entries = await fs.readdir(base, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (!entry.isDirectory() || !/^vips-modules-/i.test(entry.name)) continue;
      const source = path.join(base, entry.name);
      const target = path.join(sourceDir, "lib", entry.name);
      await copyTree(source, target);
      moduleRuntimeDirs.add(target);
      for (const moduleFile of await collectFiles(target, /\.(?:so|\d)$/i)) {
        if (await isElf(moduleFile)) dependencyQueue.push(moduleFile);
      }
      await recordPackageFor(source);
    }
  }
}

async function copyTree(source, target) {
  const stat = await fs.lstat(source);
  if (stat.isSymbolicLink()) {
    const real = await fs.realpath(source);
    const realStat = await fs.stat(real);
    if (realStat.isDirectory()) {
      await copyTree(real, target);
    } else {
      await copyRuntimeFile(real, target);
    }
    return;
  }
  if (stat.isDirectory()) {
    await fs.mkdir(target, { recursive: true });
    for (const entry of await fs.readdir(source)) {
      await copyTree(path.join(source, entry), path.join(target, entry));
    }
    return;
  }
  if (stat.isFile()) {
    await copyRuntimeFile(source, target);
  }
}

function parseLddDependencies(output) {
  const dependencies = [];
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/=>\s+(\/\S+)/) ?? line.match(/^\s*(\/\S+)/);
    if (match) dependencies.push(match[1]);
  }
  return dependencies;
}

function shouldBundleDependency(filePath) {
  if (coreSystemLibraryPattern.test(filePath)) return false;
  if (!path.isAbsolute(filePath)) return false;
  return librarySearchDirs.some((dir) => filePath === dir || filePath.startsWith(`${dir}/`));
}

async function verifyRuntime() {
  const unresolved = [];
  for (const filePath of await collectFiles(sourceDir, /./)) {
    if (!await isElf(filePath)) continue;
    const output = runText("ldd", [filePath], false);
    if (/not found/i.test(output)) unresolved.push(path.relative(sourceDir, filePath));
  }
  if (unresolved.length) {
    throw new Error(`Linux libvips runtime has unresolved dependencies: ${unresolved[0]}`);
  }
}

async function smokeTest() {
  await fs.rm(workDir, { recursive: true, force: true });
  await fs.mkdir(workDir, { recursive: true });
  const input = path.join(workDir, "input.png");
  const output = path.join(workDir, "output.jpg");
  await fs.writeFile(input, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFElEQVR4nGP8z8Dwn4GBgYGJAQoAHxcCAkJ3kKIAAAAASUVORK5CYII=", "base64"));
  const result = spawnSync(path.join(sourceDir, "bin", "vips"), ["copy", input, output], {
    cwd: sourceDir,
    env: libvipsEnvironment(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 30000,
  });
  if (result.status !== 0) {
    throw new Error(`libvips Linux smoke test failed: ${result.stderr || result.stdout}`);
  }
  const stat = await fs.stat(output).catch(() => null);
  if (!stat?.isFile() || stat.size === 0) {
    throw new Error("libvips Linux smoke test did not create output.jpg.");
  }
}

function libvipsEnvironment() {
  return {
    ...process.env,
    LD_LIBRARY_PATH: [path.join(sourceDir, "lib"), process.env.LD_LIBRARY_PATH].filter(Boolean).join(":"),
    VIPS_MODULE_PATH: [...moduleRuntimeDirs].join(":"),
  };
}

async function stageLicenseAndNotices() {
  const license = await findCopyrightFile()
    ?? await downloadLibvipsLicense();
  await fs.copyFile(license, path.join(sourceDir, "licenses", "LICENSE.txt"));
  const packages = [...copiedPackageNames].sort();
  await fs.writeFile(
    path.join(sourceDir, "licenses", "THIRD_PARTY_NOTICES.txt"),
    [
      "libvips Linux x64 portable runtime",
      "Source: Ubuntu 22.04 apt packages installed on the packaging runner",
      "",
      "libvips is distributed under LGPL-2.1-or-later.",
      "The package contains vips, non-core dynamic libraries discovered through ldd, and libvips modules needed for image conversion.",
      "",
      "Debian/Ubuntu packages represented in the runtime:",
      ...packages.map((item) => `- ${item}`),
      "",
    ].join("\n"),
    "utf8",
  );
}

async function findCopyrightFile() {
  for (const candidate of [
    "/usr/share/doc/libvips42/copyright",
    "/usr/share/doc/libvips-tools/copyright",
    "/usr/share/doc/libvips/copyright",
  ]) {
    const stat = await fs.stat(candidate).catch(() => null);
    if (stat?.isFile()) return candidate;
  }
  return null;
}

async function downloadLibvipsLicense() {
  const target = path.join(sourceDir, "licenses", "libvips-LICENSE.downloaded.txt");
  await download("https://raw.githubusercontent.com/libvips/libvips/master/LICENSE", target, { "User-Agent": "Multi-Converter-Packager" });
  return target;
}

async function recordPackageFor(filePath) {
  const result = spawnSync("dpkg-query", ["-S", filePath], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) return;
  const packageName = result.stdout.split(":")[0]?.trim();
  if (!packageName) return;
  const version = runText("dpkg-query", ["-W", "-f=${Version}", packageName], false).trim();
  copiedPackageNames.add(version ? `${packageName} ${version}` : packageName);
}

async function collectFiles(dir, pattern) {
  const results = [];
  async function walk(current) {
    for (const entry of await fs.readdir(current, { withFileTypes: true }).catch(() => [])) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile() && pattern.test(entry.name)) {
        results.push(fullPath);
      }
    }
  }
  await walk(dir);
  return results.sort();
}

async function isElf(filePath) {
  const result = spawnSync("file", ["-b", filePath], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return result.status === 0 && /\bELF\b/.test(result.stdout);
}

function requireCommand(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(`${command} is required: ${result.stderr || result.stdout}`);
  }
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function runText(command, args, failOnError = true) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0 && failOnError) {
    throw new Error(`${command} ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
  }
  return result.stdout;
}
