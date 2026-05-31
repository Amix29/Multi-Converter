import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import process from "node:process";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const fullConfigPath = path.join(root, "tools", "engine-packages.config.json");
const baseConfigPath = path.join(root, "engine-sources", ".base-engine-packages.config.json");
const outputDir = path.join(root, "dist-engines-base");
const embeddedManifestPath = path.join(root, "src-tauri", "engines-manifest.json");

const fullConfig = JSON.parse(await fs.readFile(fullConfigPath, "utf8"));
const baseConfig = {
  ...fullConfig,
  downloadBaseUrl: fileBaseUrl(outputDir),
  engines: fullConfig.engines.filter((engine) => engine.mode === "base"),
};
await fs.mkdir(path.dirname(baseConfigPath), { recursive: true });
await fs.writeFile(baseConfigPath, `${JSON.stringify(baseConfig, null, 2)}\n`, "utf8");

const result = spawnSync(
  process.execPath,
  [
    "scripts/package-engines.mjs",
    "--config",
    path.relative(root, baseConfigPath),
    "--output",
    path.relative(root, outputDir),
    "--release-base-url",
    fileBaseUrl(outputDir),
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
console.log(`Embedded manifest updated with base engines from ${path.relative(root, generatedManifestPath)}`);

function fileBaseUrl(dir) {
  return `${pathToFileURL(path.resolve(dir)).href}/`;
}
