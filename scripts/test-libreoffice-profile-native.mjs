import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { crc32 } from "node:zlib";
import { createHash } from "node:crypto";
import { inspectFilterableZip } from "./lib/filtered-zip.mjs";
import { treeManifest } from "./lib/direct-engine-resources.mjs";

if (process.platform !== "win32" || process.arch !== "x64") throw Error("Real Windows x64 host required");
const root = process.cwd();
const finalProfileSmoke = process.argv.includes("--final-profile-smoke");
const reference = process.env.MULTI_CONVERTER_LO_REFERENCE ?? path.join(root, "src-tauri/bundled-engines/libreoffice/compatible");
const prepared = path.join(root, "src-tauri/bundled-engine-profiles/windows-x64/v3/libreoffice");
const borrowedCandidate = process.env.MULTI_CONVERTER_LO_CANDIDATE ?? ((await fs.stat(prepared).catch(() => null))?.isDirectory() ? prepared : null);
const archive = borrowedCandidate ? null : await inspectFilterableZip("src-tauri/bundled-engine-archives/windows-x64/libreoffice.headless.zip");
const temporary = process.env.MULTI_CONVERTER_LO_TEST_DIR ?? await fs.mkdtemp(path.join(root, "tmp/lo-profile-native-"));
if (!path.resolve(temporary).startsWith(path.join(root, "tmp") + path.sep)) throw Error("Test directory must stay inside repository tmp");
const candidate = borrowedCandidate ?? path.join(temporary, "runtime");
let directProfile;
const render = path.join(root, "src-tauri/bundled-engines/pdfium/compatible/bin/pdfium-render-x86_64-pc-windows-msvc.exe");
const settings = /const SETTINGS: &str = r#"([\s\S]*?)"#;/.exec(await fs.readFile("src-tauri/src/converters/external/libreoffice_profile.rs", "utf8"))?.[1];
if (!settings) throw Error("Production LibreOffice security profile missing");
if (borrowedCandidate) {
  directProfile = JSON.parse(await fs.readFile(path.join(candidate, "../libreoffice-profile.json"), "utf8"));
  const files = [];
  async function collect(directory, prefix = "") {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const relative = prefix + entry.name;
      if (entry.isDirectory()) await collect(path.join(directory, entry.name), relative + "/");
      else if (entry.isFile()) files.push(relative);
      else throw Error("Non-regular direct profile entry");
    }
  }
  await collect(candidate);
  const aggregate = createHash("sha256");
  let bytes = 0;
  for (const relative of files.sort()) {
    const file = path.join(candidate, relative), size = (await fs.stat(file)).size;
    bytes += size;
    aggregate.update(`${relative}\0${size}\0${await fileHash(file)}\n`);
  }
  if (files.length !== directProfile.files || bytes !== directProfile.bytes || aggregate.digest("hex") !== directProfile.aggregateSha256) throw Error("Direct profile integrity differs from preparation receipt");
  console.log(`Verified direct profile: ${files.length} files, ${bytes} bytes`);
} else for (const entry of archive.entries.filter(entry => !entry.name.endsWith("/"))) {
  const source = path.join(reference, entry.name);
  let actual = 0;
  for await (const chunk of createReadStream(source)) actual = crc32(chunk, actual);
  if (actual !== entry.record.readUInt32LE(16)) throw Error(`Reference differs from archive: ${entry.name}`);
  const destination = path.join(candidate, entry.name);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  try { await fs.link(source, destination); } catch (error) {
    if (error.code !== "EEXIST" || (await fs.stat(source)).ino !== (await fs.stat(destination)).ino) throw error;
  }
}
if (!borrowedCandidate) console.log(`Linked and CRC-verified ${archive.entries.length} retained files; no runtime bytes copied`);
await fs.writeFile(path.join(temporary, "fixture.html"), `<!doctype html><html lang="fr"><meta charset="utf-8">
<style>@page{size:A4;margin:18mm}body{font:11pt "Liberation Serif"}table{border-collapse:collapse;width:100%}td,th{border:1px solid #222;padding:5px}.next{page-break-before:always}p{hyphens:auto}</style>
<h1>Multi-Converter — fidélité de conversion</h1><p>façade déjà été : € 1 234,56. Français, Español, Português, Deutsch, Italiano.</p>
<table><tr><th>Produit</th><th>Montant</th></tr><tr><td>Électricité</td><td>125,80 €</td></tr><tr><td>Crème brûlée</td><td>9,50 €</td></tr></table>
<p style="font-size:7pt">Petits caractères : œ æ ç é è ê ë À Ö ß — préservation des accents et du contenu.</p>
<p lang="ar" dir="rtl">مرحبا بالعالم</p><p lang="zh">中文文本</p>
<div class="next"><h2>Deuxième page</h2><p>Longue ligne avec internationalisation, constitutionnellement et responsabilités.</p>
<ol><li>Source originale conservée</li><li>Conversion locale</li></ol><p><b>Gras</b> <i>italique</i> <u>souligné</u>.</p>
${"<p>Vérification de pagination, tableaux et caractères accentués : façade déjà été.</p>".repeat(65)}</div></html>`);
const fixture = path.join(temporary, "fixture.docx");
run(path.join(root, "src-tauri/bundled-engines/pandoc/compatible/bin/pandoc.exe"), ["--sandbox", path.join(temporary, "fixture.html"), "-o", fixture]);
const results = [];
for (const format of finalProfileSmoke ? ["pdf"] : ["pdf", "docx", "doc", "odt", "rtf", "html", "txt"]) {
  const pair = [];
  for (const [label, runtime] of [["reference", reference], ["candidate", candidate]]) {
    const output = await convert(runtime, fixture, format, path.join(temporary, `${format}-${label}`), label);
    if (format === "txt") {
      pair.push({ textSha256: hash(await fs.readFile(output)) });
    } else {
      const pdf = format === "pdf" ? output : await convert(reference, output, "pdf", path.join(temporary, `${format}-${label}-pdf`), `inspect-${label}`);
      const textFile = `${pdf}.text.json`;
      run(render, ["--inspect-text", pdf, textFile]);
      const inspection = JSON.parse(await fs.readFile(textFile, "utf8"));
      const images = `${pdf}.pages`;
      run(render, ["--render-all", pdf, images, "--format", "png", "--dpi", "200"]);
      const pixels = [];
      for (const file of (await fs.readdir(images)).sort()) pixels.push(hash(await fs.readFile(path.join(images, file))));
      pair.push({ pageCount: inspection.pageCount, textSha256: hash(JSON.stringify(inspection)), pageRasterSha256: pixels });
    }
  }
  if (JSON.stringify(pair[0]) !== JSON.stringify(pair[1])) throw Error(`LibreOffice ${format}: text/page/raster parity failed`);
  results.push({ format, parity: "exact", ...pair[0] });
  console.log(`LibreOffice ${format}: exact text/page/raster parity`);
}
if (borrowedCandidate) {
  const after = await treeManifest(candidate);
  if (after.aggregateSha256 !== directProfile.aggregateSha256 || after.files !== directProfile.files || after.bytes !== directProfile.bytes) throw Error("Native Office test changed the prepared resource tree");
}
const receipt = {
  date: new Date().toISOString(), platform: "windows-x64", profileId: directProfile?.profileId ?? "windows-headless-v1",
  referenceSource: borrowedCandidate ? "Original LibreOffice tree from the pinned source ZIP" : "Existing original LibreOffice tree; every retained file CRC matched to the pinned source archive",
  candidate: borrowedCandidate ? "SHA256-verified direct view; unchanged conversion binaries/data plus approved configuration overlays" : "hardlink view of all retained files; no full tree copied or extracted",
  profileDigest: directProfile?.aggregateSha256 ?? await fileHash("src-tauri/bundled-engine-archives/windows-x64/libreoffice.headless.zip"),
  sourceRetainedFilesVerified: directProfile?.files ?? archive.entries.length, sourceDocumentSha256: hash(await fs.readFile(fixture)),
  results, rasterDpi: 200, ocr: "Unchanged five models and runtime; not rerun by this Office-only gate",
  limitations: "Direct native engine comparison on controlled multipage fixture; not installed application acceptance or exhaustive real-world layout proof",
};
await fs.mkdir("docs/audits/2026-11-07/engine-reduction", { recursive: true });
const defaultReport = directProfile?.profileId === "windows-conversion-direct-v3"
  ? "docs/audits/2026-11-07/engine-lot3/libreoffice-native.json"
  : `docs/audits/2026-11-07/engine-reduction/libreoffice-${directProfile ? "v2-native" : finalProfileSmoke ? "final-profile-smoke" : "native"}.json`;
const reportPath = process.env.MULTI_CONVERTER_LO_REPORT ?? defaultReport;
await fs.mkdir(path.dirname(reportPath), { recursive: true });
await fs.writeFile(reportPath, JSON.stringify(receipt, null, 2) + "\n");
console.log("LibreOffice profile native gate passed");

function run(binary, args) {
  const result = spawnSync(binary, args, { env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" }, encoding: "utf8", windowsHide: true, timeout: 120000, maxBuffer: 8 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw Error(`Native engine failed: ${result.error?.message ?? result.stderr}`);
  return result.stdout;
}

async function convert(runtime, input, format, destination, label) {
  const profile = path.join(temporary, "profiles", label);
  await fs.mkdir(path.join(profile, "user"), { recursive: true });
  await fs.writeFile(path.join(profile, "user/registrymodifications.xcu"), settings);
  await fs.mkdir(destination, { recursive: true });
  const target = format === "txt" ? "txt:Text" : format === "html" ? "html:XHTML Writer File" : format;
  run(path.join(runtime, "program/soffice.com"), ["--headless", "--invisible", "--nologo", "--nodefault", "--nolockcheck", "--norestore", "--nofirststartwizard", `-env:UserInstallation=${pathToFileURL(profile).href}`, "--convert-to", target, "--outdir", destination, input]);
  const file = path.join(destination, `${path.basename(input, path.extname(input))}.${format}`);
  if (!(await fs.stat(file)).size) throw Error(`Empty ${format} output`);
  return file;
}

function hash(value) { return createHash("sha256").update(value).digest("hex"); }

async function fileHash(file) {
  const digest = createHash("sha256");
  for await (const chunk of createReadStream(file)) digest.update(chunk);
  return digest.digest("hex");
}
