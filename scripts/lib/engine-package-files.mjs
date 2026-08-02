import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

export async function copyTreeSafe(sourceDir, targetDir, sourceRoot = sourceDir) {
  const resolvedSourceRoot = path.resolve(sourceRoot);
  for (const entry of await fs.readdir(sourceDir, { withFileTypes: true })) {
    const relative = entry.name;
    normalizeZipPath(relative);
    const source = path.join(sourceDir, relative);
    const target = path.join(targetDir, relative);
    if (entry.isSymbolicLink()) {
      const isFrameworkLink = isInsideFramework(source);
      const isAppLink = Boolean(ancestorPathEnding(source, ".app"));
      const linkTarget = await fs.readlink(source);
      const safeLinkTarget = normalizeSafeSymlinkTarget(source, linkTarget);
      if (!safeLinkTarget) {
        throw new Error(`Lien symbolique non relatif refuse: ${source}`);
      }
      const resolvedLinkTarget = path.resolve(path.dirname(source), safeLinkTarget);
      if (resolvedLinkTarget !== resolvedSourceRoot && !resolvedLinkTarget.startsWith(`${resolvedSourceRoot}${path.sep}`)) {
        throw new Error(`Lien symbolique hors source refuse: ${source}`);
      }
      const linkStat = await fs.lstat(resolvedLinkTarget).catch(() => null);
      if (!linkStat) {
        if (shouldSkipBrokenFrameworkHeaderSymlink(source)) {
          console.warn(`Lien symbolique d'en-tete de framework ignore: ${source}`);
          continue;
        }
        if (!isFrameworkLink) {
          throw new Error(`Lien symbolique casse refuse: ${source}`);
        }
      }
      if (!isFrameworkLink && !isAppLink && linkStat?.isFile() && shouldMaterializeRuntimeSymlink(source, resolvedLinkTarget)) {
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.copyFile(resolvedLinkTarget, target);
        const targetStat = await fs.stat(resolvedLinkTarget);
        await fs.chmod(target, targetStat.mode);
        continue;
      }
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.symlink(safeLinkTarget, target);
    } else if (entry.isDirectory()) {
      await fs.mkdir(target, { recursive: true });
      await copyTreeSafe(source, target, resolvedSourceRoot);
    } else if (entry.isFile()) {
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.copyFile(source, target);
      const stat = await fs.stat(source);
      await fs.chmod(target, stat.mode);
    }
  }
}

function normalizeSafeSymlinkTarget(source, linkTarget) {
  if (!linkTarget || linkTarget.includes("\0")) return null;
  if (!path.isAbsolute(linkTarget)) return linkTarget;

  const normalizedAbsoluteTarget = linkTarget.replaceAll("\\", "/");
  const frameworkRoot = ancestorPathEnding(source, ".framework");
  if (frameworkRoot) {
    const frameworkName = path.basename(frameworkRoot);
    const frameworkMarker = `/${frameworkName}/`;
    const frameworkIndex = normalizedAbsoluteTarget.indexOf(frameworkMarker);
    if (frameworkIndex >= 0) {
      const target = path.join(frameworkRoot, normalizedAbsoluteTarget.slice(frameworkIndex + frameworkMarker.length));
      return relativeSymlinkTarget(path.dirname(source), target);
    }
    const target = path.join(frameworkRoot, normalizedAbsoluteTarget.replace(/^\/+/, ""));
    return relativeSymlinkTarget(path.dirname(source), target);
  }

  const appRoot = ancestorPathEnding(source, ".app");
  if (appRoot) {
    const appName = path.basename(appRoot);
    const appMarker = `/${appName}/`;
    const appIndex = normalizedAbsoluteTarget.indexOf(appMarker);
    if (appIndex >= 0) {
      const target = path.join(appRoot, normalizedAbsoluteTarget.slice(appIndex + appMarker.length));
      return relativeSymlinkTarget(path.dirname(source), target);
    }
    if (normalizedAbsoluteTarget.startsWith("/Contents/")) {
      const target = path.join(appRoot, normalizedAbsoluteTarget.slice(1));
      return relativeSymlinkTarget(path.dirname(source), target);
    }
  }

  const sameDirectoryTarget = path.basename(normalizedAbsoluteTarget);
  const sourceName = path.basename(source);
  if (sameDirectoryTarget && (sourceName.endsWith(".dylib") || sameDirectoryTarget.endsWith(".dylib"))) {
    return sameDirectoryTarget;
  }
  return null;
}

function shouldSkipBrokenFrameworkHeaderSymlink(source) {
  const name = path.basename(source);
  return (name === "Headers" || name === "PrivateHeaders")
    && isInsideFramework(source);
}

function shouldMaterializeRuntimeSymlink(source, target) {
  const sourceName = path.basename(source).toLowerCase();
  const targetName = path.basename(target).toLowerCase();
  return sourceName.endsWith(".dylib") || targetName.endsWith(".dylib");
}

function isInsideFramework(source) {
  return Boolean(ancestorPathEnding(source, ".framework"));
}

function ancestorPathEnding(source, suffix) {
  let current = path.dirname(source);
  while (current && current !== path.dirname(current)) {
    if (path.basename(current).endsWith(suffix)) return current;
    current = path.dirname(current);
  }
  return null;
}

function relativeSymlinkTarget(fromDir, target) {
  const relative = path.relative(fromDir, target).replaceAll("\\", "/");
  return relative || ".";
}

export function isExecutableRequired(config, engine, relative) {
  const platform = engine.platform ?? config.platform;
  return platform !== "windows-x64" && engine.binaryPaths.includes(relative);
}

export function canCheckExecutableBits() {
  return process.platform !== "win32";
}

export async function createZip(sourceDir, archivePath, options = {}) {
  const deterministicTimestamp = options.deterministicTimestamp ?? null;
  if (process.platform !== "win32") {
    if (deterministicTimestamp) {
      const timestamp = new Date(deterministicTimestamp);
      if (Number.isNaN(timestamp.valueOf()) || timestamp.getUTCFullYear() < 1980) {
        throw new Error("Deterministic ZIP timestamps must be valid and no older than 1980.");
      }
      const files = await collectRegularFiles(sourceDir);
      for (const relative of files) await fs.utimes(resolveInside(sourceDir, relative, "ZIP input"), timestamp, timestamp);
      await fs.rm(archivePath, { force: true });
      const result = spawnSync("zip", ["-9qX", archivePath, "-@"], {
        cwd: sourceDir,
        input: `${files.join("\n")}\n`,
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
      });
      if (result.status !== 0) throw new Error(`Creation ZIP impossible: ${result.stderr || result.stdout}`);
      return;
    }
    await fs.rm(archivePath, { force: true });
    const result = spawnSync("zip", ["-qry", archivePath, "."], {
      cwd: sourceDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    if (result.status !== 0) {
      throw new Error(`Creation ZIP impossible: ${result.stderr || result.stdout}`);
    }
    return;
  }

  const script = deterministicTimestamp ? [
    "Add-Type -AssemblyName System.IO.Compression",
    "Add-Type -AssemblyName System.IO.Compression.FileSystem",
    `$source = ${psQuote(sourceDir)}`,
    `$dest = ${psQuote(archivePath)}`,
    `$timestamp = [DateTimeOffset]::Parse(${psQuote(deterministicTimestamp)}).ToUniversalTime()`,
    "if ($timestamp.Year -lt 1980) { throw 'ZIP timestamps must be 1980 or newer' }",
    "if (Test-Path -LiteralPath $dest) { Remove-Item -LiteralPath $dest -Force }",
    "$stream = [System.IO.File]::Open($dest, [System.IO.FileMode]::CreateNew)",
    "$zip = [System.IO.Compression.ZipArchive]::new($stream, [System.IO.Compression.ZipArchiveMode]::Create, $false)",
    "try {",
    "  $prefix = $source.TrimEnd([char[]]'\\/') + [System.IO.Path]::DirectorySeparatorChar",
    "  $files = Get-ChildItem -LiteralPath $source -Recurse -File | Sort-Object -Property FullName",
    "  foreach ($file in $files) {",
    "    if (($file.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) { throw ('Reparse point refused: ' + $file.FullName) }",
    "    $relative = $file.FullName.Substring($prefix.Length).Replace('\\', '/')",
    "    $entry = $zip.CreateEntry($relative, [System.IO.Compression.CompressionLevel]::Optimal)",
    "    $entry.LastWriteTime = $timestamp",
    "    $input = [System.IO.File]::OpenRead($file.FullName)",
    "    $output = $entry.Open()",
    "    try { $input.CopyTo($output) } finally { $output.Dispose(); $input.Dispose() }",
    "  }",
    "} finally { $zip.Dispose(); $stream.Dispose() }",
  ] : [
    "Add-Type -AssemblyName System.IO.Compression.FileSystem",
    `$source = ${psQuote(sourceDir)}`,
    `$dest = ${psQuote(archivePath)}`,
    "if (Test-Path -LiteralPath $dest) { Remove-Item -LiteralPath $dest -Force }",
    "[System.IO.Compression.ZipFile]::CreateFromDirectory($source, $dest, [System.IO.Compression.CompressionLevel]::Optimal, $false)"
  ];
  const scriptText = script.join(deterministicTimestamp ? "\n" : "; ");
  runPowerShell(scriptText, "Creation ZIP impossible");
}

async function collectRegularFiles(directory, relative = "") {
  const entries = await fs.readdir(path.join(directory, relative), { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name, "en"))) {
    const child = path.join(relative, entry.name);
    if (entry.isDirectory()) files.push(...await collectRegularFiles(directory, child));
    else if (entry.isFile()) files.push(normalizeZipPath(child));
    else throw new Error(`ZIP input must contain regular files only: ${child}`);
  }
  return files;
}

export async function extractZip(archivePath, destinationDir) {
  await fs.rm(destinationDir, { recursive: true, force: true });
  await fs.mkdir(destinationDir, { recursive: true });
  if (process.platform !== "win32") {
    const result = spawnSync("unzip", ["-q", archivePath, "-d", destinationDir], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    if (result.status !== 0) {
      throw new Error(`Extraction ZIP de validation impossible: ${result.stderr || result.stdout}`);
    }
    return;
  }

  const script = [
    "Add-Type -AssemblyName System.IO.Compression.FileSystem",
    `[System.IO.Compression.ZipFile]::ExtractToDirectory(${psQuote(archivePath)}, ${psQuote(destinationDir)})`
  ].join("; ");
  runPowerShell(script, "Extraction ZIP de validation impossible");
}

function runPowerShell(script, errorPrefix) {
  const result = spawnSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
  if (result.status !== 0) {
    throw new Error(`${errorPrefix}: ${result.stderr || result.stdout}`);
  }
}

function psQuote(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

export function resolveInside(root, relative, label) {
  const safeRelative = normalizeZipPath(relative);
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, safeRelative);
  if (resolved !== resolvedRoot && !resolved.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error(`Chemin hors racine refuse pour ${label}: ${relative}`);
  }
  return resolved;
}

export function normalizeZipPath(relative) {
  if (typeof relative !== "string" || !relative.trim()) throw new Error("Chemin vide refuse");
  const normalized = relative.replaceAll("\\", "/");
  if (path.isAbsolute(normalized) || normalized.startsWith("/") || normalized.includes("//")) {
    throw new Error(`Chemin ZIP invalide: ${relative}`);
  }
  const parts = normalized.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) {
    throw new Error(`Chemin ZIP ambigu refuse: ${relative}`);
  }
  return normalized;
}

export async function directorySize(dir) {
  let total = 0;
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const item = path.join(dir, entry.name);
    if (entry.isDirectory()) total += await directorySize(item);
    else if (entry.isFile()) total += (await fs.stat(item)).size;
  }
  return total;
}

export async function sha256File(filePath) {
  const hash = createHash("sha256");
  await new Promise((resolve, reject) => {
    createReadStream(filePath)
      .on("data", (chunk) => hash.update(chunk))
      .on("error", reject)
      .on("end", resolve);
  });
  return hash.digest("hex");
}

export async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

export async function assertFile(filePath, message) {
  const stat = await fs.stat(filePath).catch(() => null);
  if (!stat?.isFile()) throw new Error(message);
}

export async function expectFailure(action, message) {
  try {
    await action();
  } catch {
    return;
  }
  throw new Error(message);
}

export function ensureTrailingSlash(url) {
  return url.endsWith("/") ? url : `${url}/`;
}
