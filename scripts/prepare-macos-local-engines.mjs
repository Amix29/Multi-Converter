import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import process from "node:process";

const root = process.cwd();
const args = parseArgs(process.argv.slice(2));
const outputDir = path.resolve(args.outputDir ?? path.join(root, "dist-engines-macos"));
const cacheDir = path.join(root, "engine-sources", ".bundled-engine-cache");
const sourceManifest = path.join(outputDir, "engines-manifest.json");
const targetManifest = path.join(root, "src-tauri", "engines-manifest.json");
const releaseBaseUrl = args.releaseBaseUrl ?? "https://local.invalid/multi-converter/macos/";
const env = {
  ...process.env,
  MULTI_CONVERTER_ENGINE_PLATFORM: "macos-universal",
};
let originalManifest = null;
let stagedManifest = false;

if (process.platform !== "darwin") {
  fail("Local macOS engine staging must run on macOS.");
}

try {
  originalManifest = await fs.readFile(targetManifest, "utf8");

  console.log("Preparing FFmpeg and ffprobe from configured macOS archives.");
  runNpm(["run", "prepare:ffmpeg-engine:macos"], env);

  console.log("Preparing upstream macOS engines: PDFium, LibreOffice and Pandoc.");
  runNpm(["run", "prepare:macos-upstream-engines"], env);

  await configureLibvips(env);

  console.log("Preparing libvips from portable macOS runtime inputs.");
  runNpm(["run", "prepare:libvips-engine:macos"], env);

  console.log("Packaging macOS engine archives.");
  runNpm(["run", "package:macos-engines", "--", "--release-base-url", releaseBaseUrl, "--output", outputDir], env);

  await stagePackagedEngines();

  console.log("Preparing bundled engines from the local cache.");
  runNpm(["run", "prepare:bundled-engines"], env);

  if (args.hostCheck) {
    console.log("Running macOS host validation.");
    runNpm(["run", "test:macos:host"], env);
  }

  if (args.conversions) {
    console.log("Running full macOS conversion validation.");
    runNpm(["run", "test:macos:conversions"], env);
  }

  console.log("Local macOS engine staging is ready.");
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  if (stagedManifest && !args.keepGeneratedManifest && originalManifest !== null) {
    await fs.writeFile(targetManifest, originalManifest, "utf8");
    console.log("Restored src-tauri/engines-manifest.json after local macOS validation.");
  }
}

if (stagedManifest && args.keepGeneratedManifest) {
  console.log("Generated macOS engines-manifest.json was kept in src-tauri for maintainer review.");
}
console.log("Do not commit generated engine manifests or archives without maintainer approval.");

async function configureLibvips(targetEnv) {
  if (args.libvipsAarch64Dir) targetEnv.LIBVIPS_MACOS_AARCH64_SOURCE_DIR = path.resolve(args.libvipsAarch64Dir);
  if (args.libvipsX86_64Dir) targetEnv.LIBVIPS_MACOS_X86_64_SOURCE_DIR = path.resolve(args.libvipsX86_64Dir);
  if (targetEnv.LIBVIPS_MACOS_AARCH64_SOURCE_DIR && targetEnv.LIBVIPS_MACOS_X86_64_SOURCE_DIR) return;

  if (!args.libvipsAarch64Archive || !args.libvipsX86_64Archive) {
    fail([
      "Missing libvips portable inputs.",
      "Provide --libvips-aarch64-dir and --libvips-x86_64-dir, or provide --libvips-aarch64-archive and --libvips-x86_64-archive.",
    ].join("\n"));
  }

  const libvipsOutDir = path.join(os.tmpdir(), "mc-local-libvips-macos-inputs");
  const output = runNode("scripts/prepare-libvips-macos-release-inputs.mjs", [
    "--out-dir", libvipsOutDir,
    "--aarch64-archive", path.resolve(args.libvipsAarch64Archive),
    "--x86_64-archive", path.resolve(args.libvipsX86_64Archive),
  ], targetEnv, { capture: true });

  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^(LIBVIPS_MACOS_(?:AARCH64|X86_64)_SOURCE_DIR)=(.+)$/);
    if (match) targetEnv[match[1]] = match[2];
  }

  if (!targetEnv.LIBVIPS_MACOS_AARCH64_SOURCE_DIR || !targetEnv.LIBVIPS_MACOS_X86_64_SOURCE_DIR) {
    fail("prepare-libvips-macos-release-inputs did not return both libvips source directories.");
  }
}

async function stagePackagedEngines() {
  await assertFile(sourceManifest, "macOS packaged engines manifest");
  await fs.mkdir(cacheDir, { recursive: true });
  await fs.copyFile(sourceManifest, targetManifest);
  stagedManifest = true;

  const manifest = JSON.parse(await fs.readFile(sourceManifest, "utf8"));
  const engines = (manifest.engines ?? []).filter((engine) => engine.platform === "macos-universal");
  if (engines.length === 0) {
    fail("Packaged manifest does not contain macos-universal engine entries.");
  }

  for (const engine of engines) {
    const archiveName = path.basename(new URL(engine.downloadUrl).pathname);
    const source = path.join(outputDir, archiveName);
    await assertFile(source, `${engine.id} macOS engine archive`);
    await fs.copyFile(source, path.join(cacheDir, `${engine.id}-${engine.version}.zip`));
  }
}

async function assertFile(filePath, label) {
  const stat = await fs.stat(filePath).catch(() => null);
  if (!stat?.isFile() || stat.size <= 0) {
    fail(`Missing or empty ${label}: ${filePath}`);
  }
}

function runNpm(npmArgs, commandEnv) {
  const result = spawnSync("npm", npmArgs, {
    cwd: root,
    env: commandEnv,
    shell: true,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw new Error(`npm ${npmArgs.join(" ")} failed with exit code ${result.status ?? 1}.`);
  }
}

function runNode(script, scriptArgs, commandEnv, options = {}) {
  const result = spawnSync(process.execPath, [script, ...scriptArgs], {
    cwd: root,
    env: commandEnv,
    encoding: "utf8",
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
  });
  if (result.status !== 0) {
    if (options.capture) {
      process.stderr.write(result.stderr || result.stdout);
    }
    throw new Error(`${script} failed with exit code ${result.status ?? 1}.`);
  }
  return result.stdout ?? "";
}

function parseArgs(rawArgs) {
  const parsed = {};
  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];
    if (arg === "--output-dir") parsed.outputDir = rawArgs[++index];
    else if (arg === "--release-base-url") parsed.releaseBaseUrl = rawArgs[++index];
    else if (arg === "--libvips-aarch64-archive") parsed.libvipsAarch64Archive = rawArgs[++index];
    else if (arg === "--libvips-x86_64-archive") parsed.libvipsX86_64Archive = rawArgs[++index];
    else if (arg === "--libvips-aarch64-dir") parsed.libvipsAarch64Dir = rawArgs[++index];
    else if (arg === "--libvips-x86_64-dir") parsed.libvipsX86_64Dir = rawArgs[++index];
    else if (arg === "--host-check") parsed.hostCheck = true;
    else if (arg === "--conversions") parsed.conversions = true;
    else if (arg === "--keep-generated-manifest") parsed.keepGeneratedManifest = true;
    else fail(`Unknown argument: ${arg}`);
  }
  return parsed;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
