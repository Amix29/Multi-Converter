import { readRustModuleTree } from "./rust-source-tree.mjs";

export function readRequiredFfmpegVersion(root = process.cwd()) {
  const enginesSource = readRustModuleTree(root, "engines");
  const match = enginesSource.match(/const\s+FFMPEG_REQUIRED_VERSION\s*:\s*&str\s*=\s*"([^"]+)"/);
  if (!match) {
    throw new Error("Unable to read FFMPEG_REQUIRED_VERSION from the Rust engines module.");
  }
  return match[1];
}

export function ffmpegVersionFromEnv(envName, root = process.cwd()) {
  const override = process.env[envName]?.trim();
  return override || readRequiredFfmpegVersion(root);
}
