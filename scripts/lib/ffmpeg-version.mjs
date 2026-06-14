import fs from "node:fs";
import path from "node:path";

export function readRequiredFfmpegVersion(root = process.cwd()) {
  const enginesPath = path.join(root, "src-tauri", "src", "engines.rs");
  const enginesSource = fs.readFileSync(enginesPath, "utf8");
  const match = enginesSource.match(/const\s+FFMPEG_REQUIRED_VERSION\s*:\s*&str\s*=\s*"([^"]+)"/);
  if (!match) {
    throw new Error("Unable to read FFMPEG_REQUIRED_VERSION from src-tauri/src/engines.rs.");
  }
  return match[1];
}

export function ffmpegVersionFromEnv(envName, root = process.cwd()) {
  const override = process.env[envName]?.trim();
  return override || readRequiredFfmpegVersion(root);
}
