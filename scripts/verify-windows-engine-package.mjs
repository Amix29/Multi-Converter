import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileHash } from "./lib/direct-engine-resources.mjs";

// Decode the exact installer into a hash consumer, never an installed tree.
const argument = name => process.argv[process.argv.indexOf(name) + 1];
if (!process.argv.includes("--installer")) throw Error("Usage: --installer <setup.exe> [--report <json>]");
const installer = path.resolve(argument("--installer"));
const sevenZip = process.env.MULTI_CONVERTER_7ZIP ?? path.join(process.env.ProgramFiles ?? "C:/Program Files", "7-Zip/7z.exe");
const profile = JSON.parse(await fs.readFile("tools/engine-profiles/windows-libreoffice-v2.json", "utf8"));
const lock = JSON.parse(await fs.readFile("src-tauri/ocr-runtime-lock.json", "utf8"));
const selected = lock.platformSelections.find(item => item.platform === "windows-x64");
const officePrefix = "engines/libreoffice/compatible/";
const expected = new Map();
const direct = "src-tauri/bundled-engine-profiles/windows-x64/current";

for (const [folder, prefix, manifestName, artifact] of [
  [`${direct}/ocr/models`, "ocr/models/", "models-lock.json", lock.modelArtifact],
  [`${direct}/ocr/runtime/windows-x64`, "ocr/runtime/windows-x64/", "runtime-manifest.json", selected.artifact],
]) {
  const manifest = JSON.parse(await fs.readFile(path.join(folder, manifestName), "utf8"));
  const hash = createHash("sha256");
  for (const entry of manifest.files) {
    hash.update(`${entry.path}\0${entry.bytes}\0${entry.sha256}\n`);
    expected.set(prefix + entry.path, { bytes: entry.bytes, sha256: entry.sha256 });
  }
  if (manifest.files.length !== artifact.fileCount || hash.digest("hex") !== artifact.aggregateSha256) throw Error("Manifest differs from embedded OCR lock");
  await addFile(path.join(folder, manifestName), prefix + manifestName);
}
for (const engine of ["pdfium", "pandoc", "libvips"]) await addTree(`src-tauri/bundled-engines/${engine}`, `engines/${engine}/`);
await addTree("src-tauri/ocr-resources/licenses", "ocr/licenses/");
await addFile("src-tauri/ocr-resources/README.md", "ocr/README.md");
await addFile("LICENSE", "licenses/LICENSE.txt");
await addFile("NOTICE", "licenses/NOTICE.txt");
for (const tool of ["ffmpeg", "ffprobe"]) await addFile(`src-tauri/binaries/${tool}-x86_64-pc-windows-msvc.exe`, `${tool}.exe`);
await addFile(path.join(path.dirname(installer), "../../multi-converter.exe"), "multi-converter.exe");

const listing = execFileSync(sevenZip, ["l", "-slt", installer], { encoding: "utf8", windowsHide: true, maxBuffer: 32 * 1024 * 1024 });
if (!/Method = LZMA:27/.test(listing) || !/Solid = \+/.test(listing)) throw Error("Expected solid LZMA with 128 MiB dictionary");
const entries = listing.split(/\r?\n----------\r?\n/)[1]?.split(/\r?\n\r?\n/).filter(Boolean).map(block => {
  const fields = Object.fromEntries(block.split(/\r?\n/).filter(line => line.includes(" = ")).map(line => {
    const index = line.indexOf(" = "); return [line.slice(0, index), line.slice(index + 3)];
  }));
  return { name: fields.Path?.replaceAll("\\", "/"), bytes: fields.Size ? Number(fields.Size) : null };
}) ?? [];
if (entries.some(item => item.name === "ocr/runtime/windows-x64.zip" || item.name?.startsWith("engine-archives/"))) throw Error("Nested engine ZIP unexpectedly shipped");
if (entries.some(item => /^(engines|ocr|licenses)\//.test(item.name) && !expected.has(item.name) && !item.name.startsWith(officePrefix))) throw Error("Unexpected packaged engine/OCR resource");
const resources = entries.filter(item => expected.has(item.name) || item.name?.startsWith(officePrefix));
if (resources.filter(item => item.name.startsWith(officePrefix)).length !== profile.expectedLibreOffice.files) throw Error("Incorrect Office membership");
for (const name of expected.keys()) if (!resources.some(item => item.name === name)) throw Error(`Missing packaged file: ${name}`);
for (const entry of resources) {
  entry.bytes ??= expected.get(entry.name)?.bytes;
  if (!Number.isSafeInteger(entry.bytes) || entry.bytes < 0) throw Error(`Unknown resource size: ${entry.name}`);
  if (expected.has(entry.name) && entry.bytes !== expected.get(entry.name).bytes) throw Error(`Incorrect resource size: ${entry.name}`);
}

const listFile = path.join(os.tmpdir(), `mc-setup-hash-${process.pid}.txt`);
await fs.writeFile(listFile, resources.map(item => item.name.replaceAll("/", "\\")).join("\n"), "utf8");
const office = [];
let index = 0, consumed = 0, total = 0, hash = createHash("sha256");
try {
  const child = spawn(sevenZip, ["x", "-so", "-bd", "-y", "-scsUTF-8", installer, `@${listFile}`], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  let errors = "";
  child.stderr.on("data", block => { errors = (errors + block).slice(-4000); });
  const completion = new Promise((resolve, reject) => { child.on("error", reject); child.on("close", code => code === 0 ? resolve() : reject(Error(`7-Zip decode failed (${code}): ${errors}`))); });
  completion.catch(() => {});
  try {
    finishEmpty();
    for await (const block of child.stdout) {
      let cursor = 0;
      while (cursor < block.length) {
        const entry = resources[index];
        if (!entry) throw Error("Installer decoder returned unexpected bytes");
        const take = Math.min(entry.bytes - consumed, block.length - cursor);
        hash.update(block.subarray(cursor, cursor + take));
        consumed += take; cursor += take; total += take;
        if (consumed === entry.bytes) { finish(); finishEmpty(); }
      }
    }
    await completion;
    if (index !== resources.length) throw Error("Installer decode truncated");
  } catch (error) { child.kill(); await completion.catch(() => {}); throw error; }
} finally { await fs.unlink(listFile); }

const aggregate = createHash("sha256");
for (const entry of office.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0)) aggregate.update(`${entry.path}\0${entry.bytes}\0${entry.sha256}\n`);
if (aggregate.digest("hex") !== profile.expectedLibreOffice.aggregateSha256) throw Error("Packaged Office bytes differ from approved profile");
const report = { date: new Date().toISOString(), installerBytes: (await fs.stat(installer)).size,
  installerSha256: await fileHash(installer), verifiedResourceFiles: index, verifiedResourceBytes: total,
  compression: "solid LZMA, 128 MiB dictionary", office: profile.expectedLibreOffice,
  ocr: { runtime: selected.artifact, models: lock.modelArtifact },
  validation: "Every application/engine/OCR/model/notice file decoded into SHA-256 consumers and matched to source hashes or pinned aggregate; no engine tree extracted",
  limits: "Does not install or launch the graphical application; updater signature verified separately" };
if (process.argv.includes("--report")) await fs.writeFile(argument("--report"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));

async function addFile(source, target) { expected.set(target, { bytes: (await fs.stat(source)).size, sha256: await fileHash(source) }); }
async function addTree(folder, prefix) {
  for (const entry of await fs.readdir(folder, { withFileTypes: true })) {
    if (entry.isDirectory()) await addTree(path.join(folder, entry.name), prefix + entry.name + "/");
    else if (entry.isFile()) await addFile(path.join(folder, entry.name), prefix + entry.name);
    else throw Error("Non-regular engine entry");
  }
}
function finishEmpty() { while (resources[index]?.bytes === 0) finish(); }
function finish() {
  const entry = resources[index], digest = hash.digest("hex");
  if (expected.has(entry.name) && expected.get(entry.name).sha256 !== digest) throw Error(`Packaged content mismatch: ${entry.name}`);
  if (entry.name.startsWith(officePrefix)) office.push({ path: entry.name.slice(officePrefix.length), bytes: entry.bytes, sha256: digest });
  index++; consumed = 0; hash = createHash("sha256");
}
