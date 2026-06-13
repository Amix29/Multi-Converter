import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import process from "node:process";
import os from "node:os";
import {
  download,
  downloadIfMissingVerified,
  publicSourceLabel,
  requireSha256Env,
} from "./lib/download-integrity.mjs";

const root = process.cwd();
const downloads = path.join(root, "engine-sources", ".downloads");
const extracts = path.join(root, "engine-sources", ".extracts");
const libvipsWork = path.join(os.tmpdir(), "multi-converter-libvips");
const sourceDir = path.join(root, "engine-sources", "windows-x64", "libvips");
const userAgent = { "User-Agent": "Multi-Converter-Packager" };
const releaseApi = "https://api.github.com/repos/libvips/build-win64-mxe/releases/latest";

await fs.mkdir(downloads, { recursive: true });
await fs.mkdir(extracts, { recursive: true });
await fs.mkdir(libvipsWork, { recursive: true });

const release = await getJson(releaseApi);
const asset = selectWindowsX64Asset(release.assets ?? []);
if (!asset) {
  throw new Error([
    "Aucun build Windows x64 stable libvips trouve dans la derniere release officielle libvips/build-win64-mxe.",
    "Le script attend de preference un asset vips-dev-x64-web-<version>.zip.",
    `Release inspectee : ${release.html_url ?? releaseApi}`,
    "Fournissez une source officielle stable avant de packager libvips.",
  ].join("\n"));
}

const archive = path.join(downloads, asset.name);
await downloadIfMissingVerified(
  asset.browser_download_url,
  archive,
  requireSha256Env("LIBVIPS_WINDOWS_X64_ARCHIVE_SHA256"),
  userAgent,
);

const extractDir = path.join(extracts, "libvips");
await extractZip(archive, extractDir);

const runtimeRoot = await findRuntimeRoot(extractDir);
if (!runtimeRoot) {
  throw new Error("bin/vips.exe absent du ZIP Windows officiel libvips.");
}

await fs.rm(sourceDir, { recursive: true, force: true });
await fs.mkdir(sourceDir, { recursive: true });
for (const directory of ["bin", "lib", "share"]) {
  const from = path.join(runtimeRoot, directory);
  const stat = await fs.stat(from).catch(() => null);
  if (stat?.isDirectory()) {
    await fs.cp(from, path.join(sourceDir, directory), { recursive: true, force: true });
  }
}
await fs.mkdir(path.join(sourceDir, "licenses"), { recursive: true });

const runtimeLicense = path.join(runtimeRoot, "LICENSE");
if ((await fs.stat(runtimeLicense).catch(() => null))?.isFile()) {
  await fs.copyFile(runtimeLicense, path.join(sourceDir, "licenses", "LICENSE.txt"));
} else {
  await download(
    `https://raw.githubusercontent.com/libvips/libvips/${release.tag_name}/LICENSE`,
    path.join(sourceDir, "licenses", "LICENSE.txt"),
  );
}
await writeThirdPartyNotices(asset, release, runtimeRoot);

await assertFile(path.join(sourceDir, "bin", "vips.exe"), "bin/vips.exe absent.");
await assertAnyFile(path.join(sourceDir, "bin"), /\.dll$/i, "Aucune DLL libvips trouvee dans bin/.");
await assertFile(path.join(sourceDir, "licenses", "LICENSE.txt"), "LICENSE.txt absent.");
await assertFile(path.join(sourceDir, "licenses", "THIRD_PARTY_NOTICES.txt"), "THIRD_PARTY_NOTICES.txt absent.");
await smokeTestLibvips(path.join(sourceDir, "bin", "vips.exe"));
const detectedFormats = await detectFormats(path.join(sourceDir, "bin", "vips.exe"));

console.log(`libvips ready from ${release.name ?? release.tag_name}: ${publicSourceLabel(asset.browser_download_url)}`);
console.log(`Formats detectes pour l'activation Multi-Converter: ${detectedFormats.join(", ")}`);

function selectWindowsX64Asset(assets) {
  const stable = assets.filter((item) => /^vips-dev-x64-.+\.zip$/i.test(item.name) && !/test|alpha|beta|rc/i.test(item.name));
  return stable.find((item) => /^vips-dev-x64-web-/i.test(item.name) && !/-static/i.test(item.name))
    ?? stable.find((item) => /^vips-dev-x64-web-\d/i.test(item.name))
    ?? stable.find((item) => /^vips-dev-x64-all-/i.test(item.name))
    ?? null;
}

async function getJson(url) {
  const response = await fetch(url, { headers: userAgent });
  if (!response.ok) throw new Error(`Requete impossible (${response.status}) : ${url}`);
  return response.json();
}

async function extractZip(archivePath, destination) {
  await fs.rm(destination, { recursive: true, force: true });
  await fs.mkdir(destination, { recursive: true });
  const script = [
    "Add-Type -AssemblyName System.IO.Compression.FileSystem",
    `[System.IO.Compression.ZipFile]::ExtractToDirectory(${psQuote(archivePath)}, ${psQuote(destination)})`,
  ].join("; ");
  const result = spawnSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], {
    cwd: root,
    stdio: "inherit",
  });
  if (result.status !== 0) throw new Error(`Extraction libvips impossible : ${archivePath}`);
}

async function findRuntimeRoot(dir) {
  const candidate = path.join(dir, "bin", "vips.exe");
  if ((await fs.stat(candidate).catch(() => null))?.isFile()) return dir;
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const found = await findRuntimeRoot(path.join(dir, entry.name));
    if (found) return found;
  }
  return null;
}

async function writeThirdPartyNotices(asset, release, runtimeRoot) {
  const lines = [
    "libvips Windows x64 package",
    `Source: ${publicSourceLabel(asset.browser_download_url)}`,
    `Release: ${release.name ?? release.tag_name}`,
    `Build repository: ${release.html_url ?? "https://github.com/libvips/build-win64-mxe"}`,
    "",
    "libvips is distributed under LGPL-2.1-or-later.",
    "The Windows package includes DLL dependencies from the official libvips/build-win64-mxe build.",
    "Those dependencies may have their own licenses. Keep this notice with the packaged runtime.",
    "",
  ];
  for (const relative of ["README.md", "COPYING", "LICENSE", "licenses"]) {
    const candidate = path.join(runtimeRoot, relative);
    const stat = await fs.stat(candidate).catch(() => null);
    if (stat) lines.push(`Runtime includes upstream notice/licence path: ${relative}`);
  }
  await fs.writeFile(path.join(sourceDir, "licenses", "THIRD_PARTY_NOTICES.txt"), `${lines.join("\n")}\n`, "utf8");
}

async function smokeTestLibvips(exe) {
  const testDir = path.join(libvipsWork, "smoke");
  await fs.rm(testDir, { recursive: true, force: true });
  await fs.mkdir(testDir, { recursive: true });
  const input = path.join(testDir, "input.png");
  const output = path.join(testDir, "output.jpg");
  await fs.writeFile(input, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFElEQVR4nGP8z8Dwn4GBgYGJAQoAHxcCAkJ3kKIAAAAASUVORK5CYII=", "base64"));
  const result = spawnSync(exe, ["copy", input, output], {
    cwd: path.dirname(exe),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(`Health check libvips echoue : ${result.stderr || result.stdout}`);
  }
  const stat = await fs.stat(output).catch(() => null);
  if (!stat?.isFile() || stat.size === 0) {
    throw new Error("Health check libvips invalide : output.jpg absent ou vide.");
  }
}

async function detectFormats(exe) {
  const result = spawnSync(exe, ["list", "classes"], {
    cwd: path.dirname(exe),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) return ["png", "jpg", "webp", "tiff"];
  const output = `${result.stdout}\n${result.stderr}`.toLowerCase();
  const formats = [];
  for (const [name, pattern] of [
    ["png", /png(load|save)/],
    ["jpg", /jpeg(load|save)|jpg/],
    ["webp", /webp(load|save)/],
    ["tiff", /tiff(load|save)/],
    ["heif", /heif(load|save)|heic/],
    ["avif", /avif/],
  ]) {
    if (pattern.test(output)) formats.push(name);
  }
  return formats;
}

function psQuote(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

async function assertFile(filePath, message) {
  const stat = await fs.stat(filePath).catch(() => null);
  if (!stat?.isFile()) throw new Error(message);
}

async function assertAnyFile(dir, pattern, message) {
  const entries = await fs.readdir(dir).catch(() => []);
  if (!entries.some((entry) => pattern.test(entry))) throw new Error(message);
}
