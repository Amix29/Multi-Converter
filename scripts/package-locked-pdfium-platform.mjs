import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const args = parseArgs(process.argv.slice(2));
const platform = args.platform;
if (!new Set(["macos-universal", "linux-x64"]).has(platform) || !args.outputDir) {
  throw new Error("--platform macos-universal|linux-x64 et --output-dir sont requis.");
}

const configName = platform === "macos-universal"
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
  console.log(`${platform}: PDFium packaged reproducibly as ${archiveName} (${secondHash}).`);
} finally {
  await fs.rm(temporary, { recursive: true, force: true });
}

function parseArgs(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] === "--platform") parsed.platform = values[++index];
    else if (values[index] === "--output-dir") parsed.outputDir = values[++index];
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
