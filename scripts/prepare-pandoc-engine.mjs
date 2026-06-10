import fs from "node:fs/promises";
import { createWriteStream } from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { spawnSync } from "node:child_process";
import process from "node:process";

const root = process.cwd();
const downloads = path.join(root, "engine-sources", ".downloads");
const extracts = path.join(root, "engine-sources", ".extracts");
const sourceDir = path.join(root, "engine-sources", "windows-x64", "pandoc");
const userAgent = { "User-Agent": "Multi-Converter-Packager" };

await fs.mkdir(downloads, { recursive: true });
await fs.mkdir(extracts, { recursive: true });

const release = await getJson("https://api.github.com/repos/jgm/pandoc/releases/latest");
const asset = release.assets.find((item) => /windows-x86_64\.zip$/i.test(item.name));
if (!asset) {
  throw new Error("Aucun ZIP Windows x86_64 trouve dans la derniere release officielle Pandoc.");
}

const archive = path.join(downloads, asset.name);
await downloadIfMissing(asset.browser_download_url, archive);

const extractDir = path.join(extracts, "pandoc");
await extractZip(archive, extractDir);

const pandocExe = await findFile(extractDir, "pandoc.exe");
if (!pandocExe) {
  throw new Error("pandoc.exe absent du ZIP Windows officiel Pandoc.");
}

await fs.rm(sourceDir, { recursive: true, force: true });
await fs.mkdir(path.join(sourceDir, "bin"), { recursive: true });
await fs.mkdir(path.join(sourceDir, "licenses"), { recursive: true });
await fs.copyFile(pandocExe, path.join(sourceDir, "bin", "pandoc.exe"));

const tag = release.tag_name ?? release.name;
await download(
  `https://raw.githubusercontent.com/jgm/pandoc/${tag}/COPYRIGHT`,
  path.join(sourceDir, "licenses", "LICENSE.txt"),
);
await fs.writeFile(
  path.join(sourceDir, "licenses", "THIRD_PARTY_NOTICES.txt"),
  [
    "Pandoc Windows x86_64 package",
    `Source: ${asset.browser_download_url}`,
    `Release: ${release.name ?? release.tag_name}`,
    "",
    "Pandoc is distributed under GPL-2.0-or-later.",
    "This package is bundled with Multi-Converter for advanced local document conversions.",
    "Pandoc is not used for PDF generation unless a complete PDF toolchain is explicitly added later.",
    "",
  ].join("\n"),
  "utf8",
);

await assertFile(path.join(sourceDir, "bin", "pandoc.exe"), "bin/pandoc.exe absent.");
await assertFile(path.join(sourceDir, "licenses", "LICENSE.txt"), "LICENSE.txt absent.");
await assertFile(path.join(sourceDir, "licenses", "THIRD_PARTY_NOTICES.txt"), "THIRD_PARTY_NOTICES.txt absent.");
await smokeTestPandoc(path.join(sourceDir, "bin", "pandoc.exe"));

console.log(`Pandoc ready from ${release.name ?? release.tag_name}.`);

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
    throw new Error(`Telechargement impossible (${response.status}) : ${url}`);
  }
  await fs.mkdir(path.dirname(target), { recursive: true });
  await pipeline(response.body, createWriteStream(target));
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
  if (result.status !== 0) throw new Error(`Extraction Pandoc impossible : ${archivePath}`);
}

async function findFile(dir, filename) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = await findFile(fullPath, filename);
      if (found) return found;
    } else if (entry.isFile() && entry.name.toLowerCase() === filename.toLowerCase()) {
      return fullPath;
    }
  }
  return null;
}

async function smokeTestPandoc(exe) {
  const testDir = path.join(extracts, "pandoc-smoke");
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
    throw new Error(`Health check Pandoc echoue : ${result.stderr || result.stdout}`);
  }
  const html = await fs.readFile(output, "utf8");
  if (!html.includes("Bonjour Multi-Converter")) {
    throw new Error("Health check Pandoc invalide : le HTML ne contient pas le texte attendu.");
  }
}

function psQuote(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

async function assertFile(filePath, message) {
  const stat = await fs.stat(filePath).catch(() => null);
  if (!stat?.isFile()) throw new Error(message);
}
