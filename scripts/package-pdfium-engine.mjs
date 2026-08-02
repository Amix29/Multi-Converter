import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import process from "node:process";
import { sha256File } from "./lib/engine-package-files.mjs";

const root = process.cwd();
const fullConfigPath = path.join(root, "tools", "engine-packages.config.json");
const pdfiumConfigPath = path.join(root, "engine-sources", ".pdfium-engine-packages.config.json");
const outputDir = path.join(root, "dist-engines-advanced");
const embeddedManifestPath = path.join(root, "src-tauri", "engines-manifest.json");
const provenancePath = path.join(root, "tools", "pdfium-windows-x64.lock.json");
const provenance = JSON.parse(await fs.readFile(provenancePath, "utf8"));
const releaseBaseUrl = provenance.package.releaseBaseUrl;

const fullConfig = JSON.parse(await fs.readFile(fullConfigPath, "utf8"));
const pdfiumConfig = {
  ...fullConfig,
  downloadBaseUrl: releaseBaseUrl,
  generatedAt: provenance.package.deterministicTimestamp,
  engines: fullConfig.engines
    .filter((engine) => engine.engineId === "pdfium")
    .map((engine) => ({ ...engine, createdAt: provenance.package.deterministicTimestamp })),
};
if (pdfiumConfig.engines.length !== 1) {
  throw new Error("Configuration PDFium introuvable dans tools/engine-packages.config.json.");
}

await fs.mkdir(path.dirname(pdfiumConfigPath), { recursive: true });
await fs.writeFile(pdfiumConfigPath, `${JSON.stringify(pdfiumConfig, null, 2)}\n`, "utf8");

const result = spawnSync(
  process.execPath,
  [
    "scripts/package-engines.mjs",
    "--config",
    path.relative(root, pdfiumConfigPath),
    "--output",
    path.relative(root, outputDir),
    "--release-base-url",
    releaseBaseUrl,
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
await writeChecksum(generatedManifestPath, generated.engines[0]);
console.log(`Embedded manifest updated with PDFium from ${path.relative(root, generatedManifestPath)}`);

async function writeChecksum(manifestPath, engine) {
  const archivePath = path.join(outputDir, provenance.package.archiveName);
  const actual = await sha256File(archivePath);
  if (engine.sha256 !== actual) throw new Error("Le manifeste PDFium ne correspond pas a l'archive generee.");
  if (actual !== provenance.package.archiveSha256 || engine.compressedSizeBytes !== provenance.package.archiveSizeBytes) {
    throw new Error("L'archive PDFium generee ne correspond pas au verrou de prerelease.");
  }
  if (engine.installedSizeBytes !== provenance.package.installedSizeBytes) {
    throw new Error("La taille installee PDFium ne correspond pas au verrou de prerelease.");
  }
  const checksumPath = `${archivePath}.sha256`;
  await fs.writeFile(checksumPath, `${actual}  ${path.basename(archivePath)}\n`, "utf8");
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  if (manifest.engines.length !== 1 || manifest.engines[0].id !== "pdfium") {
    throw new Error("Le manifeste de prerelease doit contenir uniquement PDFium.");
  }
}
