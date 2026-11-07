import fs from "node:fs/promises";
import { createReadStream, createWriteStream } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { pipeline } from "node:stream/promises";
import { zipEntryStream } from "./filtered-zip.mjs";

export async function fileHash(file) {
  const hash = createHash("sha256");
  for await (const block of createReadStream(file)) hash.update(block);
  return hash.digest("hex");
}

export function safeResourcePath(relative) {
  if (!relative || relative.includes("\\") || relative.includes(":" ) || relative.includes("\0")
    || relative.split("/").some(part => !part || part === "." || part === "..")) throw Error("Unsafe resource path");
  return relative;
}

export async function treeManifest(root) {
  const files = [];
  async function walk(directory, prefix = "") {
    for (const item of await fs.readdir(directory, { withFileTypes: true })) {
      const relative = prefix + item.name;
      if (item.isDirectory()) await walk(path.join(directory, item.name), relative + "/");
      else if (item.isFile()) files.push(relative);
      else throw Error(`Non-regular resource: ${relative}`);
    }
  }
  await walk(root);
  const aggregate = createHash("sha256");
  let bytes = 0;
  for (const relative of files.sort()) {
    const file = path.join(root, safeResourcePath(relative));
    const size = (await fs.stat(file)).size;
    bytes += size;
    aggregate.update(`${relative}\0${size}\0${await fileHash(file)}\n`);
  }
  return { files: files.length, bytes, aggregateSha256: aggregate.digest("hex") };
}

export async function verifyContent(root, manifestName, expected) {
  const manifest = JSON.parse(await fs.readFile(path.join(root, manifestName), "utf8"));
  for (const key of ["fileCount", "totalBytes", "aggregateSha256"]) {
    if (manifest[key] !== expected[key]) throw Error("Resource manifest metadata differs from embedded lock");
  }
  const hash = createHash("sha256");
  const names = new Set([manifestName]);
  let bytes = 0;
  for (const entry of manifest.files) {
    safeResourcePath(entry.path);
    if (names.has(entry.path.toLowerCase())) throw Error("Duplicate resource");
    names.add(entry.path.toLowerCase());
    hash.update(`${entry.path}\0${entry.bytes}\0${entry.sha256}\n`);
    bytes += entry.bytes;
    const file = path.join(root, entry.path);
    if ((await fs.stat(file)).size !== entry.bytes || await fileHash(file) !== entry.sha256) throw Error(`Modified resource: ${entry.path}`);
  }
  if (manifest.files.length !== expected.fileCount || bytes !== expected.totalBytes
    || hash.digest("hex") !== expected.aggregateSha256) throw Error("Resource manifest differs from embedded lock");
  if ((await treeFileNames(root)).length !== names.size) throw Error("Unexpected resource files");
  return manifest;
}

async function treeFileNames(root) {
  const result = [];
  for (const item of await fs.readdir(root, { withFileTypes: true })) {
    if (item.isDirectory()) result.push(...await treeFileNames(path.join(root, item.name)));
    else if (item.isFile()) result.push(item.name);
    else throw Error("Non-regular resource");
  }
  return result;
}

// Existing verified files are linked, never copied. Fresh hosts decode once into
// the final staging tree. The caller verifies the complete resulting manifest.
export async function stageEntry(archive, entry, target, references = []) {
  safeResourcePath(entry.name);
  await fs.mkdir(path.dirname(target), { recursive: true });
  for (const reference of references) {
    const source = path.join(reference, entry.name);
    try {
      if ((await fs.stat(source)).size !== entry.bytes) continue;
      await fs.link(source, target);
      return;
    } catch (error) {
      if (!["ENOENT", "EXDEV", "EPERM"].includes(error.code)) throw error;
    }
  }
  await pipeline(zipEntryStream(archive, entry), createWriteStream(target, { flags: "wx" }));
}
