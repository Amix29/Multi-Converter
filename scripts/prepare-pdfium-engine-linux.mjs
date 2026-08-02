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
const sourceDir = path.join(root, "engine-sources", "linux-x64", "pdfium");
const wrapperSource = path.join(root, "tools", "pdfium-render-wrapper");
const wrapperBuild = path.join(os.tmpdir(), "multi-converter-pdfium-render-linux-build");
const userAgent = { "User-Agent": "Multi-Converter-Packager" };

if (process.platform !== "linux" || process.arch !== "x64") {
  throw new Error(`Linux PDFium engine preparation must run on Linux x64, current host is ${process.platform}/${process.arch}.`);
}

await fs.mkdir(downloads, { recursive: true });
await fs.mkdir(extracts, { recursive: true });

const asset = await lockedPdfiumPlatform("linux-x64", root);

const archive = path.join(downloads, asset.archiveName);
await downloadIfMissingVerified(
  asset.url,
  archive,
  asset.sha256,
  githubApiHeaders(),
);
const archiveStat = await fs.stat(archive);
if (archiveStat.size !== asset.bytes) throw new Error("Locked Linux PDFium archive size differs.");

const extractDir = path.join(extracts, "pdfium-linux-x64");
await extractTgz(archive, extractDir);

const so = path.join(extractDir, ...asset.libraryPath.split("/"));
await assertFile(so, "libpdfium.so missing from the Linux PDFium package.");
await assertLockedLibrary(so, asset);

await fs.rm(wrapperBuild, { recursive: true, force: true });
await fs.cp(wrapperSource, wrapperBuild, { recursive: true, force: true });
run("cargo", ["generate-lockfile", "--manifest-path", path.join(wrapperBuild, "Cargo.toml")]);
run("cargo", ["build", "--manifest-path", path.join(wrapperBuild, "Cargo.toml"), "--release", "--locked"]);

await fs.rm(sourceDir, { recursive: true, force: true });
await fs.mkdir(path.join(sourceDir, "bin"), { recursive: true });
await fs.mkdir(path.join(sourceDir, "licenses"), { recursive: true });
await fs.copyFile(so, path.join(sourceDir, "bin", "libpdfium.so"));
await fs.chmod(path.join(sourceDir, "bin", "libpdfium.so"), 0o755);

const wrapper = path.join(sourceDir, "bin", "pdfium-render-x86_64-unknown-linux-gnu");
await fs.copyFile(path.join(wrapperBuild, "target", "release", "pdfium-render"), wrapper);
await fs.chmod(wrapper, 0o755);

await copyIfExists(path.join(extractDir, "LICENSE"), path.join(sourceDir, "licenses", "LICENSE.txt"));
await fs.cp(path.join(extractDir, "licenses"), path.join(sourceDir, "licenses", "pdfium-third-party"), {
  recursive: true,
  force: true,
});
await fs.writeFile(
  path.join(sourceDir, "licenses", "THIRD_PARTY_NOTICES.txt"),
  [
    "PDFium Linux x64 package",
    `Source: ${publicSourceLabel(asset.url)}`,
    `Release: PDFium ${asset.version} (${asset.tag})`,
    "",
    "PDFium is distributed by bblanchon/pdfium-binaries from Chromium PDFium sources.",
    "The extracted package includes third-party notices under licenses/pdfium-third-party/.",
    "",
    "Wrapper: Multi-Converter pdfium-render Linux x64 binary, built with the Rust pdfium-render crate.",
    "Wrapper license: AGPL-3.0-or-later for Multi-Converter code; pdfium-render crate keeps its own MIT OR Apache-2.0 license.",
    "",
  ].join("\n"),
  "utf8",
);

run(wrapper, ["--check"], {
  PDFIUM_LIBRARY_PATH: path.join(sourceDir, "bin", "libpdfium.so"),
});

console.log(`Linux PDFium ${asset.version} ready from locked provenance ${asset.tag}.`);

function githubApiHeaders() {
  const token = process.env.GH_TOKEN?.trim() || process.env.GITHUB_TOKEN?.trim();
  return {
    ...userAgent,
    Accept: "application/vnd.github+json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function extractTgz(archivePath, destination) {
  await fs.rm(destination, { recursive: true, force: true });
  await fs.mkdir(destination, { recursive: true });
  run("tar", ["-xzf", archivePath, "-C", destination]);
}

async function assertFile(filePath, message) {
  const stat = await fs.stat(filePath).catch(() => null);
  if (!stat?.isFile()) throw new Error(message);
}

async function assertLockedLibrary(filePath, asset) {
  const stat = await fs.stat(filePath);
  if (stat.size !== asset.libraryBytes) throw new Error("Locked Linux PDFium library size differs.");
  const actual = await import("node:crypto").then(({ createHash }) => createHash("sha256"));
  actual.update(await fs.readFile(filePath));
  if (actual.digest("hex") !== asset.librarySha256) throw new Error("Locked Linux PDFium library SHA-256 differs.");
}

async function copyIfExists(source, target) {
  await assertFile(source, `Required file is missing: ${source}`);
  await fs.copyFile(source, target);
}

function run(command, args, env = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    env: { ...process.env, ...env },
    stdio: "inherit",
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
