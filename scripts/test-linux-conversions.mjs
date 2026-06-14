import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const platform = "linux-x64";
const requiredAdvancedEngines = ["pdfium", "libreoffice", "pandoc", "libvips"];
const env = {
  ...process.env,
  MULTI_CONVERTER_ENGINE_PLATFORM: platform,
  MULTI_CONVERTER_REQUIRE_ADVANCED_ENGINES: "1",
};

if (process.platform !== "linux" || process.arch !== "x64") {
  console.error(`Full Linux conversion validation must run on Linux x64, current host is ${process.platform}/${process.arch}.`);
  process.exit(1);
}

validateAdvancedEngineManifest();

runStep("Validating Linux build environment", "npm", ["run", "test:linux:environment"], env);
runStep("Preparing real Linux bundled engines", "npm", ["run", "prepare:bundled-engines"], env);
runStep("Validating real Linux sidecars and bundled engines", "npm", ["run", "test:linux:host"], env);
runStep("Running full conversion matrix on Linux", "npm", ["run", "test:conversions"], env);

console.log("Full Linux conversion validation passed with real Linux sidecars.");

function runStep(label, command, args, env) {
  console.log(`\n==> ${label}`);
  const result = spawnSync(command, args, {
    cwd: root,
    env,
    stdio: "inherit",
    shell: false,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function validateAdvancedEngineManifest() {
  const manifestPath = path.join(root, "src-tauri", "engines-manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const engines = Array.isArray(manifest.engines) ? manifest.engines : [];
  const failures = [];

  for (const id of requiredAdvancedEngines) {
    const engine = engines.find((item) => item.id === id && item.platform === platform && item.mode === "advanced");
    if (!engine) {
      failures.push(`Missing ${platform} advanced engine manifest entry for ${id}.`);
      continue;
    }
    if (engine.archiveType !== "zip") {
      failures.push(`${id}: Linux engine archiveType must be zip.`);
    }
    if (!engine.downloadUrl || String(engine.downloadUrl).includes("REPLACE_WITH_RELEASE_BASE_URL")) {
      failures.push(`${id}: Linux engine downloadUrl is not configured.`);
    }
    if (!/^[a-f0-9]{64}$/i.test(String(engine.sha256 ?? "")) || /^0{64}$/i.test(String(engine.sha256 ?? ""))) {
      failures.push(`${id}: Linux engine sha256 is missing or placeholder.`);
    }
    if (!Array.isArray(engine.binaryPaths) || engine.binaryPaths.length === 0) {
      failures.push(`${id}: Linux engine must declare binaryPaths.`);
    }
    for (const relative of engine.binaryPaths ?? []) {
      const normalized = normalizeManifestPath(relative, `${id}: Linux engine binaryPath`, failures).toLowerCase();
      if (/\.(app|bat|cmd|dll|dmg|dylib|exe|msi|pkg|ps1)(?:\/|$)/i.test(normalized)) {
        failures.push(`${id}: Linux engine binaryPaths must not reference non-Linux files (${relative}).`);
      }
    }
  }

  if (failures.length > 0) {
    console.error("Linux conversion validation is not ready:");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    console.error(
      "This gate is intentionally strict: do not claim all Linux conversions pass until real Linux sidecars and all Linux advanced engines are staged and tested.",
    );
    process.exit(1);
  }
}

function normalizeManifestPath(value, label, failures) {
  const normalized = String(value ?? "").replaceAll("\\", "/");
  if (!normalized || normalized.startsWith("/") || /^[A-Za-z]:\//.test(normalized)) {
    failures.push(`${label} must be a relative path: ${value ?? "<missing>"}.`);
    return "";
  }
  const parts = normalized.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) {
    failures.push(`${label} must not contain empty, current or parent path segments: ${value}.`);
    return "";
  }
  return normalized;
}
