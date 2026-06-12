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
const explicitTarget = optionValue(extraArgs, "--target", "-t");
const isMacosUniversalBuild = command === "build" && explicitTarget === "universal-apple-darwin";

if (command === "build") {
  removeBundleArtifacts(env.CARGO_TARGET_DIR);
}

if (isMacosUniversalBuild && process.platform !== "darwin" && env.MULTI_CONVERTER_ALLOW_NON_DARWIN_MACOS_BUILD !== "1") {
  console.error("macOS universal DMG builds must run on macOS. Use a Mac or GitHub Actions macos-latest runner.");
  process.exit(1);
}

if (command === "build" && !hasSigningKey && !hasConfigOverride) {
  console.warn(
    "TAURI_SIGNING_PRIVATE_KEY is not set; building without updater signature artifacts.",
  );
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

function removeBundleArtifacts(targetDir) {
  const bundleRoot = path.join(targetDir, "release", "bundle");
  if (!fs.existsSync(bundleRoot)) return;
  const resolvedBundleRoot = path.resolve(bundleRoot);
  const resolvedTemp = path.resolve(os.tmpdir());
  const resolvedWorkspaceTarget = path.resolve(process.cwd(), "src-tauri", "target");
  const isExpectedBundleDir =
    resolvedBundleRoot.endsWith(`${path.sep}release${path.sep}bundle`) &&
    (isPathInside(resolvedBundleRoot, resolvedTemp) || isPathInside(resolvedBundleRoot, resolvedWorkspaceTarget));
  if (!isExpectedBundleDir) {
    throw new Error(`Refusing to clean unexpected Tauri bundle directory: ${resolvedBundleRoot}`);
  }
  fs.rmSync(resolvedBundleRoot, { recursive: true, force: true });
}

function isPathInside(child, parent) {
  const relative = path.relative(parent, child);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function optionValue(args, longName, shortName) {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === longName || arg === shortName) return args[index + 1] ?? "";
    if (arg.startsWith(`${longName}=`)) return arg.slice(longName.length + 1);
    if (shortName && arg.startsWith(`${shortName}=`)) return arg.slice(shortName.length + 1);
  }
  return "";
}

const result = spawnSync("tauri", tauriArgs, {
  env,
  shell: true,
  stdio: "inherit",
});

process.exit(result.status ?? 1);
