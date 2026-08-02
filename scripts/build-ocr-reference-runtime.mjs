import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { readPlatformProvenance } from "./lib/platform-provenance.mjs";

const root = process.cwd();
const args = parseArgs(process.argv.slice(2));
const platform = args.platform ?? hostPlatform();
assertHost(platform);
const provenance = await readPlatformProvenance(root);

const buildRoot = path.join(root, "engine-sources", "ocr-runtime", platform);
const environment = path.join(buildRoot, ".venv");
const python = path.join(environment, process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
const requirementsName = platform === "macos-x86_64"
  ? "requirements-macos-x86_64.lock.txt"
  : "requirements-windows-x64.lock.txt";
const requirements = path.join(root, "tools", "ocr-runtime", requirementsName);
if (args.install) {
  assertToolVersion("uv", ["--version"], "uv 0.11.21");
  await fs.mkdir(buildRoot, { recursive: true });
  run("uv", ["venv", "--python", "3.12.10", environment]);
  run("uv", [
    "pip", "install", "--python", python, "--require-hashes", "--only-binary", ":all:", "-r", requirements,
  ]);
  if (platform === "macos-x86_64") await installSourceBuiltPaddle(python, provenance);
}
await assertFile(python, "environnement Python OCR verrouillé (utilisez --install pour le préparer)");
run(python, ["-c", "import paddle; paddle.utils.run_check(); assert paddle.__version__ == '3.3.1'"]);
await fs.rm(path.join(buildRoot, "build"), { recursive: true, force: true });
await fs.rm(path.join(buildRoot, "dist"), { recursive: true, force: true });

run(python, [
  "-m", "PyInstaller", "--noconfirm", "--clean", "--onedir", "--name", "ocr-worker",
  "--collect-all", "paddle", "--collect-all", "paddleocr", "--collect-all", "paddlex",
  "--distpath", path.join(buildRoot, "dist"), "--workpath", path.join(buildRoot, "build"),
  "--specpath", buildRoot, path.join(root, "tools", "ocr-runtime", "worker.py"),
]);

const sitePackages = commandOutput(python, ["-c", "import sysconfig; print(sysconfig.get_paths()['purelib'])"]);
const internal = path.join(buildRoot, "dist", "ocr-worker", "_internal");
for (const entry of await fs.readdir(sitePackages, { withFileTypes: true })) {
  if (entry.isDirectory() && entry.name.endsWith(".dist-info")) {
    await fs.cp(path.join(sitePackages, entry.name), path.join(internal, entry.name), {
      recursive: true,
      force: true,
    });
  }
}
await fs.writeFile(path.join(buildRoot, "dist", "ocr-worker", "build-provenance.json"), `${JSON.stringify({
  schemaVersion: 1,
  platform,
  runtime: "official",
  provider: "cpu",
  python: "3.12.10",
  uv: "0.11.21",
  requirements: requirementsName,
  paddlepaddle: provenance.ocr.paddlepaddle,
}, null, 2)}\n`);
console.log(`Runtime officiel ${platform} construit. Exécutez npm run prepare:ocr-runtime pour le verrouiller.`);

function parseArgs(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === "--platform") parsed.platform = values[++index];
    else if (value === "--install") parsed.install = true;
    else if (value === "--paddle-wheel") parsed.paddleWheel = values[++index];
    else throw new Error(`Argument de build OCR inconnu: ${value}`);
  }
  return parsed;
}

function hostPlatform() {
  if (process.platform === "win32" && process.arch === "x64") return "windows-x64";
  if (process.platform === "darwin" && process.arch === "arm64") return "macos-aarch64";
  if (process.platform === "darwin" && process.arch === "x64") return "macos-x86_64";
  if (process.platform === "linux" && process.arch === "x64") return "linux-x64";
  throw new Error(`Plateforme OCR non prise en charge: ${process.platform}/${process.arch}.`);
}

function assertHost(platform) {
  if (platform !== hostPlatform()) throw new Error(`${platform} doit être construit sur son hôte natif.`);
}

async function installSourceBuiltPaddle(python, provenance) {
  if (!args.paddleWheel) throw new Error("--paddle-wheel est obligatoire pour macOS Intel.");
  const wheel = path.resolve(args.paddleWheel);
  await assertFile(wheel, "wheel PaddlePaddle Intel compilée depuis la source");
  const digest = createHash("sha256").update(await fs.readFile(wheel)).digest("hex");
  const sidecar = `${wheel}.sha256`;
  const expected = (await fs.readFile(sidecar, "utf8")).trim().split(/\s+/u)[0]?.toLowerCase();
  if (!/^[a-f0-9]{64}$/u.test(expected ?? "") || digest !== expected) {
    throw new Error("La wheel PaddlePaddle Intel ne correspond pas à son empreinte de build.");
  }
  if (provenance.ocr.paddlepaddle.platforms[platform].sourceCommit !== provenance.ocr.paddlepaddle.source.commit) {
    throw new Error("La provenance PaddlePaddle Intel est incohérente.");
  }
  run("uv", ["pip", "install", "--python", python, "--no-deps", wheel]);
}

function run(command, commandArgs) {
  const result = spawnSync(command, commandArgs, { cwd: root, stdio: "inherit", windowsHide: true });
  if (result.status !== 0) throw new Error(`Échec de ${command} (${result.status ?? "signal"}).`);
}

function commandOutput(command, commandArgs) {
  const result = spawnSync(command, commandArgs, { cwd: root, encoding: "utf8", windowsHide: true });
  if (result.status !== 0) throw new Error(result.stderr || `Échec de ${command}.`);
  return result.stdout.trim();
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
