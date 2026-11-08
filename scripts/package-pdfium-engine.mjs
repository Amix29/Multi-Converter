import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import process from "node:process";
import { sha256File } from "./lib/engine-package-files.mjs";

const root = process.cwd();
const fullConfigPath = path.join(root, "tools", "engine-packages.config.json");
const pdfiumConfigPath = path.join(root, "engine-sources", ".pdfium-engine-packages.config.json");
const outputDir = path.join(root, "dist-engines-advanced");
const provenancePath = path.join(root, "tools", "pdfium-windows-x64.lock.json");
const provenance = JSON.parse(await fs.readFile(provenancePath, "utf8"));
const manifestBaseUrl = provenance.package.manifestBaseUrl;

const fullConfig = JSON.parse(await fs.readFile(fullConfigPath, "utf8"));
const pdfiumConfig = {
  ...fullConfig,
  downloadBaseUrl: manifestBaseUrl,
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
    manifestBaseUrl,
  ],
  { cwd: root, stdio: "inherit", windowsHide: true },
);
if (result.status !== 0) process.exit(result.status ?? 1);

const generatedManifestPath = path.join(outputDir, "engines-manifest.json");
const generated = JSON.parse(await fs.readFile(generatedManifestPath, "utf8"));
await writeChecksum(generatedManifestPath, generated.engines[0]);
console.log(`Unpublished PDFium candidate written to ${path.relative(root, outputDir)}; embedded manifest left unchanged.`);

async function writeChecksum(manifestPath, engine) {
  const archivePath = path.join(outputDir, provenance.package.archiveName);
  const actual = await sha256File(archivePath);
  if (engine.sha256 !== actual) throw new Error("Le manifeste PDFium ne correspond pas a l'archive generee.");
  if (actual !== provenance.package.archiveSha256 || engine.compressedSizeBytes !== provenance.package.archiveSizeBytes) {
    throw new Error(`L'archive PDFium generee ne correspond pas au verrou candidat: ${engine.compressedSizeBytes} octets, SHA-256 ${actual}, taille installee ${engine.installedSizeBytes}.`);
  }
  if (engine.installedSizeBytes !== provenance.package.installedSizeBytes) {
    throw new Error("La taille installee PDFium ne correspond pas au verrou candidat.");
  }
  const checksumPath = `${archivePath}.sha256`;
  await fs.writeFile(checksumPath, `${actual}  ${path.basename(archivePath)}\n`, "utf8");
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  if (manifest.engines.length !== 1 || manifest.engines[0].id !== "pdfium") {
    throw new Error("Le manifeste candidat doit contenir uniquement PDFium.");
  }
}
