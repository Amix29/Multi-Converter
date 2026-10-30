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
// Unit/conversion tests resolve the real engines from the source staging tree;
// check and Clippy do not execute them. These commands never package an app. Avoid copying
// hundreds of MB into their target directory. Actual Tauri builds retain the
// complete production resources; asset and packaging gates validate that config.
if (["clippy", "test", "check"].includes(args[0])) {
  const config = JSON.parse(env.TAURI_CONFIG ?? "{}");
  env.TAURI_CONFIG = JSON.stringify({
    ...config,
    bundle: { ...config.bundle, resources: [], externalBin: [] },
  });
}

const result = spawnSync("cargo", args, {
  env,
  stdio: "inherit",
  windowsHide: true,
});

process.exit(result.status ?? 1);
