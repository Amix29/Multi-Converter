import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import process from "node:process";
import {
  download,
  downloadIfMissingVerified,
  publicSourceLabel,
  requireSha256Env,
} from "./lib/download-integrity.mjs";

const root = process.cwd();
const downloads = path.join(root, "engine-sources", ".downloads");
const extracts = path.join(root, "engine-sources", ".extracts");
const sourceDir = path.join(root, "engine-sources", "macos-aarch64", "pandoc");
const userAgent = { "User-Agent": "Multi-Converter-Packager" };

if (process.platform !== "darwin" || process.arch !== "arm64") {
  throw new Error("macOS Pandoc preparation must run on Apple Silicon.");
}

requireCommand("xcrun", ["-find", "lipo"]);

await fs.mkdir(downloads, { recursive: true });
await fs.mkdir(extracts, { recursive: true });

const releaseTag = process.env.PANDOC_MACOS_RELEASE_TAG ?? "3.9.0.2";
const release = await getJson(`https://api.github.com/repos/jgm/pandoc/releases/tags/${encodeURIComponent(releaseTag)}`);
const armAsset = release.assets.find((item) => /arm64-macOS\.zip$/i.test(item.name));
if (!armAsset) {
  throw new Error("The pinned Pandoc release must include an arm64-macOS.zip asset.");
}

const armArchive = path.join(downloads, armAsset.name);
await downloadIfMissingVerified(
  armAsset.browser_download_url,
  armArchive,
  requireSha256Env("PANDOC_MACOS_AARCH64_ARCHIVE_SHA256"),
  userAgent,
);

const armExtract = path.join(extracts, "pandoc-macos-arm64");
await extractZip(armArchive, armExtract);

const armPandoc = await findExecutable(armExtract, "pandoc");
if (!armPandoc) {
  throw new Error("Pandoc macOS ZIP assets do not contain the expected pandoc executable.");
}

await fs.rm(sourceDir, { recursive: true, force: true });
await fs.mkdir(path.join(sourceDir, "bin"), { recursive: true });
await fs.mkdir(path.join(sourceDir, "licenses"), { recursive: true });

const universalPandoc = path.join(sourceDir, "bin", "pandoc-aarch64-apple-darwin");
await fs.copyFile(armPandoc, universalPandoc);
await fs.chmod(universalPandoc, 0o755);
run("lipo", [universalPandoc, "-verify_arch", "arm64"]);

const tag = release.tag_name ?? release.name;
await download(
  `https://raw.githubusercontent.com/jgm/pandoc/${tag}/COPYRIGHT`,
  path.join(sourceDir, "licenses", "LICENSE.txt"),
);
await fs.writeFile(
  path.join(sourceDir, "licenses", "THIRD_PARTY_NOTICES.txt"),
  [
    "Pandoc macOS Apple Silicon package",
    `Apple Silicon source: ${publicSourceLabel(armAsset.browser_download_url)}`,
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
