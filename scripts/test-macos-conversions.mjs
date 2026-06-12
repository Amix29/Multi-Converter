import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const binariesDir = path.join(root, "src-tauri", "binaries");
const manifestPath = path.join(root, "src-tauri", "engines-manifest.json");
const platform = "macos-universal";
const sidecarMarker = "Multi-Converter CI placeholder sidecar for Tauri compile checks only.";
const requiredTriples = ["aarch64-apple-darwin", "x86_64-apple-darwin"];
const requiredSidecars = ["ffmpeg", "ffprobe"];
const requiredAdvancedEngines = ["pdfium", "libreoffice", "pandoc", "libvips"];
const failures = [];

if (process.platform !== "darwin") {
  fail("Full macOS conversion validation must run on macOS. Use a real Mac or GitHub Actions macos-latest.");
}

requireCommand("xcode-select", ["-p"], "Xcode Command Line Tools are required.");
requireCommand("xcrun", ["-find", "lipo"], "lipo is required to validate macOS sidecar architectures.");

const manifest = readJson(manifestPath);
validateSidecarInputs();
validateAdvancedEngineManifest();
flushFailures();

const env = {
  ...process.env,
  MULTI_CONVERTER_ENGINE_PLATFORM: platform,
};

runStep("Preparing real macOS bundled engines", "npm", ["run", "prepare:bundled-engines"], env);
runStep("Validating macOS sidecars and bundled engines", "npm", ["run", "test:macos:host"], env);
runStep("Running PDFium wrapper runtime tests with macOS PDFium", "npm", ["run", "test:pdfium-wrapper"], env);
runStep("Running full conversion matrix on macOS", "npm", ["run", "test:conversions"], env);

console.log("Full macOS conversion validation passed with real macOS sidecars and bundled engines.");

function validateSidecarInputs() {
  for (const stem of requiredSidecars) {
    for (const triple of requiredTriples) {
      const filePath = path.join(binariesDir, `${stem}-${triple}`);
      validateExecutableInput(`${stem}-${triple}`, filePath);
      validateArch(`${stem}-${triple}`, filePath, triple === "aarch64-apple-darwin" ? "arm64" : "x86_64");
    }
  }
}

function validateExecutableInput(label, filePath) {
  const stat = fs.statSync(filePath, { throwIfNoEntry: false });
  if (!stat?.isFile() || stat.size <= 0) {
    failures.push(`Missing real macOS sidecar input: ${path.relative(root, filePath)}`);
    return;
  }
  if ((stat.mode & 0o111) === 0) {
    failures.push(`macOS sidecar input is not executable: ${path.relative(root, filePath)}`);
  }
  if (startsWithPlaceholderMarker(filePath)) {
    failures.push(`${label} is a CI placeholder, not a real conversion sidecar: ${path.relative(root, filePath)}`);
  }
}

function validateArch(label, filePath, arch) {
  if (!fs.existsSync(filePath) || startsWithPlaceholderMarker(filePath)) return;
  const result = spawnSync("lipo", ["-verify_arch", arch, filePath], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    failures.push(`${label} does not contain ${arch}: ${result.stderr || result.stdout || path.relative(root, filePath)}`);
  }
}

function validateAdvancedEngineManifest() {
  const engines = Array.isArray(manifest.engines) ? manifest.engines : [];
  for (const id of requiredAdvancedEngines) {
    const engine = engines.find((item) => item.id === id && item.platform === platform && item.mode === "advanced");
    if (!engine) {
      failures.push(`Missing ${platform} advanced engine manifest entry for ${id}.`);
      continue;
    }
    if (engine.archiveType !== "zip") {
      failures.push(`${id}: macOS engine archiveType must be zip.`);
    }
    if (!engine.downloadUrl || String(engine.downloadUrl).includes("REPLACE_WITH_RELEASE_BASE_URL")) {
      failures.push(`${id}: macOS engine downloadUrl is not configured.`);
    }
    if (!/^[a-f0-9]{64}$/i.test(String(engine.sha256 ?? "")) || /^0{64}$/i.test(String(engine.sha256 ?? ""))) {
      failures.push(`${id}: macOS engine sha256 is missing or placeholder.`);
    }
    if (!Array.isArray(engine.binaryPaths) || engine.binaryPaths.length === 0) {
      failures.push(`${id}: macOS engine must declare binaryPaths.`);
    }
    for (const relative of engine.binaryPaths ?? []) {
      const normalized = String(relative).replaceAll("\\", "/").toLowerCase();
      if (normalized.endsWith(".exe") || normalized.endsWith(".dll")) {
        failures.push(`${id}: macOS engine binaryPaths must not reference Windows files (${relative}).`);
      }
    }
  }
}

function startsWithPlaceholderMarker(filePath) {
  try {
    const buffer = Buffer.alloc(sidecarMarker.length + 128);
    const fd = fs.openSync(filePath, "r");
    try {
      const bytesRead = fs.readSync(fd, buffer, 0, buffer.length, 0);
      return buffer.subarray(0, bytesRead).toString("utf8").includes(sidecarMarker);
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return false;
  }
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    fail(`Unable to read ${path.relative(root, filePath)}: ${error.message}`);
  }
}

function requireCommand(command, args, message) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    failures.push(`${message}\n${result.stderr || result.stdout || `${command} failed.`}`);
  }
}

function runStep(label, command, args, env) {
  console.log(`\n==> ${label}`);
  const result = spawnSync(command, args, {
    cwd: root,
    env,
    shell: true,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function flushFailures() {
  if (!failures.length) return;
  console.error("macOS conversion validation is not ready:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  console.error(
    "This gate is intentionally strict: do not claim all macOS conversions pass until real macOS sidecars and all macOS advanced engines are staged and tested.",
  );
  process.exit(1);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
