import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import process from "node:process";
import {
  downloadIfMissingVerified,
  publicSourceLabel,
  requireSha256Env,
} from "./lib/download-integrity.mjs";

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

const release = await getJson("https://api.github.com/repos/bblanchon/pdfium-binaries/releases/latest");
const asset = release.assets.find((item) => item.name === "pdfium-linux-x64.tgz");
if (!asset) {
  throw new Error("No pdfium-linux-x64.tgz asset found in the latest bblanchon/pdfium-binaries release.");
}

const archive = path.join(downloads, asset.name);
await downloadIfMissingVerified(
  asset.browser_download_url,
  archive,
  requireSha256Env("PDFIUM_LINUX_X64_ARCHIVE_SHA256"),
  githubApiHeaders(),
);

const extractDir = path.join(extracts, "pdfium-linux-x64");
await extractTgz(archive, extractDir);

const so = path.join(extractDir, "lib", "libpdfium.so");
await assertFile(so, "libpdfium.so missing from the Linux PDFium package.");

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
    `Source: ${publicSourceLabel(asset.browser_download_url)}`,
    `Release: ${release.name ?? release.tag_name}`,
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

console.log(`Linux PDFium ready from ${release.name ?? release.tag_name}.`);

async function getJson(url) {
  const response = await fetch(url, { headers: githubApiHeaders() });
  if (!response.ok) throw new Error(`Request failed (${response.status}): ${url}`);
  return response.json();
}

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
