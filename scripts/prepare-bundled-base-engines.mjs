import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import path from "node:path";
import process from "node:process";
import { pipeline } from "node:stream/promises";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const manifestPath = path.join(root, "src-tauri", "engines-manifest.json");
const binariesDir = path.join(root, "src-tauri", "binaries");
const cacheDir = path.join(root, "engine-sources", ".bundled-base-cache");
const expected = [
  {
    id: "ffmpeg",
    fileName: "ffmpeg-x86_64-pc-windows-msvc.exe",
    localCandidates: [
      path.join(process.env.LOCALAPPDATA ?? "", "Multi-Converter", "tool-env", "ffmpeg", "8.1.1", "bin", "ffmpeg-x86_64-pc-windows-msvc.exe"),
      path.join(root, "engine-sources", "windows-x64", "ffmpeg", "bin", "ffmpeg-x86_64-pc-windows-msvc.exe"),
    ],
  },
  {
    id: "ffprobe",
    fileName: "ffprobe-x86_64-pc-windows-msvc.exe",
    localCandidates: [
      path.join(process.env.LOCALAPPDATA ?? "", "Multi-Converter", "tool-env", "ffprobe", "8.1.1", "bin", "ffprobe-x86_64-pc-windows-msvc.exe"),
      path.join(root, "engine-sources", "windows-x64", "ffprobe", "bin", "ffprobe-x86_64-pc-windows-msvc.exe"),
    ],
  },
];

await fs.mkdir(binariesDir, { recursive: true });
await fs.mkdir(cacheDir, { recursive: true });

const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
const byId = new Map((manifest.engines ?? []).map((engine) => [engine.id, engine]));

for (const item of expected) {
  const target = path.join(binariesDir, item.fileName);
  if (await binaryLooksCurrent(target)) continue;

  const local = await firstExisting(item.localCandidates);
  if (local) {
    await fs.copyFile(local, target);
    if (await binaryLooksCurrent(target)) continue;
  }

  const engine = byId.get(item.id) ?? embeddedBaseEngine(item.id);
  if (!engine?.downloadUrl || !engine?.sha256) {
    throw new Error(`${item.id}: source absente du manifeste et fallback interne indisponible.`);
  }
  const archive = path.join(cacheDir, `${item.id}.zip`);
  await downloadVerified(engine.downloadUrl, archive, engine.sha256, item.id);
  const extractDir = path.join(cacheDir, `${item.id}-extract`);
  await extractArchive(archive, extractDir);
  const source = await findFile(extractDir, item.fileName);
  await fs.copyFile(source, target);
  if (!(await binaryLooksCurrent(target))) {
    throw new Error(`${item.id}: le binaire préparé ne répond pas avec la version attendue.`);
  }
}

console.log("Bundled base engines are ready.");

function embeddedBaseEngine(id) {
  const release = "https://github.com/Amix29/Multi-Converter/releases/download/engines-v0.1.0-alpha.0";
  const fallback = {
    ffmpeg: {
      downloadUrl: `${release}/ffmpeg-8.1.1-windows-x64.zip`,
      sha256: "665f9b32924c3250138503d09df75c280be803a0fc3d8ae8fb2d9c972a061133",
    },
    ffprobe: {
      downloadUrl: `${release}/ffprobe-8.1.1-windows-x64.zip`,
      sha256: "b8faf8c447a10b142dd8124852424094b5c6686cc97a4a297d4440660ca9cd64",
    },
  };
  return fallback[id];
}

async function firstExisting(candidates) {
  for (const candidate of candidates.filter(Boolean)) {
    try {
      const stat = await fs.stat(candidate);
      if (stat.isFile() && stat.size > 0) return candidate;
    } catch {
      // Try next candidate.
    }
  }
  return null;
}

async function binaryLooksCurrent(filePath) {
  try {
    const stat = await fs.stat(filePath);
    if (!stat.isFile() || stat.size <= 0) return false;
  } catch {
    return false;
  }
  const result = spawnSync(filePath, ["-version"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
    timeout: 30000,
  });
  const text = `${result.stdout || result.stderr}`;
  return result.status === 0 && text.includes("8.1.1");
}

async function downloadVerified(url, target, expectedSha256, label) {
  try {
    await verifySha256(target, expectedSha256);
    return;
  } catch {
    // Download below.
  }
  console.log(`Downloading ${label}: ${url}`);
  const response = await fetch(url, { headers: { "User-Agent": "Multi-Converter-Packager" } });
  if (!response.ok || !response.body) {
    throw new Error(`${label}: téléchargement impossible (${response.status})`);
  }
  await pipeline(response.body, createWriteStream(target));
  await verifySha256(target, expectedSha256);
}

async function verifySha256(filePath, expected) {
  const actual = await sha256File(filePath);
  if (actual !== expected.toLowerCase()) {
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

async function extractArchive(archive, destination) {
  await fs.rm(destination, { recursive: true, force: true });
  await fs.mkdir(destination, { recursive: true });
  const command = `Expand-Archive -LiteralPath '${archive.replaceAll("'", "''")}' -DestinationPath '${destination.replaceAll("'", "''")}' -Force`;
  const result = spawnSync("powershell", ["-NoProfile", "-Command", command], { stdio: "inherit", windowsHide: true });
  if (result.status !== 0) throw new Error(`Extraction impossible : ${archive}`);
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
