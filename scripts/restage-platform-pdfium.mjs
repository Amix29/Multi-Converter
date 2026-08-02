import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const args = parseArgs(process.argv.slice(2));
const platform = args.platform;
if (!new Set(["macos-universal", "linux-x64"]).has(platform)
    || !args.baselineDir || !args.replacementDir || !args.outputDir) {
  throw new Error("--platform, --baseline-dir, --replacement-dir et --output-dir sont requis.");
}

const baselineRoot = await locateManifest(path.resolve(args.baselineDir));
const replacementRoot = await locateManifest(path.resolve(args.replacementDir));
const baseline = JSON.parse(await fs.readFile(path.join(baselineRoot, "engines-manifest.json"), "utf8"));
const replacement = JSON.parse(await fs.readFile(path.join(replacementRoot, "engines-manifest.json"), "utf8"));
const platformEntries = baseline.engines.filter((entry) => entry.platform === platform);
const replacementEntries = replacement.engines.filter((entry) => entry.platform === platform);
if (replacementEntries.length !== 1 || replacementEntries[0].id !== "pdfium") {
  throw new Error("Le remplacement doit contenir uniquement PDFium pour la plateforme ciblée.");
}
const oldPdfium = platformEntries.find((entry) => entry.id === "pdfium");
if (!oldPdfium) throw new Error("L’artefact de référence ne contient pas PDFium.");
const required = platform === "macos-universal"
  ? ["ffmpeg", "ffprobe", "pdfium", "libreoffice", "pandoc", "libvips"]
  : ["pdfium", "libreoffice", "pandoc", "libvips"];
if (JSON.stringify(platformEntries.map((entry) => entry.id).sort()) !== JSON.stringify([...required].sort())) {
  throw new Error(`Jeu de moteurs ${platform} inattendu dans la référence.`);
}
await verifyAssets(baselineRoot, platformEntries, false);
await verifyAssets(replacementRoot, replacementEntries, true);

const output = path.resolve(args.outputDir);
await fs.rm(output, { recursive: true, force: true });
await fs.mkdir(output, { recursive: true });
const oldPdfiumName = assetName(oldPdfium.downloadUrl);
for (const entry of await fs.readdir(baselineRoot, { withFileTypes: true })) {
  if (!entry.isFile()) throw new Error(`Entrée de référence non régulière: ${entry.name}`);
  if (entry.name === "engines-manifest.json" || entry.name === oldPdfiumName) continue;
  await fs.copyFile(path.join(baselineRoot, entry.name), path.join(output, entry.name));
}
const newPdfium = replacementEntries[0];
const replacementName = assetName(newPdfium.downloadUrl);
await fs.copyFile(path.join(replacementRoot, replacementName), path.join(output, replacementName));
const mergedPdfium = { ...newPdfium, downloadUrl: replaceAssetName(oldPdfium.downloadUrl, replacementName) };
const merged = {
  ...baseline,
  generatedAt: "2026-08-02T00:00:00.000Z",
  engines: baseline.engines.map((entry) => entry.platform === platform && entry.id === "pdfium" ? mergedPdfium : entry),
};
await fs.writeFile(path.join(output, "engines-manifest.json"), `${JSON.stringify(merged, null, 2)}\n`);
await verifyAssets(output, merged.engines.filter((entry) => entry.platform === platform), false);
console.log(`${platform}: V1.0.6 engine artifact preserved byte-for-byte except locked PDFium 0.3.0.`);

function parseArgs(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === "--platform") parsed.platform = values[++index];
    else if (value === "--baseline-dir") parsed.baselineDir = values[++index];
    else if (value === "--replacement-dir") parsed.replacementDir = values[++index];
    else if (value === "--output-dir") parsed.outputDir = values[++index];
    else throw new Error(`Argument de restaging inconnu: ${value}`);
  }
  return parsed;
}

async function locateManifest(directory) {
  const direct = path.join(directory, "engines-manifest.json");
  if ((await fs.stat(direct).catch(() => null))?.isFile()) return directory;
  const children = await fs.readdir(directory, { withFileTypes: true });
  const candidates = [];
  for (const child of children) {
    if (!child.isDirectory()) continue;
    const nested = path.join(directory, child.name, "engines-manifest.json");
    if ((await fs.stat(nested).catch(() => null))?.isFile()) candidates.push(path.dirname(nested));
  }
  if (candidates.length !== 1) throw new Error(`Manifeste moteur absent ou ambigu dans ${directory}.`);
  return candidates[0];
}

async function verifyAssets(directory, entries, strict) {
  const expected = new Set(["engines-manifest.json"]);
  for (const entry of entries) {
    const name = assetName(entry.downloadUrl);
    expected.add(name);
    const filePath = path.join(directory, name);
    const stat = await fs.lstat(filePath).catch(() => null);
    if (!stat?.isFile() || stat.isSymbolicLink() || stat.size !== entry.compressedSizeBytes) {
      throw new Error(`${entry.id}: archive absente, liée ou de taille différente.`);
    }
    if (await sha256(filePath) !== entry.sha256) throw new Error(`${entry.id}: SHA-256 différent du manifeste.`);
  }
  const actual = (await fs.readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isFile()).map((entry) => entry.name);
  const unexpected = actual.filter((name) => !expected.has(name));
  if (strict && unexpected.length) throw new Error(`Artefacts moteurs inattendus: ${unexpected.join(", ")}`);
}

function assetName(url) {
  const value = path.posix.basename(new URL(url).pathname);
  if (!value || value.includes("\\") || value === "." || value === "..") throw new Error(`Nom d’archive dangereux: ${url}`);
  return decodeURIComponent(value);
}

function replaceAssetName(url, name) {
  const parsed = new URL(url);
  parsed.pathname = `${parsed.pathname.slice(0, parsed.pathname.lastIndexOf("/") + 1)}${encodeURIComponent(name)}`;
  return parsed.toString();
}

async function sha256(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}
