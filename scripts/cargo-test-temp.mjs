import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const args = process.argv.slice(2);
const targetName = process.env.MULTI_CONVERTER_CARGO_TARGET_NAME ?? "mc-cargo-target-tests";
const env = {
  ...process.env,
  CARGO_TARGET_DIR: process.env.CARGO_TARGET_DIR ?? path.join(os.tmpdir(), targetName),
};

const result = spawnSync("cargo", args, {
  env,
  shell: true,
  stdio: "inherit",
});

process.exit(result.status ?? 1);
