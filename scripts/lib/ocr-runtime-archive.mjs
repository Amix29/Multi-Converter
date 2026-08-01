import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

export function ocrRuntimeArchivePath(root, platform) {
  return path.join(root, "src-tauri", "ocr-resources", "runtime", `${platform}.zip`);
}

export async function extractOcrRuntimeArchive(archivePath, destination, platform) {
  await fs.mkdir(destination, { recursive: true });
  if (process.platform === "win32") {
    const script = [
      "Add-Type -AssemblyName System.IO.Compression.FileSystem",
      "[System.IO.Compression.ZipFile]::ExtractToDirectory($env:MC_OCR_ZIP_SOURCE, $env:MC_OCR_ZIP_TARGET)",
    ].join("; ");
    const result = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
      env: { ...process.env, MC_OCR_ZIP_SOURCE: archivePath, MC_OCR_ZIP_TARGET: destination },
      stdio: "inherit",
    });
    if (result.status !== 0) throw new Error("Extraction de l’archive OCR Windows impossible.");
  } else {
    const result = spawnSync("unzip", ["-q", archivePath, "-d", destination], { stdio: "inherit" });
    if (result.status !== 0) throw new Error("Extraction de l’archive OCR impossible.");
  }
  return path.join(destination, process.platform === "win32" ? "ocr-worker.exe" : "ocr-worker");
}
