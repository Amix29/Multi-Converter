import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import process from "node:process";
import {
  downloadIfMissingVerified,
  publicSourceLabel,
  sha256File,
} from "./lib/download-integrity.mjs";
import { validatePdfiumLock } from "./lib/pdfium-package.mjs";

const root = process.cwd();
const downloads = path.join(root, "engine-sources", ".downloads");
const extracts = path.join(root, "engine-sources", ".extracts");
const sourceDir = path.join(root, "engine-sources", "windows-x64", "pdfium");
const wrapperSource = path.join(root, "tools", "pdfium-render-wrapper");
const provenancePath = path.join(root, "tools", "pdfium-windows-x64.lock.json");
const wrapperBuild = path.join(process.env.TEMP ?? extracts, "multi-converter-pdfium-render-build");
const userAgent = { "User-Agent": "Multi-Converter-Packager" };

const provenance = JSON.parse(await fs.readFile(provenancePath, "utf8"));
validatePdfiumLock(provenance);
if (process.platform !== "win32" || process.arch !== "x64") throw new Error("La preparation PDFium Phase 7 exige Windows x64.");

await fs.mkdir(downloads, { recursive: true });
await fs.mkdir(extracts, { recursive: true });

const archive = path.join(downloads, provenance.upstream.archiveName);
await downloadIfMissingVerified(
  provenance.upstream.archiveUrl,
  archive,
  provenance.upstream.archiveSha256,
  userAgent,
);
await assertExactFile(archive, provenance.upstream.archiveSizeBytes, provenance.upstream.archiveSha256, "archive PDFium");

const extractDir = path.join(extracts, "pdfium");
rejectUnsafeArchiveEntries(listArchive(archive));
await extractTgz(archive, extractDir);

const dll = path.join(extractDir, "bin", "pdfium.dll");
await assertFile(dll, "pdfium.dll absent du paquet PDFium.");
await assertExactFile(dll, provenance.upstream.librarySizeBytes, provenance.upstream.librarySha256, "pdfium.dll");

await fs.rm(wrapperBuild, { recursive: true, force: true });
await fs.cp(wrapperSource, wrapperBuild, { recursive: true, force: true });
await assertWrapperManifest(provenance.wrapper);
if (!(await fileExists(path.join(wrapperBuild, "Cargo.lock")))) {
  throw new Error("Le wrapper PDFium doit fournir un Cargo.lock versionne.");
}
await assertExactHash(path.join(wrapperBuild, "Cargo.lock"), provenance.wrapper.cargoLockSha256, "Cargo.lock PDFium");
assertRustToolchain(provenance.wrapper.buildRustVersion);
const build = spawnSync("cargo", [
  "build",
  "--manifest-path",
  path.join(wrapperBuild, "Cargo.toml"),
  "--release",
  "--locked",
  "--target",
  provenance.wrapper.target,
], {
  cwd: root,
  env: reproducibleCargoEnvironment(provenance),
  stdio: "inherit",
});
if (build.status !== 0) process.exit(build.status ?? 1);
const wrapperExecutable = path.join(wrapperBuild, "target", provenance.wrapper.target, "release", "pdfium-render.exe");
await assertExactFile(wrapperExecutable, provenance.wrapper.binarySizeBytes, provenance.wrapper.binarySha256, "wrapper PDFium");

await fs.rm(sourceDir, { recursive: true, force: true });
await fs.mkdir(path.join(sourceDir, "bin"), { recursive: true });
await fs.mkdir(path.join(sourceDir, "licenses"), { recursive: true });
await fs.copyFile(dll, path.join(sourceDir, "bin", "pdfium.dll"));
await fs.copyFile(
  wrapperExecutable,
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
    `Source: ${publicSourceLabel(provenance.upstream.archiveUrl)}`,
    `Release: PDFium ${provenance.upstream.version} (${provenance.upstream.releaseTag})`,
    `Archive SHA-256: ${provenance.upstream.archiveSha256}`,
    `pdfium.dll SHA-256: ${provenance.upstream.librarySha256}`,
    "",
    "PDFium is distributed by bblanchon/pdfium-binaries from Chromium PDFium sources.",
    "The extracted package includes third-party notices under licenses/pdfium-third-party/.",
    "",
    "Wrapper: Multi-Converter pdfium-render, built with the Rust pdfium-render crate.",
    "Wrapper license: AGPL-3.0-or-later for Multi-Converter code; pdfium-render crate keeps its own MIT OR Apache-2.0 license.",
    "",
  ].join("\n"),
  "utf8",
);

console.log(`PDFium ${provenance.upstream.version} ready from locked provenance.`);

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

async function assertExactFile(filePath, expectedBytes, expectedSha256, label) {
  const stat = await fs.stat(filePath);
  if (stat.size !== expectedBytes) throw new Error(`${label}: taille inattendue (${stat.size}, attendu ${expectedBytes}).`);
  const actual = await sha256File(filePath);
  if (actual !== expectedSha256) throw new Error(`${label}: SHA-256 inattendu (${actual}).`);
}

async function assertExactHash(filePath, expectedSha256, label) {
  const actual = await sha256File(filePath);
  if (actual !== expectedSha256) throw new Error(`${label}: SHA-256 inattendu (${actual}).`);
}

async function assertWrapperManifest(wrapper) {
  const manifest = await fs.readFile(path.join(wrapperSource, "Cargo.toml"), "utf8");
  if (!manifest.includes(`version = "${wrapper.version}"`)) throw new Error("Version du wrapper PDFium non conforme au verrou.");
  if (!manifest.includes(`rust-version = "${wrapper.minimumRustVersion}"`)) throw new Error("Version Rust minimale du wrapper non conforme au verrou.");
  if (!manifest.includes(`license = "${wrapper.license}"`)) throw new Error("Licence du wrapper PDFium non conforme au verrou.");
  if (!manifest.includes(`pdfium-render = "=${wrapper.pdfiumRenderCrateVersion}"`)) throw new Error("Version de pdfium-render non conforme au verrou.");
}

function listArchive(archivePath) {
  const result = spawnSync("tar", ["-tf", archivePath], { encoding: "utf8", windowsHide: true });
  if (result.status !== 0) throw new Error(`Archive PDFium illisible: ${result.stderr || archivePath}`);
  return result.stdout.split(/\r?\n/).filter(Boolean);
}

function rejectUnsafeArchiveEntries(entries) {
  if (!entries.length) throw new Error("Archive PDFium vide.");
  const seen = new Set();
  for (const entry of entries) {
    const normalized = entry.replaceAll("\\", "/").replace(/^\.\//, "");
    const parts = normalized.split("/").filter(Boolean);
    if (!normalized || normalized.startsWith("/") || /^[A-Za-z]:/.test(normalized) || parts.includes("..")) {
      throw new Error(`Entree PDFium dangereuse refusee: ${entry}`);
    }
    const key = normalized.toLowerCase();
    if (seen.has(key)) throw new Error(`Entree PDFium dupliquee refusee: ${entry}`);
    seen.add(key);
  }
}

async function fileExists(filePath) {
  return Boolean((await fs.stat(filePath).catch(() => null))?.isFile());
}

function assertRustToolchain(expected) {
  const result = spawnSync("rustc", ["--version"], { encoding: "utf8", windowsHide: true });
  if (result.status !== 0) throw new Error(`rustc indisponible: ${result.stderr || result.stdout}`);
  const actual = result.stdout.trim().split(/\s+/)[1];
  if (actual !== expected) throw new Error(`Toolchain Rust PDFium ${actual}, attendu ${expected}.`);
}

function reproducibleCargoEnvironment(lock) {
  const { RUSTFLAGS: _rustFlags, CARGO_ENCODED_RUSTFLAGS: _encodedFlags, ...cleanEnvironment } = process.env;
  const cargoHome = process.env.CARGO_HOME ?? path.join(process.env.USERPROFILE ?? root, ".cargo");
  const flags = [
    "-Clink-arg=/Brepro",
    `--remap-path-prefix=${wrapperBuild}=C:/multi-converter/pdfium-wrapper`,
    `--remap-path-prefix=${cargoHome}=C:/cargo`,
  ];
  return {
    ...cleanEnvironment,
    CARGO_ENCODED_RUSTFLAGS: flags.join("\u001f"),
    CARGO_INCREMENTAL: "0",
    CARGO_PROFILE_RELEASE_CODEGEN_UNITS: "1",
    SOURCE_DATE_EPOCH: String(Math.floor(new Date(lock.package.deterministicTimestamp).valueOf() / 1000)),
  };
}

async function copyIfExists(source, target) {
  await assertFile(source, `Fichier requis absent : ${source}`);
  await fs.copyFile(source, target);
}
