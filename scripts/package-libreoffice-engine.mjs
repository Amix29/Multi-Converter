import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import process from "node:process";

const root = process.cwd();
const fullConfigPath = path.join(root, "tools", "engine-packages.config.json");
const libreOfficeConfigPath = path.join(root, "engine-sources", ".libreoffice-engine-packages.config.json");
const outputDir = path.join(root, "dist-engines-advanced");
const embeddedManifestPath = path.join(root, "src-tauri", "engines-manifest.json");
const releaseBaseUrl = requireReleaseBaseUrl();

const fullConfig = JSON.parse(await fs.readFile(fullConfigPath, "utf8"));
const libreOfficeConfig = {
  ...fullConfig,
  downloadBaseUrl: releaseBaseUrl,
  engines: fullConfig.engines.filter((engine) => engine.engineId === "libreoffice"),
};
if (libreOfficeConfig.engines.length !== 1) {
  throw new Error("Configuration LibreOffice introuvable dans tools/engine-packages.config.json.");
}

await fs.mkdir(path.dirname(libreOfficeConfigPath), { recursive: true });
await fs.writeFile(libreOfficeConfigPath, `${JSON.stringify(libreOfficeConfig, null, 2)}\n`, "utf8");

const result = spawnSync(
  process.execPath,
  [
    "scripts/package-engines.mjs",
    "--config",
    path.relative(root, libreOfficeConfigPath),
    "--output",
    path.relative(root, outputDir),
    "--release-base-url",
    releaseBaseUrl,
    "--no-clean",
  ],
  { cwd: root, stdio: "inherit", windowsHide: true },
);
if (result.status !== 0) process.exit(result.status ?? 1);

const generatedManifestPath = path.join(outputDir, "engines-manifest.json");
const generated = JSON.parse(await fs.readFile(generatedManifestPath, "utf8"));
const embedded = JSON.parse(await fs.readFile(embeddedManifestPath, "utf8"));
const generatedById = new Map(generated.engines.map((engine) => [engine.id, engine]));
embedded.generatedAt = generated.generatedAt;
embedded.engines = embedded.engines.map((engine) => generatedById.get(engine.id) ?? engine);
await fs.writeFile(embeddedManifestPath, `${JSON.stringify(embedded, null, 2)}\n`, "utf8");
await writeMergedAdvancedManifest(generatedManifestPath, embedded);
console.log(`Embedded manifest updated with LibreOffice from ${path.relative(root, generatedManifestPath)}`);

function requireReleaseBaseUrl() {
  const value = process.env.ENGINE_RELEASE_BASE_URL?.trim();
  if (!value) {
    throw new Error("ENGINE_RELEASE_BASE_URL is required before updating the embedded engine manifest. Use scripts/package-engines.mjs directly for local-only archives.");
  }
  if (!/^https:\/\/[^/\s]+\/.+/i.test(value)) {
    throw new Error("ENGINE_RELEASE_BASE_URL must be an HTTPS release asset base URL.");
  }
  return value;
}

async function writeMergedAdvancedManifest(target, embedded) {
  const advancedEngines = embedded.engines.filter((engine) => engine.mode === "advanced");
  await fs.writeFile(
    target,
    `${JSON.stringify({ manifestVersion: embedded.manifestVersion, generatedAt: embedded.generatedAt, engines: advancedEngines }, null, 2)}\n`,
    "utf8",
  );
}
