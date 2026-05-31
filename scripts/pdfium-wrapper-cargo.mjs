import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import process from "node:process";

const root = process.cwd();
const sourceDir = path.join(root, "tools", "pdfium-render-wrapper");
const workDir = path.join(process.env.TEMP ?? root, "multi-converter-pdfium-wrapper-cargo");
const manifest = path.join(workDir, "Cargo.toml");
const targetDir = path.join(process.env.TEMP ?? workDir, "mc-cargo-target-pdfium-wrapper");
const args = process.argv.slice(2);

if (args.length === 0) {
  throw new Error("Missing cargo command for PDFium wrapper.");
}

await fs.rm(workDir, { recursive: true, force: true });
await fs.cp(sourceDir, workDir, { recursive: true, force: true });

const lock = spawnSync("cargo", ["generate-lockfile", "--manifest-path", manifest], {
  cwd: root,
  stdio: "inherit",
});
if (lock.status !== 0) process.exit(lock.status ?? 1);

const separator = args.indexOf("--");
const cargoArgs =
  separator === -1
    ? [...args, "--manifest-path", manifest, "--locked"]
    : [...args.slice(0, separator), "--manifest-path", manifest, "--locked", ...args.slice(separator)];

const result = spawnSync("cargo", cargoArgs, {
  cwd: root,
  env: {
    ...process.env,
    CARGO_TARGET_DIR: targetDir,
  },
  stdio: "inherit",
});

process.exit(result.status ?? 1);
