import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import process from "node:process";
import {
  downloadIfMissingVerified,
  publicSourceLabel,
} from "./lib/download-integrity.mjs";
import { lockedPdfiumPlatform } from "./lib/platform-provenance.mjs";

const root = process.cwd();
const downloads = path.join(root, "engine-sources", ".downloads");
const extracts = path.join(root, "engine-sources", ".extracts");
const sourceDir = path.join(root, "engine-sources", "macos-universal", "pdfium");
const wrapperSource = path.join(root, "tools", "pdfium-render-wrapper");
const wrapperBuild = path.join(os.tmpdir(), "multi-converter-pdfium-render-macos-build");
const wrapperTarget = path.join(os.tmpdir(), "multi-converter-pdfium-render-macos-target");
const userAgent = { "User-Agent": "Multi-Converter-Packager" };
const darwinTargets = ["aarch64-apple-darwin", "x86_64-apple-darwin"];

if (process.platform !== "darwin") {
  throw new Error("macOS PDFium engine preparation must run on macOS so lipo can create a universal wrapper.");
}

requireCommand("xcrun", ["-find", "lipo"]);

await fs.mkdir(downloads, { recursive: true });
await fs.mkdir(extracts, { recursive: true });

const asset = await lockedPdfiumPlatform("macos-universal", root);

const archive = path.join(downloads, asset.archiveName);
await downloadIfMissingVerified(
  asset.url,
  archive,
  asset.sha256,
  userAgent,
);
const archiveStat = await fs.stat(archive);
if (archiveStat.size !== asset.bytes) throw new Error("Locked macOS PDFium archive size differs.");

const extractDir = path.join(extracts, "pdfium-macos-universal");
await extractTgz(archive, extractDir);

const dylib = path.join(extractDir, ...asset.libraryPath.split("/"));
await assertFile(dylib, "libpdfium.dylib is missing from the macOS PDFium package.");
await assertLockedLibrary(dylib, asset);

await fs.rm(wrapperBuild, { recursive: true, force: true });
await fs.rm(wrapperTarget, { recursive: true, force: true });
await fs.cp(wrapperSource, wrapperBuild, { recursive: true, force: true });
run("cargo", ["generate-lockfile", "--manifest-path", path.join(wrapperBuild, "Cargo.toml")]);
for (const target of darwinTargets) {
  run("cargo", [
    "build",
    "--manifest-path",
    path.join(wrapperBuild, "Cargo.toml"),
    "--release",
    "--locked",
    "--target",
    target,
  ], {
    CARGO_TARGET_DIR: wrapperTarget,
  });
}

const armWrapper = path.join(wrapperTarget, "aarch64-apple-darwin", "release", "pdfium-render");
const x64Wrapper = path.join(wrapperTarget, "x86_64-apple-darwin", "release", "pdfium-render");
await assertFile(armWrapper, "Apple Silicon pdfium-render wrapper build is missing.");
await assertFile(x64Wrapper, "Intel pdfium-render wrapper build is missing.");

await fs.rm(sourceDir, { recursive: true, force: true });
await fs.mkdir(path.join(sourceDir, "bin"), { recursive: true });
await fs.mkdir(path.join(sourceDir, "licenses"), { recursive: true });
await fs.copyFile(dylib, path.join(sourceDir, "bin", "libpdfium.dylib"));
await fs.chmod(path.join(sourceDir, "bin", "libpdfium.dylib"), 0o755);

const universalWrapper = path.join(sourceDir, "bin", "pdfium-render-universal-apple-darwin");
run("lipo", ["-create", armWrapper, x64Wrapper, "-output", universalWrapper]);
await fs.chmod(universalWrapper, 0o755);
run("lipo", [universalWrapper, "-verify_arch", "arm64"]);
run("lipo", [universalWrapper, "-verify_arch", "x86_64"]);

await copyIfExists(path.join(extractDir, "LICENSE"), path.join(sourceDir, "licenses", "LICENSE.txt"));
await fs.cp(path.join(extractDir, "licenses"), path.join(sourceDir, "licenses", "pdfium-third-party"), {
  recursive: true,
  force: true,
});
await fs.writeFile(
  path.join(sourceDir, "licenses", "THIRD_PARTY_NOTICES.txt"),
  [
    "PDFium macOS universal package",
    `Source: ${publicSourceLabel(asset.url)}`,
    `Release: PDFium ${asset.version} (${asset.tag})`,
    "",
    "PDFium is distributed by bblanchon/pdfium-binaries from Chromium PDFium sources.",
    "The extracted package includes third-party notices under licenses/pdfium-third-party/.",
    "",
    "Wrapper: Multi-Converter pdfium-render universal macOS binary, built with the Rust pdfium-render crate.",
    "Wrapper license: AGPL-3.0-or-later for Multi-Converter code; pdfium-render crate keeps its own MIT OR Apache-2.0 license.",
    "",
  ].join("\n"),
  "utf8",
);

run(universalWrapper, ["--check"], {
  PDFIUM_LIBRARY_PATH: path.join(sourceDir, "bin", "libpdfium.dylib"),
});

console.log(`macOS PDFium ${asset.version} ready from locked provenance ${asset.tag}.`);

async function extractTgz(archivePath, destination) {
  await fs.rm(destination, { recursive: true, force: true });
  await fs.mkdir(destination, { recursive: true });
  run("tar", ["-xzf", archivePath, "-C", destination]);
}

async function findFile(dir, filename) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = await findFile(fullPath, filename);
      if (found) return found;
    } else if (entry.isFile() && entry.name === filename) {
      return fullPath;
    }
  }
  return null;
}

async function copyIfExists(source, target) {
  await assertFile(source, `Required file is missing: ${source}`);
  await fs.copyFile(source, target);
}

async function assertFile(filePath, message) {
  const stat = await fs.stat(filePath).catch(() => null);
  if (!stat?.isFile()) throw new Error(message);
}

async function assertLockedLibrary(filePath, asset) {
  const stat = await fs.stat(filePath);
  if (stat.size !== asset.libraryBytes) throw new Error("Locked macOS PDFium library size differs.");
  const actual = await import("node:crypto").then(({ createHash }) => createHash("sha256"));
  actual.update(await fs.readFile(filePath));
  if (actual.digest("hex") !== asset.librarySha256) throw new Error("Locked macOS PDFium library SHA-256 differs.");
}

function requireCommand(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(`${command} is required: ${result.stderr || result.stdout}`);
  }
}

function run(command, args, env = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    env: { ...process.env, ...env },
    stdio: "inherit",
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
