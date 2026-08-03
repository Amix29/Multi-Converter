import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const check = process.argv.includes("--check");
const inventory = JSON.parse(await fs.readFile(path.join(root, "src-tauri", "ocr-runtime-licenses.json"), "utf8"));
const configurations = [
  { platform: "macos-aarch64", uvPlatform: "aarch64-apple-darwin", includePaddle: true },
  { platform: "macos-x86_64", uvPlatform: "x86_64-apple-darwin", includePaddle: false },
  { platform: "linux-x64", uvPlatform: "x86_64-unknown-linux-gnu", includePaddle: true },
];

assertUv();
for (const configuration of configurations) await prepare(configuration);
await prepareIntelBuildLock();
console.log(`OCR platform dependency locks are reproducible for ${configurations.map((item) => item.platform).join(", ")}.`);

async function prepare(configuration) {
  const requirements = inventory.packages
    .filter((entry) => configuration.includePaddle || entry.name !== "paddlepaddle")
    .map((entry) => `${entry.name}==${entry.version}`)
    .sort((left, right) => left.localeCompare(right, "en"))
    .join("\n");
  const temporary = path.join(os.tmpdir(), `mc-ocr-${configuration.platform}-${process.pid}.txt`);
  const target = path.join(root, "tools", "ocr-runtime", `requirements-${configuration.platform}.lock.txt`);
  try {
    const result = spawnSync("uv", [
      "pip", "compile", "-", "--generate-hashes", "--python-platform", configuration.uvPlatform,
      "--python-version", "3.12.10", "--output-file", temporary,
    ], { cwd: root, encoding: "utf8", input: `${requirements}\n`, windowsHide: true });
    if (result.status !== 0) throw new Error(result.stderr || result.stdout || `Résolution ${configuration.platform} impossible.`);
    const generated = normalizeHeader(await fs.readFile(temporary, "utf8"), configuration);
    if (check) {
      const current = await fs.readFile(target, "utf8");
      if (current !== generated) throw new Error(`Le verrou ${configuration.platform} n’est plus reproductible.`);
    } else {
      await fs.writeFile(target, generated);
    }
  } finally {
    await fs.rm(temporary, { force: true });
  }
}

async function prepareIntelBuildLock() {
  const configuration = { platform: "macos-x86_64", uvPlatform: "x86_64-apple-darwin" };
  const requirements = [
    "httpx==0.28.1",
    "networkx==3.6.1",
    "numpy==2.3.5",
    "opt_einsum==3.3.0",
    "Pillow==12.3.0",
    "protobuf==7.35.1",
    "safetensors==0.8.0",
    "setuptools==83.0.0",
    "typing_extensions==4.16.0",
    "wheel==0.46.3",
  ].join("\n");
  const temporary = path.join(os.tmpdir(), `mc-ocr-paddle-build-${process.pid}.txt`);
  const target = path.join(root, "tools", "ocr-runtime", "paddle-build-macos-x86_64.lock.txt");
  try {
    const result = spawnSync("uv", [
      "pip", "compile", "-", "--generate-hashes", "--python-platform", configuration.uvPlatform,
      "--python-version", "3.12.10", "--output-file", temporary,
    ], { cwd: root, encoding: "utf8", input: `${requirements}\n`, windowsHide: true });
    if (result.status !== 0) throw new Error(result.stderr || result.stdout || "Résolution des dépendances de build Intel impossible.");
    const lines = (await fs.readFile(temporary, "utf8")).replaceAll("\r\n", "\n").split("\n");
    while (lines[0]?.startsWith("#")) lines.shift();
    const generated = [
      "# Locked with uv 0.11.21 for the PaddlePaddle 3.3.1 macOS Intel source build.",
      "# Official PaddlePaddle python/requirements.txt prerequisites plus wheel.",
      "# Regenerate through scripts/prepare-ocr-platform-locks.mjs; do not edit by hand.",
      ...lines,
    ].join("\n");
    if (check) {
      const current = await fs.readFile(target, "utf8");
      if (current !== generated) throw new Error("Le verrou de build PaddlePaddle Intel n’est plus reproductible.");
    } else {
      await fs.writeFile(target, generated);
    }
  } finally {
    await fs.rm(temporary, { force: true });
  }
}

function normalizeHeader(source, configuration) {
  const lines = source.replaceAll("\r\n", "\n").split("\n");
  while (lines[0]?.startsWith("#")) lines.shift();
  return [
    `# Locked with uv 0.11.21 for CPython 3.12.10 on ${configuration.platform}.`,
    configuration.includePaddle
      ? "# PaddlePaddle 3.3.1 is resolved from its official platform wheel."
      : "# PaddlePaddle 3.3.1 is installed separately from the exact source-built Intel wheel.",
    "# Regenerate through scripts/prepare-ocr-platform-locks.mjs; do not edit by hand.",
    ...lines,
  ].join("\n");
}

function assertUv() {
  const result = spawnSync("uv", ["--version"], { encoding: "utf8", windowsHide: true });
  if (result.status !== 0 || !result.stdout.trim().startsWith("uv 0.11.21 ")) {
    throw new Error(`uv 0.11.21 est requis, obtenu: ${result.stdout.trim() || "indisponible"}.`);
  }
}
