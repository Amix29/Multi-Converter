import fs from "node:fs/promises";
import { createWriteStream } from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { spawnSync } from "node:child_process";
import process from "node:process";

const root = process.cwd();
const downloads = path.join(root, "engine-sources", ".downloads");
const extracts = path.join(root, "engine-sources", ".extracts");
const sourceDir = path.join(root, "engine-sources", "macos-universal", "pandoc");
const userAgent = { "User-Agent": "Multi-Converter-Packager" };

if (process.platform !== "darwin") {
  throw new Error("macOS Pandoc engine preparation must run on macOS so lipo can create a universal binary.");
}

requireCommand("xcrun", ["-find", "lipo"]);

await fs.mkdir(downloads, { recursive: true });
await fs.mkdir(extracts, { recursive: true });

const release = await getJson("https://api.github.com/repos/jgm/pandoc/releases/latest");
const armAsset = release.assets.find((item) => /arm64-macOS\.zip$/i.test(item.name));
const x64Asset = release.assets.find((item) => /x86_64-macOS\.zip$/i.test(item.name));
if (!armAsset || !x64Asset) {
  throw new Error("The latest official Pandoc release must include both arm64-macOS.zip and x86_64-macOS.zip assets.");
}

const armArchive = path.join(downloads, armAsset.name);
const x64Archive = path.join(downloads, x64Asset.name);
await downloadIfMissing(armAsset.browser_download_url, armArchive);
await downloadIfMissing(x64Asset.browser_download_url, x64Archive);

const armExtract = path.join(extracts, "pandoc-macos-arm64");
const x64Extract = path.join(extracts, "pandoc-macos-x86_64");
await extractZip(armArchive, armExtract);
await extractZip(x64Archive, x64Extract);

const armPandoc = await findExecutable(armExtract, "pandoc");
const x64Pandoc = await findExecutable(x64Extract, "pandoc");
if (!armPandoc || !x64Pandoc) {
  throw new Error("Pandoc macOS ZIP assets do not contain the expected pandoc executable.");
}

await fs.rm(sourceDir, { recursive: true, force: true });
await fs.mkdir(path.join(sourceDir, "bin"), { recursive: true });
await fs.mkdir(path.join(sourceDir, "licenses"), { recursive: true });

const universalPandoc = path.join(sourceDir, "bin", "pandoc-universal-apple-darwin");
run("lipo", ["-create", armPandoc, x64Pandoc, "-output", universalPandoc]);
await fs.chmod(universalPandoc, 0o755);
run("lipo", [universalPandoc, "-verify_arch", "arm64"]);
run("lipo", [universalPandoc, "-verify_arch", "x86_64"]);

const tag = release.tag_name ?? release.name;
await download(
  `https://raw.githubusercontent.com/jgm/pandoc/${tag}/COPYRIGHT`,
  path.join(sourceDir, "licenses", "LICENSE.txt"),
);
await fs.writeFile(
  path.join(sourceDir, "licenses", "THIRD_PARTY_NOTICES.txt"),
  [
    "Pandoc macOS universal package",
    `Apple Silicon source: ${armAsset.browser_download_url}`,
    `Intel source: ${x64Asset.browser_download_url}`,
    `Release: ${release.name ?? release.tag_name}`,
    "",
    "Pandoc is distributed under GPL-2.0-or-later.",
    "This package is bundled with Multi-Converter for advanced local document conversions.",
    "Pandoc is not used for PDF generation unless a complete PDF toolchain is explicitly added later.",
    "",
  ].join("\n"),
  "utf8",
);

await assertFile(path.join(sourceDir, "licenses", "LICENSE.txt"), "LICENSE.txt missing.");
await assertFile(path.join(sourceDir, "licenses", "THIRD_PARTY_NOTICES.txt"), "THIRD_PARTY_NOTICES.txt missing.");
await smokeTestPandoc(universalPandoc);

console.log(`macOS Pandoc ready from ${release.name ?? release.tag_name}.`);

async function downloadIfMissing(url, target) {
  try {
    const stat = await fs.stat(target);
    if (stat.size > 0) return;
  } catch {
    // Download below.
  }
  await download(url, target);
}

async function download(url, target) {
  console.log(`Downloading ${url}`);
  const response = await fetch(url, { headers: userAgent });
  if (!response.ok || !response.body) {
    throw new Error(`Download failed (${response.status}): ${url}`);
  }
  await fs.mkdir(path.dirname(target), { recursive: true });
  await pipeline(response.body, createWriteStream(target));
}

async function getJson(url) {
  const response = await fetch(url, { headers: userAgent });
  if (!response.ok) throw new Error(`Request failed (${response.status}): ${url}`);
  return response.json();
}

async function extractZip(archivePath, destination) {
  await fs.rm(destination, { recursive: true, force: true });
  await fs.mkdir(destination, { recursive: true });
  run("unzip", ["-q", archivePath, "-d", destination]);
}

async function findExecutable(dir, filename) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = await findExecutable(fullPath, filename);
      if (found) return found;
    } else if (entry.isFile() && entry.name === filename) {
      const stat = await fs.stat(fullPath);
      if ((stat.mode & 0o111) !== 0) return fullPath;
    }
  }
  return null;
}

async function smokeTestPandoc(exe) {
  const testDir = path.join(extracts, "pandoc-macos-smoke");
  await fs.rm(testDir, { recursive: true, force: true });
  await fs.mkdir(testDir, { recursive: true });
  const input = path.join(testDir, "input.md");
  const output = path.join(testDir, "output.html");
  await fs.writeFile(input, "# Test Pandoc\n\nBonjour Multi-Converter", "utf8");
  const result = spawnSync(exe, [input, "-o", output], {
    cwd: testDir,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(`Pandoc health check failed: ${result.stderr || result.stdout}`);
  }
  const html = await fs.readFile(output, "utf8");
  if (!html.includes("Bonjour Multi-Converter")) {
    throw new Error("Pandoc health check output does not contain the expected text.");
  }
}

async function assertFile(filePath, message) {
  const stat = await fs.stat(filePath).catch(() => null);
  if (!stat?.isFile()) throw new Error(message);
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

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
