import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { bundleWindows } from "./lib/windows-bundle.mjs";

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
const isMacosBuild = command === "build" && explicitTarget?.endsWith("-apple-darwin");

if (isMacosBuild && explicitTarget !== "aarch64-apple-darwin") {
  console.error("Only Apple Silicon aarch64-apple-darwin macOS builds are supported.");
  process.exit(1);
}

if (isMacosBuild && (process.platform !== "darwin" || process.arch !== "arm64") && env.MULTI_CONVERTER_ALLOW_NON_DARWIN_MACOS_BUILD !== "1") {
  console.error("macOS Apple Silicon DMG builds must run on an Apple Silicon Mac. Use a Mac or GitHub Actions macos-latest runner.");
  process.exit(1);
}

if (command === "build" || command === "bundle") {
  preserveBundleArtifacts(env.CARGO_TARGET_DIR);
}

// Compile without copying gigabytes into target/release; the standalone
// bundler reads the verified resources directly from their staging roots.
if (process.platform === "win32" && command === "build" && extraArgs.length === 0) {
  const compileConfig = path.join(os.tmpdir(), `mc-tauri-compile-${process.pid}.json`);
  fs.writeFileSync(compileConfig, JSON.stringify({ bundle: { resources: [], externalBin: [], createUpdaterArtifacts: false } }));
  try {
    const compile = invoke(["build", "--no-bundle", "--config", compileConfig]);
    if (compile.status !== 0) process.exitCode = compile.status ?? 1;
    else process.exitCode = bundleWindows(invoke, env).status ?? 1;
  } finally {
    fs.unlinkSync(compileConfig);
  }
} else if (process.platform === "win32" && command === "bundle" && extraArgs.length === 0) {
  process.exitCode = bundleWindows(invoke, env).status ?? 1;
} else {

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

const result = invoke(tauriArgs);
process.exitCode = result.status ?? 1;
}

function preserveBundleArtifacts(targetDir) {
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
  const preserved = `${resolvedBundleRoot}-preserved-${Date.now()}`;
  fs.renameSync(resolvedBundleRoot, preserved);
  console.log(`Preserved previous bundle by moving it to ${preserved}`);
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

function invoke(args) {
  return spawnSync("tauri", args, {
  env,
  shell: true,
  stdio: "inherit",
});
}
