import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const args = parseArgs(process.argv.slice(2));
const platform = args.platform ?? "windows-x64";
const sourceDir = path.resolve(
  args.sourceDir ?? path.join(root, "engine-sources", "ocr-runtime", platform, "dist", "ocr-worker"),
);
const outputPath = path.resolve(
  args.output ?? path.join(root, "src-tauri", "ocr-runtime-licenses.json"),
);
const supplementalPath = path.join(root, "tools", "ocr-runtime", "supplemental-licenses.json");
const internal = path.join(sourceDir, "_internal");
const lock = JSON.parse(await fs.readFile(path.join(root, "src-tauri", "ocr-runtime-lock.json"), "utf8"));
const selection = lock.platformSelections.find((entry) => entry.platform === platform);
if (!selection?.artifact?.aggregateSha256) {
  throw new Error(`Aucun runtime OCR verrouillé pour ${platform}.`);
}

const runtimeEntries = [];
let runtimeTotalBytes = 0;
for (const relativePath of await collectFiles(sourceDir)) {
  const filePath = path.join(sourceDir, relativePath);
  const stat = await fs.stat(filePath);
  runtimeTotalBytes += stat.size;
  runtimeEntries.push({ path: portable(relativePath), bytes: stat.size, sha256: await sha256(filePath) });
}
const runtimeAggregateSha256 = aggregate(runtimeEntries);
if (
  runtimeEntries.length !== selection.artifact.fileCount
  || runtimeTotalBytes !== selection.artifact.totalBytes
  || runtimeAggregateSha256 !== selection.artifact.aggregateSha256
) {
  throw new Error("Le répertoire source de l’inventaire ne correspond pas au runtime OCR verrouillé.");
}

const distInfoDirectories = (await fs.readdir(internal, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory() && entry.name.endsWith(".dist-info"))
  .map((entry) => entry.name)
  .sort((left, right) => left.localeCompare(right, "en"));
const packages = [];
for (const directory of distInfoDirectories) {
  const packageRoot = path.join(internal, directory);
  const metadataPath = path.join(packageRoot, "METADATA");
  const metadata = parseMetadata(await fs.readFile(metadataPath, "utf8"));
  const licenseFiles = [];
  for (const relativePath of await collectFiles(packageRoot)) {
    if (!isLicenseFile(relativePath)) continue;
    const filePath = path.join(packageRoot, relativePath);
    const stat = await fs.stat(filePath);
    licenseFiles.push({
      path: portable(path.join("_internal", directory, relativePath)),
      bytes: stat.size,
      sha256: await sha256(filePath),
    });
  }
  packages.push({
    name: first(metadata, "Name") ?? directory.replace(/\.dist-info$/i, ""),
    version: first(metadata, "Version") ?? "unknown",
    licenseExpression: usable(first(metadata, "License-Expression")),
    license: usable(first(metadata, "License")),
    licenseClassifiers: all(metadata, "Classifier").filter((value) => value.startsWith("License ::")),
    projectUrls: all(metadata, "Project-URL"),
    licenseFiles,
  });
}

packages.sort((left, right) => left.name.localeCompare(right.name, "en"));
const supplemental = JSON.parse(await fs.readFile(supplementalPath, "utf8"));
const supplementalByPackage = new Map(
  supplemental.packages.map((entry) => [`${entry.name.toLowerCase()}@${entry.version}`, entry]),
);
for (const entry of packages) {
  const supplement = supplementalByPackage.get(`${entry.name.toLowerCase()}@${entry.version}`);
  entry.supplementalLicenseFiles = supplement ? [await supplementalLicense(supplement)] : [];
}
const unresolvedMetadata = packages
  .filter((entry) => !entry.licenseExpression && !entry.license && entry.licenseClassifiers.length === 0)
  .map((entry) => entry.name);
const packagesWithoutEmbeddedLicenseFiles = packages
  .filter((entry) => entry.licenseFiles.length === 0)
  .map((entry) => entry.name);
const packagesWithoutLicenseFiles = packages
  .filter((entry) => entry.licenseFiles.length === 0 && entry.supplementalLicenseFiles.length === 0)
  .map((entry) => entry.name);
const inventory = {
  schemaVersion: 2,
  platform,
  runtimeFileCount: runtimeEntries.length,
  runtimeTotalBytes,
  runtimeAggregateSha256,
  generatedFrom: portable(path.relative(root, sourceDir)),
  packageCount: packages.length,
  packagesWithLicenseFiles: packages.filter(
    (entry) => entry.licenseFiles.length > 0 || entry.supplementalLicenseFiles.length > 0,
  ).length,
  licenseFileCount: packages.reduce(
    (total, entry) => total + entry.licenseFiles.length + entry.supplementalLicenseFiles.length,
    0,
  ),
  packagesWithoutEmbeddedLicenseFiles,
  packagesWithoutLicenseFiles,
  unresolvedMetadata,
  packages,
};
const serialized = `${JSON.stringify(inventory, null, 2)}\n`;

if (args.check) {
  const existing = await fs.readFile(outputPath, "utf8");
  if (existing !== serialized) throw new Error(`L’inventaire OCR n’est plus synchronisé: ${outputPath}`);
  console.log(`OCR runtime license inventory is current: ${packages.length} packages, ${inventory.licenseFileCount} license files.`);
} else {
  await fs.writeFile(outputPath, serialized);
  console.log(`OCR runtime license inventory written: ${packages.length} packages, ${inventory.licenseFileCount} license files, ${packagesWithoutLicenseFiles.length} package(s) without an embedded license file, ${unresolvedMetadata.length} unresolved metadata entries.`);
}

async function supplementalLicense(entry) {
  const filePath = path.join(root, entry.licenseFile);
  const content = (await fs.readFile(filePath, "utf8")).replaceAll("\r\n", "\n");
  const actual = createHash("sha256").update(content).digest("hex");
  if (actual !== entry.licenseSha256) {
    throw new Error(`${entry.name}: empreinte de licence supplémentaire inattendue.`);
  }
  return {
    path: portable(entry.licenseFile),
    bytes: Buffer.byteLength(content),
    sha256: actual,
    source: entry.licenseSource,
  };
}

function parseArgs(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === "--platform") parsed.platform = values[++index];
    else if (value === "--source-dir") parsed.sourceDir = values[++index];
    else if (value === "--output") parsed.output = values[++index];
    else if (value === "--check") parsed.check = true;
    else throw new Error(`Argument d’inventaire OCR inconnu: ${value}`);
  }
  return parsed;
}

function parseMetadata(value) {
  const fields = new Map();
  let current;
  for (const line of value.replaceAll("\r\n", "\n").split("\n")) {
    if (/^[ \t]/.test(line) && current) {
      const values = fields.get(current);
      values[values.length - 1] += `\n${line.trim()}`;
      continue;
    }
    const separator = line.indexOf(":");
    if (separator <= 0) {
      current = undefined;
      continue;
    }
    current = line.slice(0, separator);
    const fieldValue = line.slice(separator + 1).trim();
    fields.set(current, [...(fields.get(current) ?? []), fieldValue]);
  }
  return fields;
}

function first(fields, name) {
  return fields.get(name)?.[0];
}

function all(fields, name) {
  return fields.get(name) ?? [];
}

function usable(value) {
  return value && value.toUpperCase() !== "UNKNOWN" ? value : null;
}

function isLicenseFile(relativePath) {
  const normalized = portable(relativePath);
  const filename = path.posix.basename(normalized);
  return normalized.startsWith("licenses/") || /^(licen[cs]e|copying|notice)(\.|$)/i.test(filename);
}

async function collectFiles(directory, relative = "") {
  const entries = await fs.readdir(path.join(directory, relative), { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name, "en"))) {
    const child = path.join(relative, entry.name);
    if (entry.isDirectory()) files.push(...(await collectFiles(directory, child)));
    else if (entry.isFile()) files.push(child);
  }
  return files;
}

async function sha256(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

function portable(value) {
  return value.split(path.sep).join("/");
}

function aggregate(entries) {
  const hash = createHash("sha256");
  for (const entry of entries) hash.update(`${entry.path}\0${entry.bytes}\0${entry.sha256}\n`);
  return hash.digest("hex");
}
