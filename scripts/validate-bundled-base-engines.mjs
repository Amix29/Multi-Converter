import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const expectedVersion = "8.1.1";
const binaries = [
  ["ffmpeg", path.join(root, "src-tauri", "binaries", "ffmpeg-x86_64-pc-windows-msvc.exe")],
  ["ffprobe", path.join(root, "src-tauri", "binaries", "ffprobe-x86_64-pc-windows-msvc.exe")],
];

const errors = [];

for (const [id, filePath] of binaries) {
  if (!fs.existsSync(filePath)) {
    errors.push(`${id}: binaire embarqué absent (${path.relative(root, filePath)})`);
    continue;
  }
  const stat = fs.statSync(filePath);
  if (!stat.isFile() || stat.size <= 0) {
    errors.push(`${id}: binaire embarqué vide ou invalide (${path.relative(root, filePath)})`);
    continue;
  }
  const result = spawnSync(filePath, ["-version"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
    timeout: 30000,
  });
  if (result.status !== 0) {
    errors.push(`${id}: -version échoue (${result.stderr || result.stdout || "aucun détail"})`);
    continue;
  }
  const firstLine = `${result.stdout || result.stderr}`.split(/\r?\n/).find(Boolean) ?? "";
  if (!firstLine.includes(expectedVersion)) {
    errors.push(`${id}: version inattendue (${firstLine || "sortie vide"}), attendu ${expectedVersion}`);
  }
}

if (errors.length) {
  console.error("Bundled base engine validation failed:");
  for (const error of errors) console.error(`- ${error}`);
  console.error("Run `npm run prepare:bundled-base-engines` to restore the Windows x64 base binaries.");
  process.exit(1);
}

console.log("Bundled base engine validation OK");
