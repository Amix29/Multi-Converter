import fs from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import process from "node:process";

const root = process.cwd();
const downloads = path.join(root, "engine-sources", ".downloads");
const extracts = path.join(root, "engine-sources", ".extracts");
const upstreamConfigPath = path.join(root, "tools", "engine-upstreams.config.json");
const upstreamConfig = await readJson(upstreamConfigPath);
const baseEngines = upstreamConfig.baseEngines ?? {};

await fs.mkdir(downloads, { recursive: true });
await fs.mkdir(extracts, { recursive: true });

const ffmpegSource = requirePinnedSource(baseEngines.ffmpeg, "ffmpeg");
const ffmpegZip = path.join(downloads, ffmpegSource.archiveName);
await downloadVerified(ffmpegSource.url, ffmpegZip, ffmpegSource.sha256, ffmpegSource.sourceName);

await cleanEngineSources(["ffmpeg", "ffprobe"]);
await extractArchive(ffmpegZip, path.join(extracts, "ffmpeg"));

const ffmpegBin = await findFile(path.join(extracts, "ffmpeg"), "ffmpeg.exe");
const ffprobeBin = await findFile(path.join(extracts, "ffmpeg"), "ffprobe.exe");
const ffmpegLicense = await findAny(path.dirname(path.dirname(ffmpegBin)), ["LICENSE.txt", "LICENSE"]);
const ffmpegReadme = await findAny(path.dirname(path.dirname(ffmpegBin)), ["README.txt", "README.md", "README"]);

await stageEngine("ffmpeg", [
  [ffmpegBin, "bin/ffmpeg-x86_64-pc-windows-msvc.exe"],
  [ffmpegLicense, "licenses/LICENSE.txt"],
  [ffmpegReadme, "licenses/THIRD_PARTY_NOTICES.txt"],
]);
await stageEngine("ffprobe", [
  [ffprobeBin, "bin/ffprobe-x86_64-pc-windows-msvc.exe"],
  [ffmpegLicense, "licenses/LICENSE.txt"],
  [ffmpegReadme, "licenses/THIRD_PARTY_NOTICES.txt"],
]);

console.log(`Base engines ready from ${ffmpegSource.sourceName}.`);

function requirePinnedSource(source, id) {
  if (!source || typeof source !== "object") {
    throw new Error(`${id}: source amont absente de ${path.relative(root, upstreamConfigPath)}.`);
  }
  if (!/^[a-f0-9]{64}$/i.test(source.sha256 ?? "")) {
    throw new Error(`${id}: SHA-256 attendu absent ou invalide dans ${path.relative(root, upstreamConfigPath)}.`);
  }
  return source;
}

async function downloadVerified(url, target, expectedSha256, label) {
  try {
    const stat = await fs.stat(target);
    if (stat.size > 0) {
      await verifySha256(target, expectedSha256, label);
      return;
    }
  } catch {
    // Download below.
  }
  console.log(`Downloading ${url}`);
  const response = await fetch(url, { headers: { "User-Agent": "Multi-Converter-Packager" } });
  if (!response.ok || !response.body) {
    throw new Error(`Telechargement impossible (${response.status}) : ${url}`);
  }
  await pipeline(response.body, createWriteStream(target));
  await verifySha256(target, expectedSha256, label);
}

async function verifySha256(filePath, expected, label) {
  const actual = await sha256File(filePath);
  if (actual !== expected.toLowerCase()) {
    throw new Error(`${label}: SHA-256 inattendu pour ${path.relative(root, filePath)}. Attendu ${expected}, obtenu ${actual}.`);
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

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function extractArchive(archive, destination) {
  await fs.rm(destination, { recursive: true, force: true });
  await fs.mkdir(destination, { recursive: true });
  const command = `Expand-Archive -LiteralPath '${archive.replaceAll("'", "''")}' -DestinationPath '${destination.replaceAll("'", "''")}' -Force`;
  const { spawnSync } = await import("node:child_process");
  const result = spawnSync("powershell", ["-NoProfile", "-Command", command], { stdio: "inherit" });
  if (result.status !== 0) throw new Error(`Extraction impossible : ${archive}`);
}

async function cleanEngineSources(ids) {
  for (const id of ids) {
    await fs.rm(path.join(root, "engine-sources", "windows-x64", id), { recursive: true, force: true });
  }
}

async function stageEngine(engineId, files) {
  const base = path.join(root, "engine-sources", "windows-x64", engineId);
  for (const [source, relative] of files) {
    const target = path.join(base, relative);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.copyFile(source, target);
  }
}

async function findFile(base, name) {
  const matches = await findFiles(base, (entry) => entry.name.toLowerCase() === name.toLowerCase());
  if (!matches[0]) throw new Error(`Fichier introuvable : ${name}`);
  return matches[0];
}

async function findAny(base, names) {
  const lower = new Set(names.map((name) => name.toLowerCase()));
  const matches = await findFiles(base, (entry) => lower.has(entry.name.toLowerCase()));
  if (!matches[0]) throw new Error(`Aucun fichier trouve parmi : ${names.join(", ")}`);
  return matches[0];
}

async function findFiles(base, predicate) {
  const results = [];
  async function walk(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile() && predicate(entry, full)) results.push(full);
    }
  }
  await walk(base);
  return results;
}
