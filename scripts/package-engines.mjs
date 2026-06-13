import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import { createReadStream, existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const defaultConfigPath = path.join(repoRoot, "tools", "engine-packages.config.json");
const defaultOutputDir = path.join(repoRoot, "dist-engines");
const placeholderBaseUrl = "REPLACE_WITH_RELEASE_BASE_URL";

const args = parseArgs(process.argv.slice(2));

if (args.validate) {
  await runValidation();
} else {
  const configPath = path.resolve(repoRoot, args.config ?? defaultConfigPath);
  const outputDir = path.resolve(repoRoot, args.output ?? defaultOutputDir);
  const config = await readJson(configPath);
  const baseUrl = args.releaseBaseUrl ?? process.env.ENGINE_RELEASE_BASE_URL ?? config.downloadBaseUrl ?? placeholderBaseUrl;
  await packageFromConfig(config, {
    configPath,
    outputDir,
    releaseBaseUrl: ensureTrailingSlash(baseUrl),
    clean: args.clean !== false
  });
}

function parseArgs(items) {
  const parsed = {};
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (item === "--validate") parsed.validate = true;
    else if (item === "--no-clean") parsed.clean = false;
    else if (item === "--config") parsed.config = items[++index];
    else if (item === "--output") parsed.output = items[++index];
    else if (item === "--release-base-url") parsed.releaseBaseUrl = items[++index];
    else throw new Error(`Argument inconnu: ${item}`);
  }
  return parsed;
}

async function packageFromConfig(config, options) {
  validateConfig(config);
  if (options.clean) {
    await fs.rm(options.outputDir, { recursive: true, force: true });
  }
  await fs.mkdir(options.outputDir, { recursive: true });
  const workDir = path.join(options.outputDir, ".work");
  await fs.rm(workDir, { recursive: true, force: true });
  await fs.mkdir(workDir, { recursive: true });

  const engines = [];
  try {
    for (const engine of config.engines) {
      engines.push(await packageEngine(config, engine, options, workDir));
    }
  } finally {
    await fs.rm(workDir, { recursive: true, force: true });
  }

  const manifest = {
    manifestVersion: config.manifestVersion,
    generatedAt: new Date().toISOString(),
    engines
  };
  const manifestPath = path.join(options.outputDir, "engines-manifest.json");
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(`Manifest generated: ${path.relative(repoRoot, manifestPath)}`);
}

async function packageEngine(config, engine, options, workDir) {
  validateEngineConfig(engine);
  const sourceDir = resolveInside(repoRoot, engine.sourceDir, "sourceDir");
  const sourceStat = await fs.lstat(sourceDir).catch(() => null);
  if (!sourceStat) {
    throw new Error(`${engine.engineId}: sourceDir introuvable: ${engine.sourceDir}`);
  }
  if (!sourceStat.isDirectory() || sourceStat.isSymbolicLink()) {
    throw new Error(`${engine.engineId}: sourceDir doit etre un dossier local non symbolique: ${engine.sourceDir}`);
  }

  const requiredFiles = [...engine.binaryPaths, ...engine.licenseFiles, ...(engine.noticeFiles ?? [])];
  for (const relative of requiredFiles) {
    const sourceFile = resolveInside(sourceDir, relative, `${engine.engineId}:${relative}`);
    const stat = await fs.stat(sourceFile).catch(() => null);
    if (!stat?.isFile()) {
      throw new Error(`${engine.engineId}: fichier requis absent: ${relative}`);
    }
    if (isExecutableRequired(config, engine, relative) && canCheckExecutableBits() && (stat.mode & 0o111) === 0) {
      throw new Error(`${engine.engineId}: binaire non executable pour ${engine.platform ?? config.platform}: ${relative}`);
    }
  }

  const stageDir = path.join(workDir, `${engine.engineId}-${engine.version}`);
  await fs.rm(stageDir, { recursive: true, force: true });
  await fs.mkdir(stageDir, { recursive: true });
  await copyTreeSafe(sourceDir, stageDir, sourceDir);

  const licenseFiles = [];
  for (const relative of engine.licenseFiles) {
    const targetRelative = normalizeZipPath(relative.startsWith("licenses/") ? relative : `licenses/${path.basename(relative)}`);
    const sourceFile = resolveInside(sourceDir, relative, `${engine.engineId}:${relative}`);
    const targetFile = resolveInside(stageDir, targetRelative, `${engine.engineId}:${targetRelative}`);
    await fs.mkdir(path.dirname(targetFile), { recursive: true });
    await fs.copyFile(sourceFile, targetFile);
    licenseFiles.push(targetRelative);
  }
  const noticeFiles = [];
  for (const relative of engine.noticeFiles ?? []) {
    const targetRelative = normalizeZipPath(relative.startsWith("licenses/") ? relative : `licenses/${path.basename(relative)}`);
    const sourceFile = resolveInside(sourceDir, relative, `${engine.engineId}:${relative}`);
    const targetFile = resolveInside(stageDir, targetRelative, `${engine.engineId}:${targetRelative}`);
    await fs.mkdir(path.dirname(targetFile), { recursive: true });
    await fs.copyFile(sourceFile, targetFile);
    noticeFiles.push(targetRelative);
  }

  const packageMetadata = {
    engineId: engine.engineId,
    displayName: engine.displayName,
    version: engine.version,
    platform: engine.platform ?? config.platform,
    mode: engine.mode,
    binaryPaths: engine.binaryPaths.map(normalizeZipPath),
    healthCheck: engine.healthCheck,
    licenseName: engine.licenseName,
    licenseFiles,
    noticeFiles,
    createdAt: new Date().toISOString(),
    packageFormatVersion: config.packageFormatVersion
  };
  await fs.writeFile(path.join(stageDir, "engine.json"), `${JSON.stringify(packageMetadata, null, 2)}\n`, "utf8");

  const installedSizeBytes = await directorySize(stageDir);
  const archivePath = resolveInside(options.outputDir, engine.outputArchiveName, `${engine.engineId}:outputArchiveName`);
  await fs.rm(archivePath, { force: true });
  await createZip(stageDir, archivePath);
  const compressedSizeBytes = (await fs.stat(archivePath)).size;
  const sha256 = await sha256File(archivePath);

  console.log(`${engine.engineId}: ${path.relative(repoRoot, archivePath)} ${compressedSizeBytes} bytes ${sha256}`);

  return {
    id: engine.engineId,
    displayName: engine.displayName,
    mode: engine.mode,
    version: engine.version,
    platform: engine.platform ?? config.platform,
    archiveType: "zip",
    downloadUrl: `${options.releaseBaseUrl}${path.basename(engine.outputArchiveName)}`,
    sha256,
    compressedSizeBytes,
    installedSizeBytes: engine.estimatedInstalledSizeBytes ?? installedSizeBytes,
    binaryPaths: engine.binaryPaths.map(normalizeZipPath),
    healthCheck: engine.healthCheck,
    licenseName: engine.licenseName,
    licenseUrl: engine.licenseUrl ?? null,
    noticeFiles,
    required: Boolean(engine.required),
    dependencies: engine.dependencies ?? []
  };
}

async function runValidation() {
  const root = path.join(repoRoot, "tmp", "engine-packaging-validation");
  await fs.rm(root, { recursive: true, force: true });
  const source = path.join(root, "sources", "fake");
  await fs.mkdir(path.join(source, "bin"), { recursive: true });
  await fs.mkdir(path.join(source, "licenses"), { recursive: true });
  await fs.writeFile(path.join(source, "bin", "fake.exe"), "fake binary\n");
  await fs.writeFile(path.join(source, "licenses", "LICENSE.txt"), "Fake license\n");

  const config = {
    manifestVersion: 1,
    packageFormatVersion: 1,
    platform: "windows-x64",
    downloadBaseUrl: placeholderBaseUrl,
    engines: [
      {
        engineId: "fake",
        displayName: "Fake Engine",
        mode: "base",
        version: "1.0.0",
        platform: "windows-x64",
        sourceDir: path.relative(repoRoot, source),
        outputArchiveName: "fake-1.0.0-windows-x64.zip",
        binaryPaths: ["bin/fake.exe"],
        healthCheck: "fake-health",
        licenseName: "Test",
        licenseUrl: null,
        licenseFiles: ["licenses/LICENSE.txt"],
        required: false,
        dependencies: []
      }
    ]
  };

  const outputDir = path.join(root, "dist");
  await packageFromConfig(config, {
    configPath: path.join(root, "engine-packages.config.json"),
    outputDir,
    releaseBaseUrl: `${placeholderBaseUrl}/`,
    clean: true
  });

  const archive = path.join(outputDir, "fake-1.0.0-windows-x64.zip");
  const extractDir = path.join(root, "extract");
  await extractZip(archive, extractDir);
  await assertFile(path.join(extractDir, "engine.json"), "engine.json absent du ZIP");
  await assertFile(path.join(extractDir, "bin", "fake.exe"), "binaire absent du ZIP");
  const engineJson = await readJson(path.join(extractDir, "engine.json"));
  if (engineJson.engineId !== "fake" || engineJson.packageFormatVersion !== 1) {
    throw new Error("engine.json invalide dans le ZIP de validation");
  }
  const manifest = await readJson(path.join(outputDir, "engines-manifest.json"));
  if (manifest.engines?.[0]?.downloadUrl !== `${placeholderBaseUrl}/fake-1.0.0-windows-x64.zip`) {
    throw new Error("URL placeholder du manifeste invalide");
  }
  if (manifest.engines?.[0]?.sha256 !== await sha256File(archive)) {
    throw new Error("SHA-256 du manifeste invalide");
  }
  if (!Number.isInteger(manifest.engines?.[0]?.compressedSizeBytes) || manifest.engines[0].compressedSizeBytes <= 0) {
    throw new Error("Taille compressee du manifeste invalide");
  }

  const missingBinary = structuredClone(config);
  missingBinary.engines[0].binaryPaths = ["bin/missing.exe"];
  await expectFailure(() => packageFromConfig(missingBinary, {
    configPath: "validation-missing-binary",
    outputDir: path.join(root, "missing-binary"),
    releaseBaseUrl: `${placeholderBaseUrl}/`,
    clean: true
  }), "binaire manquant accepte a tort");

  const missingLicense = structuredClone(config);
  missingLicense.engines[0].licenseFiles = ["licenses/MISSING.txt"];
  await expectFailure(() => packageFromConfig(missingLicense, {
    configPath: "validation-missing-license",
    outputDir: path.join(root, "missing-license"),
    releaseBaseUrl: `${placeholderBaseUrl}/`,
    clean: true
  }), "licence manquante acceptee a tort");

  const realBaseUrlConfig = structuredClone(config);
  delete realBaseUrlConfig.downloadBaseUrl;
  await packageFromConfig(realBaseUrlConfig, {
    configPath: "validation-real-base-url",
    outputDir: path.join(root, "real-base-url"),
    releaseBaseUrl: "https://downloads.example.test/multi-converter/",
    clean: true
  });
  const realBaseUrlManifest = await readJson(path.join(root, "real-base-url", "engines-manifest.json"));
  if (realBaseUrlManifest.engines?.[0]?.downloadUrl !== "https://downloads.example.test/multi-converter/fake-1.0.0-windows-x64.zip") {
    throw new Error("URL configuree du manifeste invalide");
  }

  const macosSource = path.join(root, "sources", "macos-ffmpeg");
  await fs.mkdir(path.join(macosSource, "bin"), { recursive: true });
  await fs.mkdir(path.join(macosSource, "licenses"), { recursive: true });
  const macosBinary = path.join(macosSource, "bin", "ffmpeg-universal-apple-darwin");
  await fs.writeFile(macosBinary, "fake macos ffmpeg\n");
  await fs.chmod(macosBinary, 0o755);
  await fs.writeFile(path.join(macosSource, "licenses", "LICENSE.txt"), "LGPL/GPL\n");
  await fs.writeFile(path.join(macosSource, "licenses", "THIRD_PARTY_NOTICES.txt"), "notices\n");
  const macosConfig = {
    manifestVersion: 1,
    packageFormatVersion: 1,
    platform: "macos-universal",
    downloadBaseUrl: placeholderBaseUrl,
    engines: [
      {
        engineId: "ffmpeg",
        displayName: "FFmpeg",
        mode: "base",
        version: "8.1.1",
        platform: "macos-universal",
        sourceDir: path.relative(repoRoot, macosSource),
        outputArchiveName: "ffmpeg-8.1.1-macos-universal.zip",
        binaryPaths: ["bin/ffmpeg-universal-apple-darwin"],
        healthCheck: "ffmpeg-audio",
        licenseName: "LGPL/GPL selon build",
        licenseUrl: null,
        licenseFiles: ["licenses/LICENSE.txt"],
        noticeFiles: ["licenses/THIRD_PARTY_NOTICES.txt"],
        required: false,
        dependencies: []
      }
    ]
  };
  await packageFromConfig(macosConfig, {
    configPath: "validation-macos-universal",
    outputDir: path.join(root, "macos-universal"),
    releaseBaseUrl: `${placeholderBaseUrl}/`,
    clean: true
  });
  const macosManifest = await readJson(path.join(root, "macos-universal", "engines-manifest.json"));
  if (macosManifest.engines?.[0]?.platform !== "macos-universal") {
    throw new Error("Plateforme macOS invalide dans le manifeste de validation");
  }
  const macosNonExecutableSource = path.join(root, "sources", "macos-non-executable");
  await fs.cp(macosSource, macosNonExecutableSource, { recursive: true, force: true });
  await fs.chmod(path.join(macosNonExecutableSource, "bin", "ffmpeg-universal-apple-darwin"), 0o644);
  const macosNonExecutable = structuredClone(macosConfig);
  macosNonExecutable.engines[0].sourceDir = path.relative(repoRoot, macosNonExecutableSource);
  if (canCheckExecutableBits()) {
    await expectFailure(() => packageFromConfig(macosNonExecutable, {
      configPath: "validation-macos-non-executable",
      outputDir: path.join(root, "macos-non-executable"),
      releaseBaseUrl: `${placeholderBaseUrl}/`,
      clean: true
    }), "binaire macOS non executable accepte a tort");
  }

  const missingNotice = structuredClone(config);
  missingNotice.engines[0].noticeFiles = ["licenses/MISSING_NOTICE.txt"];
  await expectFailure(() => packageFromConfig(missingNotice, {
    configPath: "validation-missing-notice",
    outputDir: path.join(root, "missing-notice"),
    releaseBaseUrl: `${placeholderBaseUrl}/`,
    clean: true
  }), "notice tierce manquante acceptee a tort");

  const pandocSource = path.join(root, "sources", "pandoc");
  await fs.mkdir(path.join(pandocSource, "bin"), { recursive: true });
  await fs.mkdir(path.join(pandocSource, "licenses"), { recursive: true });
  await fs.writeFile(path.join(pandocSource, "bin", "pandoc.exe"), "fake pandoc\n");
  await fs.writeFile(path.join(pandocSource, "licenses", "LICENSE.txt"), "GPL-2.0-or-later\n");
  await fs.writeFile(path.join(pandocSource, "licenses", "THIRD_PARTY_NOTICES.txt"), "notices\n");
  const pandocConfig = {
    manifestVersion: 1,
    packageFormatVersion: 1,
    platform: "windows-x64",
    downloadBaseUrl: placeholderBaseUrl,
    engines: [
      {
        engineId: "pandoc",
        displayName: "Pandoc",
        mode: "advanced",
        version: "compatible",
        platform: "windows-x64",
        sourceDir: path.relative(repoRoot, pandocSource),
        outputArchiveName: "pandoc-compatible-windows-x64.zip",
        binaryPaths: ["bin/pandoc.exe"],
        healthCheck: "pandoc-md-html",
        licenseName: "GPL-2.0-or-later",
        licenseUrl: null,
        licenseFiles: ["licenses/LICENSE.txt"],
        noticeFiles: ["licenses/THIRD_PARTY_NOTICES.txt"],
        required: false,
        dependencies: []
      }
    ]
  };
  const missingPandoc = structuredClone(pandocConfig);
  missingPandoc.engines[0].binaryPaths = ["bin/MISSING.exe"];
  await expectFailure(() => packageFromConfig(missingPandoc, {
    configPath: "validation-missing-pandoc",
    outputDir: path.join(root, "missing-pandoc"),
    releaseBaseUrl: `${placeholderBaseUrl}/`,
    clean: true
  }), "pandoc.exe manquant accepte a tort");

  const missingPandocLicense = structuredClone(pandocConfig);
  missingPandocLicense.engines[0].licenseFiles = ["licenses/MISSING.txt"];
  await expectFailure(() => packageFromConfig(missingPandocLicense, {
    configPath: "validation-missing-pandoc-license",
    outputDir: path.join(root, "missing-pandoc-license"),
    releaseBaseUrl: `${placeholderBaseUrl}/`,
    clean: true
  }), "licence Pandoc manquante acceptee a tort");

  const libvipsSource = path.join(root, "sources", "libvips");
  await fs.mkdir(path.join(libvipsSource, "bin"), { recursive: true });
  await fs.mkdir(path.join(libvipsSource, "lib"), { recursive: true });
  await fs.mkdir(path.join(libvipsSource, "share"), { recursive: true });
  await fs.mkdir(path.join(libvipsSource, "licenses"), { recursive: true });
  await fs.writeFile(path.join(libvipsSource, "bin", "vips.exe"), "fake vips\n");
  await fs.writeFile(path.join(libvipsSource, "bin", "libvips-42.dll"), "fake dll\n");
  await fs.writeFile(path.join(libvipsSource, "licenses", "LICENSE.txt"), "LGPL-2.1-or-later\n");
  await fs.writeFile(path.join(libvipsSource, "licenses", "THIRD_PARTY_NOTICES.txt"), "notices\n");
  const libvipsConfig = {
    manifestVersion: 1,
    packageFormatVersion: 1,
    platform: "windows-x64",
    downloadBaseUrl: placeholderBaseUrl,
    engines: [
      {
        engineId: "libvips",
        displayName: "libvips",
        mode: "advanced",
        version: "compatible",
        platform: "windows-x64",
        sourceDir: path.relative(repoRoot, libvipsSource),
        outputArchiveName: "libvips-compatible-windows-x64.zip",
        binaryPaths: ["bin/vips.exe"],
        healthCheck: "libvips-image",
        licenseName: "LGPL-2.1-or-later",
        licenseUrl: null,
        licenseFiles: ["licenses/LICENSE.txt"],
        noticeFiles: ["licenses/THIRD_PARTY_NOTICES.txt"],
        required: false,
        dependencies: []
      }
    ]
  };
  await packageFromConfig(libvipsConfig, {
    configPath: "validation-libvips",
    outputDir: path.join(root, "libvips"),
    releaseBaseUrl: `${placeholderBaseUrl}/`,
    clean: true
  });
  const missingLibvips = structuredClone(libvipsConfig);
  missingLibvips.engines[0].binaryPaths = ["bin/MISSING.exe"];
  await expectFailure(() => packageFromConfig(missingLibvips, {
    configPath: "validation-missing-libvips",
    outputDir: path.join(root, "missing-libvips"),
    releaseBaseUrl: `${placeholderBaseUrl}/`,
    clean: true
  }), "vips.exe manquant accepte a tort");

  const missingLibvipsLicense = structuredClone(libvipsConfig);
  missingLibvipsLicense.engines[0].licenseFiles = ["licenses/MISSING.txt"];
  await expectFailure(() => packageFromConfig(missingLibvipsLicense, {
    configPath: "validation-missing-libvips-license",
    outputDir: path.join(root, "missing-libvips-license"),
    releaseBaseUrl: `${placeholderBaseUrl}/`,
    clean: true
  }), "licence libvips manquante acceptee a tort");

  console.log("Engine packaging validation OK");
}

function validateConfig(config) {
  if (!Number.isInteger(config.manifestVersion)) throw new Error("manifestVersion doit etre un entier");
  if (!Number.isInteger(config.packageFormatVersion)) throw new Error("packageFormatVersion doit etre un entier");
  if (typeof config.platform !== "string" || !config.platform) throw new Error("platform est requis");
  if (!Array.isArray(config.engines) || config.engines.length === 0) throw new Error("engines[] est requis");
}

function validateEngineConfig(engine) {
  for (const field of ["engineId", "displayName", "mode", "version", "sourceDir", "outputArchiveName", "healthCheck", "licenseName"]) {
    if (typeof engine[field] !== "string" || !engine[field]) throw new Error(`${engine.engineId ?? "engine"}: ${field} est requis`);
  }
  if (!["base", "advanced"].includes(engine.mode)) throw new Error(`${engine.engineId}: mode invalide`);
  if (!Array.isArray(engine.binaryPaths) || engine.binaryPaths.length === 0) throw new Error(`${engine.engineId}: binaryPaths[] est requis`);
  if (!Array.isArray(engine.licenseFiles) || engine.licenseFiles.length === 0) throw new Error(`${engine.engineId}: licenseFiles[] est requis`);
  if (engine.noticeFiles !== undefined && !Array.isArray(engine.noticeFiles)) throw new Error(`${engine.engineId}: noticeFiles doit etre un tableau si configure`);
  for (const relative of [...engine.binaryPaths, ...engine.licenseFiles, ...(engine.noticeFiles ?? []), engine.outputArchiveName]) {
    normalizeZipPath(relative);
  }
}

async function copyTreeSafe(sourceDir, targetDir, sourceRoot = sourceDir) {
  const resolvedSourceRoot = path.resolve(sourceRoot);
  for (const entry of await fs.readdir(sourceDir, { withFileTypes: true })) {
    const relative = entry.name;
    normalizeZipPath(relative);
    const source = path.join(sourceDir, relative);
    const target = path.join(targetDir, relative);
    if (entry.isSymbolicLink()) {
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
        throw new Error(`Lien symbolique casse refuse: ${source}`);
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
  const isFrameworkLink = source.split(path.sep).some((part) => part.endsWith(".framework"));
  if (isFrameworkLink) {
    return normalizedAbsoluteTarget.replace(/^\/+/, "");
  }
  return null;
}

function isExecutableRequired(config, engine, relative) {
  const platform = engine.platform ?? config.platform;
  return platform !== "windows-x64" && engine.binaryPaths.includes(relative);
}

function canCheckExecutableBits() {
  return process.platform !== "win32";
}

async function createZip(sourceDir, archivePath) {
  if (process.platform !== "win32") {
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

  const script = [
    "Add-Type -AssemblyName System.IO.Compression.FileSystem",
    `$source = ${psQuote(sourceDir)}`,
    `$dest = ${psQuote(archivePath)}`,
    "if (Test-Path -LiteralPath $dest) { Remove-Item -LiteralPath $dest -Force }",
    "[System.IO.Compression.ZipFile]::CreateFromDirectory($source, $dest, [System.IO.Compression.CompressionLevel]::Optimal, $false)"
  ].join("; ");
  runPowerShell(script, "Creation ZIP impossible");
}

async function extractZip(archivePath, destinationDir) {
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

function resolveInside(root, relative, label) {
  const safeRelative = normalizeZipPath(relative);
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, safeRelative);
  if (resolved !== resolvedRoot && !resolved.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error(`Chemin hors racine refuse pour ${label}: ${relative}`);
  }
  return resolved;
}

function normalizeZipPath(relative) {
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

async function directorySize(dir) {
  let total = 0;
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const item = path.join(dir, entry.name);
    if (entry.isDirectory()) total += await directorySize(item);
    else if (entry.isFile()) total += (await fs.stat(item)).size;
  }
  return total;
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

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function assertFile(filePath, message) {
  const stat = await fs.stat(filePath).catch(() => null);
  if (!stat?.isFile()) throw new Error(message);
}

async function expectFailure(action, message) {
  try {
    await action();
  } catch {
    return;
  }
  throw new Error(message);
}

function ensureTrailingSlash(url) {
  return url.endsWith("/") ? url : `${url}/`;
}
