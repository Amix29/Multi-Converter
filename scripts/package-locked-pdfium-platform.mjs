import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { readPlatformProvenance } from "./lib/platform-provenance.mjs";

const root = process.cwd();
const args = parseArgs(process.argv.slice(2));
const platform = args.platform;
if (!new Set(["macos-aarch64", "linux-x64"]).has(platform) || !args.outputDir || !args.evidence) {
  throw new Error("--platform macos-aarch64|linux-x64, --output-dir et --evidence sont requis.");
}

const provenance = await readPlatformProvenance(root);
const lockedPlatform = provenance.pdfium.platforms[platform];

const configName = platform === "macos-aarch64"
  ? "engine-packages.macos.config.json" : "engine-packages.linux.config.json";
const fullConfig = JSON.parse(await fs.readFile(path.join(root, "tools", configName), "utf8"));
const pdfium = fullConfig.engines.find((entry) => entry.engineId === "pdfium");
if (!pdfium?.createdAt) throw new Error(`${platform}: horodatage déterministe PDFium absent.`);
const config = { ...fullConfig, generatedAt: pdfium.createdAt, engines: [pdfium] };
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "mc-pdfium-platform-package-"));
try {
  const configPath = path.join(temporary, "config.json");
  const first = path.join(temporary, "first");
  const second = path.join(temporary, "second");
  await fs.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
  packageOnce(configPath, first);
  packageOnce(configPath, second);
  const archiveName = pdfium.outputArchiveName;
  const firstHash = await sha256(path.join(first, archiveName));
  const secondHash = await sha256(path.join(second, archiveName));
  if (firstHash !== secondHash) throw new Error(`${platform}: deux archives PDFium consécutives diffèrent.`);
  const output = path.resolve(args.outputDir);
  await fs.rm(output, { recursive: true, force: true });
  await fs.cp(second, output, { recursive: true, force: true });
  const manifest = JSON.parse(await fs.readFile(path.join(second, "engines-manifest.json"), "utf8"));
  const engine = manifest.engines?.find((entry) => entry.id === "pdfium");
  if (!engine || engine.sha256 !== secondHash) throw new Error(`${platform}: manifeste PDFium incohérent.`);
  const wrapperRelative = pdfium.binaryPaths.find((entry) => path.posix.basename(entry).startsWith("pdfium-render"));
  if (!wrapperRelative) throw new Error(`${platform}: wrapper PDFium absent de la configuration.`);
  const wrapperPath = path.join(root, pdfium.sourceDir, ...wrapperRelative.split("/"));
  const wrapperStat = await fs.stat(wrapperPath);
  const evidence = {
    schemaVersion: 1,
    platform,
    upstream: {
      version: provenance.pdfium.version,
      tag: provenance.pdfium.tag,
      archiveSha256: lockedPlatform.sha256,
      librarySha256: lockedPlatform.librarySha256,
    },
    wrapper: {
      version: provenance.pdfium.wrapperVersion,
      cargoLockSha256: provenance.pdfium.wrapperCargoLockSha256,
      buildRustVersion: provenance.pdfium.wrapperBuildRustVersion,
      fileName: path.basename(wrapperPath),
      sizeBytes: wrapperStat.size,
      sha256: await sha256(wrapperPath),
    },
    package: {
      status: lockedPlatform.package.status,
      reproducible: true,
      archiveName,
      archiveSizeBytes: (await fs.stat(path.join(second, archiveName))).size,
      archiveSha256: secondHash,
      installedSizeBytes: engine.installedSizeBytes,
    },
  };
  assertPackageLock(evidence, lockedPlatform.package);
  const evidencePath = path.resolve(args.evidence);
  await fs.mkdir(path.dirname(evidencePath), { recursive: true });
  await fs.writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  console.log(`${platform}: PDFium packaged reproducibly as ${archiveName} (${secondHash}).`);
} finally {
  await fs.rm(temporary, { recursive: true, force: true });
}

function parseArgs(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] === "--platform") parsed.platform = values[++index];
    else if (values[index] === "--output-dir") parsed.outputDir = values[++index];
    else if (values[index] === "--evidence") parsed.evidence = values[++index];
    else throw new Error(`Argument PDFium inconnu: ${values[index]}`);
  }
  return parsed;
}

function packageOnce(configPath, output) {
  const result = spawnSync(process.execPath, [path.join(root, "scripts", "package-engines.mjs"), "--config", configPath, "--output", output], {
    cwd: root, stdio: "inherit",
  });
  if (result.status !== 0) throw new Error(`Échec de l’empaquetage PDFium (${result.status ?? "signal"}).`);
}

async function sha256(filePath) {
  return createHash("sha256").update(await fs.readFile(filePath)).digest("hex");
}

function assertPackageLock(evidence, locked) {
  if (locked.status === "pending-native-rebuild") {
    for (const field of ["archiveSizeBytes", "archiveSha256", "installedSizeBytes", "wrapperSizeBytes", "wrapperSha256"]) {
      if (locked[field] !== null) throw new Error(`${evidence.platform}: ${field} doit rester nul tant que la reconstruction native n'est pas vérifiée.`);
    }
    return;
  }
  if (locked.status !== "verified") throw new Error(`${evidence.platform}: statut de paquet PDFium inconnu.`);
  const comparisons = {
    archiveName: evidence.package.archiveName,
    archiveSizeBytes: evidence.package.archiveSizeBytes,
    archiveSha256: evidence.package.archiveSha256,
    installedSizeBytes: evidence.package.installedSizeBytes,
    wrapperSizeBytes: evidence.wrapper.sizeBytes,
    wrapperSha256: evidence.wrapper.sha256,
  };
  for (const [field, actual] of Object.entries(comparisons)) {
    if (locked[field] !== actual) throw new Error(`${evidence.platform}: ${field} diffère du verrou natif vérifié.`);
  }
}
