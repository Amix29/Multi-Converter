import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "mc-ocr-package-test-"));
const platform = process.platform === "win32" ? "windows-x64"
  : process.platform === "darwin" ? (process.arch === "arm64" ? "macos-aarch64" : "macos-x86_64")
    : "linux-x64";
const source = path.join(temporary, "source");
const first = path.join(temporary, "first");
const second = path.join(temporary, "second");

try {
  fs.mkdirSync(path.join(source, "nested"), { recursive: true });
  const worker = platform === "windows-x64" ? "ocr-worker.exe" : "ocr-worker";
  fs.writeFileSync(path.join(source, worker), Buffer.from("phase-8-worker-fixture\n"));
  fs.writeFileSync(path.join(source, "nested", "license.txt"), Buffer.from("fixture license\n"));
  if (process.platform !== "win32") fs.chmodSync(path.join(source, worker), 0o755);

  prepare(first);
  prepare(second);
  const firstArchive = path.join(first, `${platform}.zip`);
  const secondArchive = path.join(second, `${platform}.zip`);
  assert(sha256(firstArchive) === sha256(secondArchive), "les archives OCR ne sont pas reproductibles");
  const selection = JSON.parse(fs.readFileSync(path.join(first, `${platform}.selection.json`), "utf8"));
  assert(selection.platform === platform, "la sélection de plateforme est incorrecte");
  assert(selection.archive.sha256 === sha256(firstArchive), "le SHA-256 de l’archive n’est pas verrouillé");
  assert(selection.artifact.fileCount === 2, "le manifeste de contenu doit exclure son propre fichier");
  console.log(`OCR platform packaging self-test passed for ${platform}: deterministic archive ${selection.archive.sha256}.`);
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}

function prepare(outputDir) {
  const result = spawnSync(process.execPath, [
    path.join(root, "scripts", "prepare-ocr-runtime.mjs"),
    "--platform", platform,
    "--source-dir", source,
    "--output-dir", outputDir,
    "--verify-reproducible",
  ], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || "échec du test d’empaquetage OCR");
}

function sha256(filePath) {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
