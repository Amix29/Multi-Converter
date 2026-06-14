import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { spawnSync } from "node:child_process";
import process from "node:process";
import { publicSourceLabel } from "./lib/download-integrity.mjs";
import { ffmpegVersionFromEnv } from "./lib/ffmpeg-version.mjs";

const root = process.cwd();
const downloads = path.join(root, "engine-sources", ".downloads");
const extracts = path.join(root, "engine-sources", ".extracts");
const platformRoot = path.join(root, "engine-sources", "macos-universal");
const userAgent = { "User-Agent": "Multi-Converter-Packager" };
const expectedVersion = ffmpegVersionFromEnv("FFMPEG_MACOS_EXPECTED_VERSION", root);
const archInputs = [
  {
    arch: "aarch64",
    triple: "aarch64-apple-darwin",
    lipoArch: "arm64",
    archiveEnv: "FFMPEG_MACOS_AARCH64_ARCHIVE",
    urlEnv: "FFMPEG_MACOS_AARCH64_ARCHIVE_URL",
    shaEnv: "FFMPEG_MACOS_AARCH64_ARCHIVE_SHA256",
    ffprobeArchiveEnv: "FFPROBE_MACOS_AARCH64_ARCHIVE",
    ffprobeUrlEnv: "FFPROBE_MACOS_AARCH64_ARCHIVE_URL",
    ffprobeShaEnv: "FFPROBE_MACOS_AARCH64_ARCHIVE_SHA256",
  },
  {
    arch: "x86_64",
    triple: "x86_64-apple-darwin",
    lipoArch: "x86_64",
    archiveEnv: "FFMPEG_MACOS_X86_64_ARCHIVE",
    urlEnv: "FFMPEG_MACOS_X86_64_ARCHIVE_URL",
    shaEnv: "FFMPEG_MACOS_X86_64_ARCHIVE_SHA256",
    ffprobeArchiveEnv: "FFPROBE_MACOS_X86_64_ARCHIVE",
    ffprobeUrlEnv: "FFPROBE_MACOS_X86_64_ARCHIVE_URL",
    ffprobeShaEnv: "FFPROBE_MACOS_X86_64_ARCHIVE_SHA256",
  },
];

if (process.platform !== "darwin") {
  throw new Error("macOS FFmpeg engine preparation must run on macOS so lipo can create universal sidecars.");
}

requireCommand("xcrun", ["-find", "lipo"]);

await fs.mkdir(downloads, { recursive: true });
await fs.mkdir(extracts, { recursive: true });

const prepared = [];
for (const input of archInputs) {
  const source = readPinnedSource(input);
  const ffprobeSource = readOptionalFfprobeSource(input);
  const archive = await materializeArchive(source, input.arch, "ffmpeg");
  const extractDir = path.join(extracts, `ffmpeg-macos-${input.arch}`);
  await extractArchive(archive, extractDir);
  const ffprobeExtractDir = ffprobeSource
    ? path.join(extracts, `ffprobe-macos-${input.arch}`)
    : extractDir;
  if (ffprobeSource) {
    const ffprobeArchive = await materializeArchive(ffprobeSource, input.arch, "ffprobe");
    await extractArchive(ffprobeArchive, ffprobeExtractDir);
  }

  const ffmpeg = await findExecutable(extractDir, "ffmpeg");
  const ffprobe = await findExecutable(ffprobeExtractDir, "ffprobe");
  if (!ffmpeg || !ffprobe) {
    throw new Error(`${input.arch}: configured archives must contain both ffmpeg and ffprobe executables.`);
  }

  run("lipo", [ffmpeg, "-verify_arch", input.lipoArch]);
  run("lipo", [ffprobe, "-verify_arch", input.lipoArch]);
  await smokeTestVersion(ffmpeg, "ffmpeg");
  await smokeTestVersion(ffprobe, "ffprobe");

  prepared.push({
    ...input,
    source,
    ffprobeSource,
    extractDir,
    ffprobeExtractDir,
    ffmpeg,
    ffprobe,
  });
}

await fs.rm(path.join(platformRoot, "ffmpeg"), { recursive: true, force: true });
await fs.rm(path.join(platformRoot, "ffprobe"), { recursive: true, force: true });
await fs.mkdir(path.join(platformRoot, "ffmpeg", "bin"), { recursive: true });
await fs.mkdir(path.join(platformRoot, "ffmpeg", "licenses"), { recursive: true });
await fs.mkdir(path.join(platformRoot, "ffprobe", "bin"), { recursive: true });
await fs.mkdir(path.join(platformRoot, "ffprobe", "licenses"), { recursive: true });

for (const item of prepared) {
  await stageBinary("ffmpeg", item.ffmpeg, `bin/ffmpeg-${item.triple}`);
  await stageBinary("ffprobe", item.ffprobe, `bin/ffprobe-${item.triple}`);
}

await createUniversal("ffmpeg");
await createUniversal("ffprobe");
await stageNotices(prepared);

await smokeTestVersion(path.join(platformRoot, "ffmpeg", "bin", "ffmpeg-universal-apple-darwin"), "ffmpeg");
await smokeTestVersion(path.join(platformRoot, "ffprobe", "bin", "ffprobe-universal-apple-darwin"), "ffprobe");

console.log(`macOS FFmpeg/ffprobe ready for ${expectedVersion}.`);

function readPinnedSource(input) {
  const archivePath = process.env[input.archiveEnv]?.trim();
  const url = process.env[input.urlEnv]?.trim();
  const sha256 = process.env[input.shaEnv]?.trim();

  if (!archivePath && !url) {
    throw new Error([
      `${input.arch}: macOS FFmpeg source is not configured.`,
      `Set either ${input.archiveEnv} to a local archive or ${input.urlEnv} to a maintainer-approved archive URL.`,
      `Also set ${input.shaEnv} to the SHA-256 of that exact archive.`,
      "The script intentionally does not choose a third-party FFmpeg binary provider automatically.",
    ].join("\n"));
  }
  if (!/^[a-f0-9]{64}$/i.test(sha256 ?? "")) {
    throw new Error(`${input.arch}: ${input.shaEnv} must contain a 64-character SHA-256 checksum.`);
  }
  return { archivePath, url, sha256: sha256.toLowerCase() };
}

function readOptionalFfprobeSource(input) {
  const archivePath = process.env[input.ffprobeArchiveEnv]?.trim();
  const url = process.env[input.ffprobeUrlEnv]?.trim();
  const sha256 = process.env[input.ffprobeShaEnv]?.trim();
  if (!archivePath && !url && !sha256) return null;
  if (!archivePath && !url) {
    throw new Error(`${input.arch}: set either ${input.ffprobeArchiveEnv} or ${input.ffprobeUrlEnv} when using a separate ffprobe archive.`);
  }
  if (!/^[a-f0-9]{64}$/i.test(sha256 ?? "")) {
    throw new Error(`${input.arch}: ${input.ffprobeShaEnv} must contain a 64-character SHA-256 checksum when using a separate ffprobe archive.`);
  }
  return { archivePath, url, sha256: sha256.toLowerCase() };
}

async function materializeArchive(source, arch, stem) {
  if (source.archivePath) {
    const resolved = path.resolve(source.archivePath);
    await verifySha256(resolved, source.sha256, `${arch} ${stem} local archive`);
    return resolved;
  }

  const parsed = new URL(source.url);
  const archiveName = path.basename(parsed.pathname) || `${stem}-macos-${arch}.archive`;
  const target = path.join(downloads, `${stem}-${arch}-${archiveName}`);
  try {
    await verifySha256(target, source.sha256, `${arch} ${stem} cached archive`);
    return target;
  } catch {
    // Download below.
  }
  console.log(`Downloading ${publicSourceLabel(source.url)}`);
  const response = await fetch(source.url, { headers: userAgent });
  if (!response.ok || !response.body) {
    throw new Error(`${arch}: download failed (${response.status}) for ${publicSourceLabel(source.url)}`);
  }
  await pipeline(response.body, createWriteStream(target));
  await verifySha256(target, source.sha256, `${arch} ${stem} downloaded archive`);
  return target;
}

async function extractArchive(archive, destination) {
  await fs.rm(destination, { recursive: true, force: true });
  await fs.mkdir(destination, { recursive: true });
  const lower = archive.toLowerCase();
  if (lower.endsWith(".zip")) {
    run("unzip", ["-q", archive, "-d", destination]);
    return;
  }
  run("tar", ["-xf", archive, "-C", destination]);
}

async function findExecutable(dir, filename) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = await findExecutable(fullPath, filename);
      if (found) return found;
    } else if (entry.isFile() && entry.name === filename) {
      const stat = await fs.stat(fullPath);
      if ((stat.mode & 0o111) === 0) await fs.chmod(fullPath, 0o755);
      return fullPath;
    }
  }
  return null;
}

async function stageBinary(engineId, source, relative) {
  const target = path.join(platformRoot, engineId, relative);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.copyFile(source, target);
  await fs.chmod(target, 0o755);
}

async function createUniversal(stem) {
  const engineRoot = path.join(platformRoot, stem);
  const arm64 = path.join(engineRoot, "bin", `${stem}-aarch64-apple-darwin`);
  const x64 = path.join(engineRoot, "bin", `${stem}-x86_64-apple-darwin`);
  const universal = path.join(engineRoot, "bin", `${stem}-universal-apple-darwin`);
  run("lipo", ["-create", arm64, x64, "-output", universal]);
  await fs.chmod(universal, 0o755);
  run("lipo", [universal, "-verify_arch", "arm64"]);
  run("lipo", [universal, "-verify_arch", "x86_64"]);
}

async function stageNotices(items) {
  const license = process.env.FFMPEG_MACOS_LICENSE_FILE?.trim()
    ? path.resolve(process.env.FFMPEG_MACOS_LICENSE_FILE)
    : await findAny(extractDirs(items), ["LICENSE.txt", "LICENSE.md", "LICENSE", "COPYING", "COPYING.GPLv3", "COPYING.LGPLv3"]);
  if (!license) {
    throw new Error("FFmpeg license file is missing. Set FFMPEG_MACOS_LICENSE_FILE or include a license file in the archive.");
  }
  await copyLicenseTo("ffmpeg", license);
  await copyLicenseTo("ffprobe", license);

  const notice = process.env.FFMPEG_MACOS_NOTICES_FILE?.trim()
    ? path.resolve(process.env.FFMPEG_MACOS_NOTICES_FILE)
    : await findAny(extractDirs(items), ["README.txt", "README.md", "README", "RELEASE_NOTES", "NOTICE"]);
  const noticeText = [
    "FFmpeg/ffprobe macOS universal package",
    ...items.flatMap((item) => [
      `${item.arch} ffmpeg source: ${publicSourceLabel(item.source.url ?? item.source.archivePath)}`,
      `${item.arch} ffprobe source: ${publicSourceLabel(item.ffprobeSource?.url ?? item.ffprobeSource?.archivePath ?? item.source.url ?? item.source.archivePath)}`,
    ]),
    `Expected version: ${expectedVersion}`,
    "",
    "FFmpeg provides source code but does not publish official macOS binaries.",
    "This package must be built by maintainers or sourced from a reviewed provider with matching license and source-code obligations.",
    "",
  ];
  if (notice) {
    noticeText.push(`Additional upstream notice copied from: ${path.basename(notice)}`, "");
  }

  for (const engineId of ["ffmpeg", "ffprobe"]) {
    const target = path.join(platformRoot, engineId, "licenses", "THIRD_PARTY_NOTICES.txt");
    await fs.writeFile(target, noticeText.join("\n"), "utf8");
    if (notice) {
      const content = await fs.readFile(notice, "utf8");
      await fs.appendFile(target, content.endsWith("\n") ? content : `${content}\n`, "utf8");
    }
  }
}

function extractDirs(items) {
  return [...new Set(items.flatMap((item) => [item.extractDir, item.ffprobeExtractDir]))];
}

async function copyLicenseTo(engineId, source) {
  const target = path.join(platformRoot, engineId, "licenses", "LICENSE.txt");
  await fs.copyFile(source, target);
}

async function findAny(dirs, names) {
  const lower = new Set(names.map((name) => name.toLowerCase()));
  const matches = [];
  async function walk(current) {
    for (const entry of await fs.readdir(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(fullPath);
      else if (entry.isFile() && lower.has(entry.name.toLowerCase())) matches.push(fullPath);
    }
  }
  for (const dir of Array.isArray(dirs) ? dirs : [dirs]) {
    await walk(dir);
  }
  return matches[0] ?? null;
}

async function smokeTestVersion(exe, name) {
  const result = spawnSync(exe, ["-version"], {
    cwd: path.dirname(exe),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 30000,
  });
  const text = `${result.stdout}\n${result.stderr}`;
  if (result.status !== 0 || !text.toLowerCase().includes(name)) {
    throw new Error(`${name}: version check failed for ${exe}: ${result.stderr || result.stdout}`);
  }
  if (!text.includes(expectedVersion)) {
    throw new Error(`${name}: expected version ${expectedVersion} was not found in ${exe} -version output.`);
  }
}

async function verifySha256(filePath, expected, label) {
  const actual = await sha256File(filePath);
  if (actual !== expected) {
    throw new Error(`${label}: SHA-256 mismatch. Expected ${expected}, got ${actual}.`);
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
