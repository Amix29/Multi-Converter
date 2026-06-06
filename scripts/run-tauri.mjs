import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const command = process.argv[2];
const extraArgs = process.argv.slice(3);

if (!command || command.startsWith("-")) {
  console.error("Usage: node scripts/run-tauri.mjs <dev|build|...> [args]");
  process.exit(1);
}

const env = {
  ...process.env,
  CARGO_TARGET_DIR:
    process.env.CARGO_TARGET_DIR ??
    path.join(os.tmpdir(), "mc-cargo-target-tauri-dev"),
};

const tauriArgs = [command, ...extraArgs];
const hasConfigOverride = extraArgs.includes("--config") || extraArgs.includes("-c");
const hasSigningKey = Boolean(env.TAURI_SIGNING_PRIVATE_KEY?.trim());

if (command === "build" && !hasSigningKey && !hasConfigOverride) {
  console.warn(
    "TAURI_SIGNING_PRIVATE_KEY is not set; building without updater signature artifacts.",
  );
  removeStaleUpdaterArtifacts(env.CARGO_TARGET_DIR);
  const unsignedBuildConfigPath = path.join(
    os.tmpdir(),
    "mc-tauri-unsigned-build.config.json",
  );
  fs.writeFileSync(
    unsignedBuildConfigPath,
    JSON.stringify({ bundle: { createUpdaterArtifacts: false } }),
  );
  tauriArgs.push("--config", unsignedBuildConfigPath);
}

function removeStaleUpdaterArtifacts(targetDir) {
  const bundleDir = path.join(targetDir, "release", "bundle", "nsis");
  if (!fs.existsSync(bundleDir)) return;
  for (const name of fs.readdirSync(bundleDir)) {
    if (name.endsWith(".sig") || name === "latest.json") {
      fs.rmSync(path.join(bundleDir, name), { force: true });
    }
  }
}

const result = spawnSync("tauri", tauriArgs, {
  env,
  shell: true,
  stdio: "inherit",
});

process.exit(result.status ?? 1);
