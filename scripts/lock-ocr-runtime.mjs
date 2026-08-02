import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const expectedUvVersion = "0.11.21";
const inventoryPath = path.join(root, "src-tauri", "ocr-runtime-licenses.json");
const outputPath = path.join(root, "tools", "ocr-runtime", "requirements-windows-x64.lock.txt");
const checkOnly = process.argv.includes("--check");

const uvVersion = spawnSync("uv", ["--version"], { encoding: "utf8", windowsHide: true });
if (uvVersion.status !== 0 || !uvVersion.stdout.trim().startsWith(`uv ${expectedUvVersion} `)) {
  throw new Error(`uv ${expectedUvVersion} est requis pour régénérer le verrou OCR.`);
}

const inventory = JSON.parse(await fs.readFile(inventoryPath, "utf8"));
const requirements = inventory.packages
  .map((entry) => `${entry.name}==${entry.version}`)
  .sort((left, right) => left.localeCompare(right, "en"))
  .join("\n");
const temporary = path.join(os.tmpdir(), `multi-converter-ocr-lock-${process.pid}.txt`);

try {
  const result = spawnSync("uv", [
    "pip",
    "compile",
    "-",
    "--generate-hashes",
    "--python-platform",
    "x86_64-pc-windows-msvc",
    "--python-version",
    "3.12.10",
    "--output-file",
    temporary,
  ], {
    cwd: root,
    encoding: "utf8",
    input: `${requirements}\n`,
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || "Résolution uv impossible.");

  const generated = normalizeHeader(await fs.readFile(temporary, "utf8"));
  if (checkOnly) {
    const current = await fs.readFile(outputPath, "utf8");
    if (current !== generated) throw new Error("Le verrou Python OCR n’est plus reproductible depuis l’inventaire.");
    console.log(`OCR Python lock is reproducible: ${inventory.packageCount} exact distributions.`);
  } else {
    await fs.writeFile(outputPath, generated);
    console.log(`OCR Python lock written: ${inventory.packageCount} exact distributions.`);
  }
} finally {
  await fs.rm(temporary, { force: true });
}

function normalizeHeader(source) {
  const lines = source.replaceAll("\r\n", "\n").split("\n");
  while (lines[0]?.startsWith("#")) lines.shift();
  return [
    "# Locked with uv 0.11.21 for CPython 3.12.10 on Windows x64.",
    "# Regenerate through scripts/lock-ocr-runtime.mjs; do not edit by hand.",
    ...lines,
  ].join("\n");
}
