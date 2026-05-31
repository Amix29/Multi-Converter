import { spawnSync } from "node:child_process";
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

const result = spawnSync("tauri", [command, ...extraArgs], {
  env,
  shell: true,
  stdio: "inherit",
});

process.exit(result.status ?? 1);
