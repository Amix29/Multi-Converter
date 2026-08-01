import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const args = parseArgs(process.argv.slice(2));
const lock = JSON.parse(await fs.readFile(path.join(root, "src-tauri", "ocr-runtime-lock.json"), "utf8"));
const cacheDir = path.resolve(args.cacheDir ?? path.join(os.tmpdir(), "multi-converter-ocr-model-lock"));
const outputDir = path.resolve(args.outputDir ?? path.join(root, "src-tauri", "ocr-resources", "models"));
const allowDownload = args.allowDownload === true;

await fs.mkdir(cacheDir, { recursive: true });
const staging = await fs.mkdtemp(path.join(os.tmpdir(), "multi-converter-ocr-models-"));
try {
  for (const model of lock.models) {
    const archive = path.join(cacheDir, model.file);
    if (!(await isVerified(archive, model.sha256))) {
      if (!allowDownload) {
        throw new Error(`${model.id}: archive absente ou invalide. Fournissez ${archive} ou utilisez --allow-download pendant la préparation mainteneur.`);
      }
      await download(model.url, archive);
      if (!(await isVerified(archive, model.sha256))) throw new Error(`${model.id}: SHA-256 invalide après téléchargement.`);
    }
    const entries = listArchive(archive);
    rejectUnsafeEntries(model.id, entries);
    const extractDir = path.join(staging, model.id);
    await fs.mkdir(extractDir, { recursive: true });
    run("tar", ["-xf", archive, "-C", extractDir], `${model.id}: extraction impossible`);
    const modelRoot = await findModelRoot(extractDir);
    const destination = path.join(outputDir, model.id);
    await fs.rm(destination, { recursive: true, force: true });
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.cp(modelRoot, destination, { recursive: true, force: true });
    await assertModelFiles(destination, model.id);
  }
  const files = await collectFiles(outputDir);
  const entries = [];
  let totalBytes = 0;
  for (const relativePath of files) {
    const filePath = path.join(outputDir, relativePath);
    const stat = await fs.stat(filePath);
    totalBytes += stat.size;
    entries.push({ path: portable(relativePath), bytes: stat.size, sha256: await sha256(filePath) });
  }
  const aggregateSha256 = aggregate(entries);
  await fs.writeFile(
    path.join(outputDir, "models-lock.json"),
    JSON.stringify({
      schemaVersion: 1,
      model: lock.model,
      fileCount: entries.length,
      totalBytes,
      aggregateSha256,
      sources: lock.models.map(({ id, file, url, sha256, license }) => ({ id, file, url, sha256, license })),
      files: entries,
    }, null, 2) + "\n",
  );
  console.log(`OCR models prepared in ${path.relative(root, outputDir)} (${entries.length} files, ${totalBytes} bytes, ${aggregateSha256}).`);
} finally {
  await fs.rm(staging, { recursive: true, force: true });
}

function parseArgs(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === "--allow-download") parsed.allowDownload = true;
    else if (value === "--cache-dir") parsed.cacheDir = values[++index];
    else if (value === "--output-dir") parsed.outputDir = values[++index];
    else throw new Error(`Argument OCR inconnu: ${value}`);
  }
  return parsed;
}

async function isVerified(filePath, expected) {
  const stat = await fs.stat(filePath).catch(() => null);
  return Boolean(stat?.isFile() && (await sha256(filePath)) === expected.toLowerCase());
}

async function sha256(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

async function download(url, target) {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok || !response.body) throw new Error(`Téléchargement OCR impossible (${response.status}) depuis ${url}`);
  const temporary = `${target}.download`;
  const bytes = new Uint8Array(await response.arrayBuffer());
  await fs.writeFile(temporary, bytes);
  await fs.rename(temporary, target);
}

function listArchive(archive) {
  const result = spawnSync("tar", ["-tf", archive], { encoding: "utf8", windowsHide: true });
  if (result.status !== 0) throw new Error(`Archive OCR illisible: ${result.stderr || archive}`);
  return result.stdout.split(/\r?\n/).filter(Boolean);
}

function rejectUnsafeEntries(id, entries) {
  if (!entries.length) throw new Error(`${id}: archive vide.`);
  for (const value of entries) {
    const normalized = value.replaceAll("\\", "/").replace(/^\.\//, "");
    if (normalized.startsWith("/") || /^[A-Za-z]:/.test(normalized) || normalized.split("/").includes("..")) {
      throw new Error(`${id}: entrée d’archive dangereuse.`);
    }
  }
}

function run(command, commandArgs, message) {
  const result = spawnSync(command, commandArgs, { encoding: "utf8", windowsHide: true });
  if (result.status !== 0) throw new Error(`${message}: ${result.stderr || result.stdout}`);
}

async function findModelRoot(directory) {
  const queue = [directory];
  while (queue.length) {
    const current = queue.shift();
    const entries = await fs.readdir(current, { withFileTypes: true });
    if (entries.some((entry) => entry.isFile() && entry.name === "inference.json")) return current;
    for (const entry of entries) if (entry.isDirectory()) queue.push(path.join(current, entry.name));
  }
  throw new Error(`Aucun modèle Paddle valide dans ${directory}.`);
}

async function assertModelFiles(directory, id) {
  for (const name of ["inference.json", "inference.yml", "inference.pdiparams"]) {
    const stat = await fs.stat(path.join(directory, name)).catch(() => null);
    if (!stat?.isFile() || stat.size === 0) throw new Error(`${id}: ${name} absent ou vide.`);
  }
}

async function collectFiles(directory, relative = "") {
  const entries = await fs.readdir(path.join(directory, relative), { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name, "en"))) {
    const child = path.join(relative, entry.name);
    if (entry.isDirectory()) files.push(...(await collectFiles(directory, child)));
    else if (entry.isFile() && entry.name !== "models-lock.json") files.push(child);
    else if (!entry.isFile()) throw new Error(`Les modèles OCR contiennent une entrée non régulière: ${child}`);
  }
  return files;
}

function aggregate(entries) {
  const hash = createHash("sha256");
  for (const entry of entries) hash.update(`${entry.path}\0${entry.bytes}\0${entry.sha256}\n`);
  return hash.digest("hex");
}

function portable(value) {
  return value.split(path.sep).join("/");
}
