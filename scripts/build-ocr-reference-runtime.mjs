import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const args = parseArgs(process.argv.slice(2));
if ((args.platform ?? "windows-x64") !== "windows-x64" || process.platform !== "win32") {
  throw new Error("Ce constructeur de référence produit uniquement le runtime Windows x64.");
}

const buildRoot = path.join(root, "engine-sources", "ocr-runtime", "windows-x64");
const environment = path.join(buildRoot, ".venv");
const python = path.join(environment, "Scripts", "python.exe");
const requirements = path.join(root, "tools", "ocr-runtime", "requirements-windows-x64.lock.txt");
if (args.install) {
  assertToolVersion("uv", ["--version"], "uv 0.11.21");
  run("uv", ["venv", "--python", "3.12.10", environment]);
  run("uv", [
    "pip", "install", "--python", python, "--require-hashes", "--only-binary", ":all:", "-r", requirements,
  ]);
}
await assertFile(python, "environnement Python OCR verrouillé (utilisez --install pour le préparer)");
await fs.rm(path.join(buildRoot, "build"), { recursive: true, force: true });
await fs.rm(path.join(buildRoot, "dist"), { recursive: true, force: true });

run(python, [
  "-m", "PyInstaller", "--noconfirm", "--clean", "--onedir", "--name", "ocr-worker",
  "--collect-all", "paddle", "--collect-all", "paddleocr", "--collect-all", "paddlex",
  "--distpath", path.join(buildRoot, "dist"), "--workpath", path.join(buildRoot, "build"),
  "--specpath", buildRoot, path.join(root, "tools", "ocr-runtime", "worker.py"),
]);

const sitePackages = path.join(environment, "Lib", "site-packages");
const internal = path.join(buildRoot, "dist", "ocr-worker", "_internal");
for (const entry of await fs.readdir(sitePackages, { withFileTypes: true })) {
  if (entry.isDirectory() && entry.name.endsWith(".dist-info")) {
    await fs.cp(path.join(sitePackages, entry.name), path.join(internal, entry.name), {
      recursive: true,
      force: true,
    });
  }
}
console.log("Runtime officiel Windows construit. Exécutez npm run prepare:ocr-runtime pour le verrouiller et le mettre en paquet.");

function parseArgs(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === "--platform") parsed.platform = values[++index];
    else if (value === "--install") parsed.install = true;
    else throw new Error(`Argument de build OCR inconnu: ${value}`);
  }
  return parsed;
}

function run(command, commandArgs) {
  const result = spawnSync(command, commandArgs, { cwd: root, stdio: "inherit", windowsHide: true });
  if (result.status !== 0) throw new Error(`Échec de ${command} (${result.status ?? "signal"}).`);
}

function assertToolVersion(command, commandArgs, expected) {
  const result = spawnSync(command, commandArgs, { cwd: root, encoding: "utf8", windowsHide: true });
  if (result.status !== 0 || !result.stdout.trim().startsWith(`${expected} `)) {
    throw new Error(`${command}: version attendue ${expected}, obtenue ${result.stdout.trim() || "indisponible"}.`);
  }
}

async function assertFile(filePath, label) {
  const stat = await fs.stat(filePath).catch(() => null);
  if (!stat?.isFile()) throw new Error(`${label}: ${filePath}`);
}
