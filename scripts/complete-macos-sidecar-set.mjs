import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const args = parseArgs(process.argv.slice(2));
if (!args.assetDir) throw new Error("--asset-dir est requis.");

const assetDir = path.resolve(args.assetDir);
const missingName = "ffprobe-x86_64-apple-darwin";
const sourceName = "ffprobe-universal-apple-darwin";
const missingPath = path.join(assetDir, missingName);
const sourcePath = path.join(assetDir, sourceName);

const existing = await regularFile(missingPath);
if (!existing) {
  const source = await regularFile(sourcePath);
  if (!source) {
    throw new Error(`Sidecars macOS incomplets: ${missingName} et ${sourceName} sont absents ou non réguliers.`);
  }
  await fs.copyFile(sourcePath, missingPath);
  console.log(`${missingName}: restauré depuis le sidecar universel verrouillé.`);
}

const digest = await sha256(missingPath);
await fs.writeFile(path.join(assetDir, `${missingName}.sha256`), `${digest}  ${missingName}\n`);
console.log(`${missingName}: ${digest}`);

function parseArgs(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] === "--asset-dir") parsed.assetDir = values[++index];
    else throw new Error(`Argument de complétion sidecar inconnu: ${values[index]}`);
  }
  return parsed;
}

async function regularFile(filePath) {
  const stat = await fs.lstat(filePath).catch(() => null);
  return Boolean(stat?.isFile() && !stat.isSymbolicLink() && stat.size > 0);
}

async function sha256(filePath) {
  return createHash("sha256").update(await fs.readFile(filePath)).digest("hex");
}
