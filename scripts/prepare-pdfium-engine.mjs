import fs from "node:fs/promises";
import { createWriteStream } from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { spawnSync } from "node:child_process";
import process from "node:process";

const root = process.cwd();
const downloads = path.join(root, "engine-sources", ".downloads");
const extracts = path.join(root, "engine-sources", ".extracts");
const sourceDir = path.join(root, "engine-sources", "windows-x64", "pdfium");
const wrapperSource = path.join(root, "tools", "pdfium-render-wrapper");
const wrapperBuild = path.join(process.env.TEMP ?? extracts, "multi-converter-pdfium-render-build");
const userAgent = { "User-Agent": "Multi-Converter-Packager" };

await fs.mkdir(downloads, { recursive: true });
await fs.mkdir(extracts, { recursive: true });

const release = await getJson("https://api.github.com/repos/bblanchon/pdfium-binaries/releases/latest");
const asset = release.assets.find((item) => item.name === "pdfium-win-x64.tgz");
if (!asset) {
  throw new Error("Aucun paquet pdfium-win-x64.tgz trouve dans la derniere release bblanchon/pdfium-binaries.");
}

const archive = path.join(downloads, asset.name);
await downloadIfMissing(asset.browser_download_url, archive);

const extractDir = path.join(extracts, "pdfium");
await extractTgz(archive, extractDir);

const dll = path.join(extractDir, "bin", "pdfium.dll");
await assertFile(dll, "pdfium.dll absent du paquet PDFium.");

await fs.rm(wrapperBuild, { recursive: true, force: true });
await fs.cp(wrapperSource, wrapperBuild, { recursive: true, force: true });
const lock = spawnSync("cargo", ["generate-lockfile", "--manifest-path", path.join(wrapperBuild, "Cargo.toml")], {
  cwd: root,
  stdio: "inherit",
});
if (lock.status !== 0) process.exit(lock.status ?? 1);
const build = spawnSync("cargo", ["build", "--manifest-path", path.join(wrapperBuild, "Cargo.toml"), "--release", "--locked"], {
  cwd: root,
  stdio: "inherit",
});
if (build.status !== 0) process.exit(build.status ?? 1);

await fs.rm(sourceDir, { recursive: true, force: true });
await fs.mkdir(path.join(sourceDir, "bin"), { recursive: true });
await fs.mkdir(path.join(sourceDir, "licenses"), { recursive: true });
await fs.copyFile(dll, path.join(sourceDir, "bin", "pdfium.dll"));
await fs.copyFile(
  path.join(wrapperBuild, "target", "release", "pdfium-render.exe"),
  path.join(sourceDir, "bin", "pdfium-render-x86_64-pc-windows-msvc.exe"),
);

await copyIfExists(path.join(extractDir, "LICENSE"), path.join(sourceDir, "licenses", "LICENSE.txt"));
await fs.cp(path.join(extractDir, "licenses"), path.join(sourceDir, "licenses", "pdfium-third-party"), {
  recursive: true,
  force: true,
});
await fs.writeFile(
  path.join(sourceDir, "licenses", "THIRD_PARTY_NOTICES.txt"),
  [
    "PDFium Windows x64 package",
    `Source: ${asset.browser_download_url}`,
    `Release: ${release.name ?? release.tag_name}`,
    "",
    "PDFium is distributed by bblanchon/pdfium-binaries from Chromium PDFium sources.",
    "The extracted package includes third-party notices under licenses/pdfium-third-party/.",
    "",
    "Wrapper: Multi-Converter pdfium-render, built with the Rust pdfium-render crate.",
    "Wrapper license: Apache-2.0 for Multi-Converter code; pdfium-render crate is MIT OR Apache-2.0.",
    "",
  ].join("\n"),
  "utf8",
);

console.log(`PDFium ready from ${release.name ?? release.tag_name}.`);

async function downloadIfMissing(url, target) {
  try {
    const stat = await fs.stat(target);
    if (stat.size > 0) return;
  } catch {
    // Download below.
  }
  console.log(`Downloading ${url}`);
  const response = await fetch(url, { headers: userAgent });
  if (!response.ok || !response.body) {
    throw new Error(`Telechargement impossible (${response.status}) : ${url}`);
  }
  await pipeline(response.body, createWriteStream(target));
}

async function getJson(url) {
  const response = await fetch(url, { headers: userAgent });
  if (!response.ok) throw new Error(`Requete impossible (${response.status}) : ${url}`);
  return response.json();
}

async function extractTgz(archivePath, destination) {
  await fs.rm(destination, { recursive: true, force: true });
  await fs.mkdir(destination, { recursive: true });
  const result = spawnSync("tar", ["-xzf", archivePath, "-C", destination], { stdio: "inherit" });
  if (result.status !== 0) throw new Error(`Extraction PDFium impossible : ${archivePath}`);
}

async function assertFile(filePath, message) {
  const stat = await fs.stat(filePath).catch(() => null);
  if (!stat?.isFile()) throw new Error(message);
}

async function copyIfExists(source, target) {
  await assertFile(source, `Fichier requis absent : ${source}`);
  await fs.copyFile(source, target);
}
