import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pipeline } from "node:stream/promises";
import { publicSourceLabel } from "./download-integrity.mjs";

export function hostEnginePlatform() {
  if (process.platform === "win32" && process.arch === "x64") return "windows-x64";
  if (process.platform === "darwin") return "macos-universal";
  if (process.platform === "linux" && process.arch === "x64") return "linux-x64";
  return "unsupported";
}

export function createBundledEngineHelpers({ root, platform, ffmpegVersion }) {
  async function verifyDarwinArch(filePath, arches) {
    if (process.platform !== "darwin") return false;
    const stat = await fs.stat(filePath).catch(() => null);
    if (!stat?.isFile() || stat.size <= 0) return false;
    const required = Array.isArray(arches) ? arches : [arches];
    for (const arch of required) {
      const result = spawnSync("lipo", [filePath, "-verify_arch", arch], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
      if (result.status !== 0) return false;
    }
    return true;
  }

  async function downloadVerified(url, target, expectedSha256, label) {
    try {
      await verifySha256(target, expectedSha256);
      return;
    } catch {
      // Download below.
    }
    console.log(`Downloading ${label}: ${publicSourceLabel(url)}`);
    const response = await fetch(url, { headers: { "User-Agent": "Multi-Converter-Packager" } });
    if (!response.ok || !response.body) {
      throw new Error(`${label}: telechargement impossible (${response.status})`);
    }
    await fs.mkdir(path.dirname(target), { recursive: true });
    await pipeline(response.body, createWriteStream(target));
    await verifySha256(target, expectedSha256);
  }

  async function verifySha256(filePath, expected) {
    const actual = await sha256File(filePath);
    if (actual !== expected.toLowerCase()) {
      await fs.rm(filePath, { force: true });
      throw new Error(`SHA-256 inattendu pour ${path.relative(root, filePath)}. Attendu ${expected}, obtenu ${actual}.`);
    }
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

  async function extractArchive(archive, destination, archiveType = "tar") {
    await fs.rm(destination, { recursive: true, force: true });
    await fs.mkdir(destination, { recursive: true });
    const result = archiveType === "zip"
      ? extractZipArchive(archive, destination)
      : spawnSync("tar", ["-xf", archive, "-C", destination], { stdio: "inherit" });
    if (result.status !== 0) throw new Error(`Extraction impossible : ${archive}`);
  }

  function extractZipArchive(archive, destination) {
    if (process.platform === "win32") {
      return spawnSync("powershell", ["-NoProfile", "-Command", `Expand-Archive -LiteralPath '${archive.replaceAll("'", "''")}' -DestinationPath '${destination.replaceAll("'", "''")}' -Force`], { stdio: "inherit", windowsHide: true });
    }
    return spawnSync("unzip", ["-q", archive, "-d", destination], { stdio: "inherit" });
  }

  async function findFile(base, name) {
    const matches = [];
    async function walk(dir) {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) await walk(full);
        if (entry.isFile() && entry.name.toLowerCase() === name.toLowerCase()) matches.push(full);
      }
    }
    await walk(base);
    if (!matches[0]) throw new Error(`Fichier introuvable dans l'archive : ${name}`);
    return matches[0];
  }

  async function assertFile(filePath, message) {
    const stat = await fs.stat(filePath).catch(() => null);
    if (!stat?.isFile() || stat.size <= 0) throw new Error(message);
  }

  async function normalizeBundledNoticeText(rootDir, metadata) {
    for (const relative of metadata.noticeFiles ?? []) {
      const noticePath = path.join(rootDir, normalizeArchivePath(relative));
      const content = await fs.readFile(noticePath, "utf8").catch(() => null);
      if (content === null) continue;
      const updated = content.replace(
        /This package is only used by the optional Multi-Converter .+\./g,
        "This package is bundled with Multi-Converter for local advanced conversions.",
      );
      if (updated !== content) {
        await fs.writeFile(noticePath, updated);
      }
    }
  }

  async function pruneWindowsOnlyResourcesForNonWindowsEngine(rootDir, engine) {
    if (platform === "windows-x64") return;

    const removed = [];
    await walkFiles(rootDir, async (filePath) => {
      if (!isWindowsOnlyResource(filePath)) return;
      await fs.rm(filePath, { force: true });
      removed.push(path.relative(rootDir, filePath).replaceAll(path.sep, "/"));
    });

    if (removed.length) {
      console.log(`${engine.id}: removed ${removed.length} Windows-only resource(s) from ${platform} bundle.`);
    }
  }

  async function assertNoWindowsOnlyResourcesForNonWindowsEngine(rootDir, engine) {
    if (platform === "windows-x64") return;

    const found = [];
    await walkFiles(rootDir, async (filePath) => {
      if (isWindowsOnlyResource(filePath)) {
        found.push(path.relative(rootDir, filePath).replaceAll(path.sep, "/"));
      }
    });

    if (found.length) {
      throw new Error(`${engine.id}: ressource Windows-only inattendue dans le moteur ${platform}: ${found[0]}`);
    }
  }

  async function assertNoBrokenSymlinksForNonWindowsEngine(rootDir, engine) {
    if (platform === "windows-x64") return;

    const broken = [];
    await walkEntries(rootDir, async (filePath, entry) => {
      if (!entry.isSymbolicLink()) return;
      const stat = await fs.stat(filePath).catch(() => null);
      if (!stat) {
        broken.push(path.relative(rootDir, filePath).replaceAll(path.sep, "/"));
      }
    });

    if (broken.length) {
      throw new Error(`${engine.id}: lien symbolique casse dans le moteur ${platform}: ${broken[0]}`);
    }
  }

  async function pruneLibreOfficeOptionalLinuxBackends(rootDir, engine) {
    if (platform !== "linux-x64" || engine.id !== "libreoffice") return;
    const optionalBackends = [
      "program/libkf5be1lo.so",
      "program/libvclplug_kf5lo.so",
      "program/libvclplug_qt5lo.so",
      "program/libvclplug_qt6lo.so",
      "program/libvclplug_gtk3lo.so",
      "program/libvclplug_gtk3_kde5lo.so",
      "program/libvclplug_gtk4lo.so",
      "program/lo_gtk3filepicker",
      "program/lo_gtk4filepicker",
      "program/lo_kde5filepicker",
      "program/lo_qt5filepicker",
      "program/lo_qt6filepicker",
      "program/libavmediagtk.so",
      "program/libavmediagst.so",
      "program/libavmediaqt6.so",
      "program/libdeploymentgui.so",
      "program/liblibreofficekitgtk.so",
      "program/libofficebean.so",
    ];
    const removed = [];
    for (const relative of optionalBackends) {
      const filePath = path.join(rootDir, relative);
      const stat = await fs.stat(filePath).catch(() => null);
      if (!stat?.isFile()) continue;
      await fs.rm(filePath, { force: true });
      removed.push(relative);
    }
    const optionalPythonModulePattern =
      /^program\/python-core-[^/]+\/lib\/lib-dynload\/_crypt\.cpython-[^/]+\.so$/;
    await walkFiles(path.join(rootDir, "program"), async (filePath) => {
      const relative = path.relative(rootDir, filePath).replaceAll(path.sep, "/");
      if (!optionalPythonModulePattern.test(relative)) return;
      await fs.rm(filePath, { force: true });
      removed.push(relative);
    });
    if (removed.length) {
      console.log(`${engine.id}: removed ${removed.length} optional Linux UI backend(s) from headless bundle.`);
    }
  }

  async function walkFiles(startDir, visit) {
    const entries = await fs.readdir(startDir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const full = path.join(startDir, entry.name);
      if (entry.isDirectory()) {
        await walkFiles(full, visit);
      } else if (entry.isFile()) {
        await visit(full);
      }
    }
  }

  async function walkEntries(startDir, visit) {
    const entries = await fs.readdir(startDir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const full = path.join(startDir, entry.name);
      await visit(full, entry);
      if (entry.isDirectory()) {
        await walkEntries(full, visit);
      }
    }
  }

  function isWindowsOnlyResource(filePath) {
    return /\.(bat|cmd|dll|exe|msi|ps1)$/i.test(filePath);
  }

  function isPlaceholderUrl(url) {
    return String(url).includes("REPLACE_WITH_RELEASE_BASE_URL");
  }

  function isPlaceholderSha(value) {
    return !/^[a-f0-9]{64}$/i.test(String(value)) || /^0{64}$/i.test(String(value));
  }

  function hostEnginePlatform() {
    if (process.platform === "win32" && process.arch === "x64") return "windows-x64";
    if (process.platform === "darwin") return "macos-universal";
    if (process.platform === "linux" && process.arch === "x64") return "linux-x64";
    return "unsupported";
  }

  function baseSidecarsForPlatform(targetPlatform) {
    if (targetPlatform === "windows-x64") {
      return [
        {
          id: "ffmpeg",
          fileName: "ffmpeg-x86_64-pc-windows-msvc.exe",
          localCandidates: [
            path.join(process.env.LOCALAPPDATA ?? "", "Multi-Converter", "tool-env", "ffmpeg", ffmpegVersion, "bin", "ffmpeg-x86_64-pc-windows-msvc.exe"),
            path.join(root, "engine-sources", "windows-x64", "ffmpeg", "bin", "ffmpeg-x86_64-pc-windows-msvc.exe"),
          ],
        },
        {
          id: "ffprobe",
          fileName: "ffprobe-x86_64-pc-windows-msvc.exe",
          localCandidates: [
            path.join(process.env.LOCALAPPDATA ?? "", "Multi-Converter", "tool-env", "ffprobe", ffmpegVersion, "bin", "ffprobe-x86_64-pc-windows-msvc.exe"),
            path.join(root, "engine-sources", "windows-x64", "ffprobe", "bin", "ffprobe-x86_64-pc-windows-msvc.exe"),
          ],
        },
      ];
    }

    if (targetPlatform === "macos-universal") {
      const nativeTriple = nativeDarwinTriple();
      return ["aarch64-apple-darwin", "x86_64-apple-darwin"].flatMap((targetTriple) => [
        {
          id: "ffmpeg",
          fileName: `ffmpeg-${targetTriple}`,
          smoke: process.platform === "darwin" && targetTriple === nativeTriple,
          lipoArch: targetTriple === "aarch64-apple-darwin" ? "arm64" : "x86_64",
          localCandidates: [
            path.join(process.env.HOME ?? "", "Library", "Application Support", "Multi-Converter", "tool-env", "ffmpeg", ffmpegVersion, "bin", `ffmpeg-${targetTriple}`),
            path.join(root, "engine-sources", "macos-universal", "ffmpeg", "bin", `ffmpeg-${targetTriple}`),
          ],
        },
        {
          id: "ffprobe",
          fileName: `ffprobe-${targetTriple}`,
          smoke: process.platform === "darwin" && targetTriple === nativeTriple,
          lipoArch: targetTriple === "aarch64-apple-darwin" ? "arm64" : "x86_64",
          localCandidates: [
            path.join(process.env.HOME ?? "", "Library", "Application Support", "Multi-Converter", "tool-env", "ffprobe", ffmpegVersion, "bin", `ffprobe-${targetTriple}`),
            path.join(root, "engine-sources", "macos-universal", "ffprobe", "bin", `ffprobe-${targetTriple}`),
          ],
        },
      ]);
    }

    if (targetPlatform === "linux-x64") {
      return [
        {
          id: "ffmpeg",
          fileName: "ffmpeg-x86_64-unknown-linux-gnu",
          localCandidates: [
            path.join(process.env.HOME ?? "", ".local", "share", "Multi-Converter", "tool-env", "ffmpeg", ffmpegVersion, "bin", "ffmpeg-x86_64-unknown-linux-gnu"),
            path.join(root, "engine-sources", "linux-x64", "ffmpeg", "bin", "ffmpeg-x86_64-unknown-linux-gnu"),
          ],
        },
        {
          id: "ffprobe",
          fileName: "ffprobe-x86_64-unknown-linux-gnu",
          localCandidates: [
            path.join(process.env.HOME ?? "", ".local", "share", "Multi-Converter", "tool-env", "ffprobe", ffmpegVersion, "bin", "ffprobe-x86_64-unknown-linux-gnu"),
            path.join(root, "engine-sources", "linux-x64", "ffprobe", "bin", "ffprobe-x86_64-unknown-linux-gnu"),
          ],
        },
      ];
    }

    return [];
  }

  function nativeDarwinTriple() {
    return process.arch === "arm64" ? "aarch64-apple-darwin" : "x86_64-apple-darwin";
  }

  async function ensureEngineExecutables(rootDir, engine) {
    if (platform === "windows-x64") return;
    for (const relative of engine.binaryPaths ?? []) {
      await ensureExecutable(path.join(rootDir, normalizeArchivePath(relative)));
    }
  }

  async function configureLinuxEngineRpaths(rootDir, engine) {
    if (platform !== "linux-x64" || process.platform !== "linux" || engine.id !== "libvips") return;
    const libDir = path.join(rootDir, "lib");
    if (!(await isDirectory(libDir))) return;

    const elfFiles = [];
    await walkFiles(rootDir, async (filePath) => {
      if (await isElfFile(filePath)) elfFiles.push(filePath);
    });

    for (const filePath of elfFiles) {
      const result = spawnSync("patchelf", ["--set-rpath", linuxRpathFor(filePath, libDir), filePath], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
      if (result.status !== 0) {
        throw new Error(`${engine.id}: impossible de configurer le RPATH Linux pour ${path.relative(rootDir, filePath)} (${result.stderr || result.stdout})`);
      }
    }
  }

  function linuxRpathFor(filePath, libDir) {
    const relative = path.relative(path.dirname(filePath), libDir).replaceAll(path.sep, "/");
    return relative ? `$ORIGIN/${relative}` : "$ORIGIN";
  }

  async function isElfFile(filePath) {
    const handle = await fs.open(filePath, "r").catch(() => null);
    if (!handle) return false;
    try {
      const header = Buffer.alloc(4);
      const { bytesRead } = await handle.read(header, 0, header.length, 0);
      return bytesRead === 4 && header[0] === 0x7f && header[1] === 0x45 && header[2] === 0x4c && header[3] === 0x46;
    } finally {
      await handle.close();
    }
  }

  async function isDirectory(filePath) {
    const stat = await fs.stat(filePath).catch(() => null);
    return stat?.isDirectory() === true;
  }

  async function ensureExecutable(filePath) {
    if (platform === "windows-x64") return;
    await fs.chmod(filePath, 0o755).catch(() => {});
  }

  function normalizeArchivePath(relative) {
    const normalized = String(relative).replaceAll("\\", "/");
    if (!normalized || normalized.startsWith("/") || normalized.includes("//")) {
      throw new Error(`Chemin invalide dans l'archive : ${relative}`);
    }
    const parts = normalized.split("/");
    if (parts.some((part) => !part || part === "." || part === "..")) {
      throw new Error(`Chemin ambigu dans l'archive : ${relative}`);
    }
    return normalized;
  }

  return {
    assertFile,
    assertNoBrokenSymlinksForNonWindowsEngine,
    assertNoWindowsOnlyResourcesForNonWindowsEngine,
    baseSidecarsForPlatform,
    configureLinuxEngineRpaths,
    downloadVerified,
    ensureEngineExecutables,
    extractArchive,
    findFile,
    isPlaceholderSha,
    isPlaceholderUrl,
    normalizeArchivePath,
    normalizeBundledNoticeText,
    pruneLibreOfficeOptionalLinuxBackends,
    pruneWindowsOnlyResourcesForNonWindowsEngine,
    sha256File,
    verifyDarwinArch,
    verifyExpectedFileSha256: verifySha256,
  };
}
