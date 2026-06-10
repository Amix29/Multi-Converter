import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import path from "node:path";
import process from "node:process";
import { pipeline } from "node:stream/promises";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const platform = "windows-x64";
const manifestPath = path.join(root, "src-tauri", "engines-manifest.json");
const binariesDir = path.join(root, "src-tauri", "binaries");
const bundledEnginesDir = path.join(root, "src-tauri", "bundled-engines");
const cacheDir = path.join(root, "engine-sources", ".bundled-engine-cache");
const baseSidecars = [
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
await fs.mkdir(bundledEnginesDir, { recursive: true });
await fs.mkdir(cacheDir, { recursive: true });

const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
const byId = new Map((manifest.engines ?? []).map((engine) => [engine.id, engine]));

for (const item of baseSidecars) {
  await prepareBaseSidecar(item);
}

for (const engine of bundledAdvancedEngines(manifest)) {
  await prepareBundledEngine(engine);
}

console.log("Bundled conversion engines are ready.");

async function prepareBaseSidecar(item) {
  const target = path.join(binariesDir, item.fileName);
  if (await binaryLooksCurrent(target)) return;

  const local = await firstExisting(item.localCandidates);
  if (local) {
    await fs.copyFile(local, target);
    if (await binaryLooksCurrent(target)) return;
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
    throw new Error(`${item.id}: le binaire prepare ne repond pas avec la version attendue.`);
  }
}

async function prepareBundledEngine(engine) {
  const targetRoot = path.join(bundledEnginesDir, engine.id, engine.version);
  if (await bundledEngineLooksCurrent(targetRoot, engine)) return;

  if (!engine.downloadUrl || !engine.sha256 || isPlaceholderUrl(engine.downloadUrl) || isPlaceholderSha(engine.sha256)) {
    throw new Error(`${engine.id}: archive publiee non configuree dans src-tauri/engines-manifest.json.`);
  }

  const archive = path.join(cacheDir, `${engine.id}-${engine.version}.zip`);
  await downloadVerified(engine.downloadUrl, archive, engine.sha256, engine.id);
  const extractDir = path.join(cacheDir, `${engine.id}-${engine.version}-extract`);
  await extractArchive(archive, extractDir);
  await verifyPackageMetadata(extractDir, engine);
  await verifyExpectedFiles(extractDir, engine);

  await fs.rm(targetRoot, { recursive: true, force: true });
  await fs.mkdir(path.dirname(targetRoot), { recursive: true });
  await fs.cp(extractDir, targetRoot, { recursive: true, force: true });

  if (!(await bundledEngineLooksCurrent(targetRoot, engine))) {
    throw new Error(`${engine.id}: le moteur embarque prepare est incomplet.`);
  }
}

function bundledAdvancedEngines(value) {
  return (value.engines ?? []).filter((engine) => engine.platform === platform && engine.mode === "advanced");
}

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

async function verifyPackageMetadata(rootDir, engine) {
  const metadataPath = path.join(rootDir, "engine.json");
  const metadata = JSON.parse(await fs.readFile(metadataPath, "utf8"));
  const checks = [
    ["engineId", metadata.engineId, engine.id],
    ["displayName", metadata.displayName, engine.displayName],
    ["version", metadata.version, engine.version],
    ["platform", metadata.platform, engine.platform],
    ["healthCheck", metadata.healthCheck, engine.healthCheck],
    ["licenseName", metadata.licenseName, engine.licenseName],
  ];
  for (const [field, actual, expected] of checks) {
    if (actual !== expected) {
      throw new Error(`${engine.id}: engine.json invalide (${field}: ${actual ?? "<absent>"} au lieu de ${expected}).`);
    }
  }
  if (metadata.mode !== engine.mode) {
    metadata.mode = engine.mode;
    await fs.writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
  }
  if (JSON.stringify(metadata.binaryPaths ?? []) !== JSON.stringify(engine.binaryPaths ?? [])) {
    throw new Error(`${engine.id}: engine.json invalide (binaryPaths different).`);
  }
  if (!Array.isArray(metadata.licenseFiles) || metadata.licenseFiles.length === 0) {
    throw new Error(`${engine.id}: engine.json ne declare aucune licence.`);
  }
  for (const relative of metadata.licenseFiles) {
    await assertFile(path.join(rootDir, normalizeArchivePath(relative)), `${engine.id}: licence absente (${relative}).`);
  }
  for (const relative of metadata.noticeFiles ?? []) {
    await assertFile(path.join(rootDir, normalizeArchivePath(relative)), `${engine.id}: notice absente (${relative}).`);
  }
  await normalizeBundledNoticeText(rootDir, metadata);
}

async function verifyExpectedFiles(rootDir, engine) {
  for (const relative of engine.binaryPaths ?? []) {
    await assertFile(path.join(rootDir, normalizeArchivePath(relative)), `${engine.id}: binaire attendu absent (${relative}).`);
  }
}

async function bundledEngineLooksCurrent(rootDir, engine) {
  try {
    const stat = await fs.stat(rootDir);
    if (!stat.isDirectory()) return false;
    await verifyPackageMetadata(rootDir, engine);
    await verifyExpectedFiles(rootDir, engine);
    return true;
  } catch {
    return false;
  }
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

function isPlaceholderUrl(url) {
  return String(url).includes("REPLACE_WITH_RELEASE_BASE_URL");
}

function isPlaceholderSha(value) {
  return !/^[a-f0-9]{64}$/i.test(String(value)) || /^0{64}$/i.test(String(value));
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
