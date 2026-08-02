import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { downloadIfMissingVerified } from "./lib/download-integrity.mjs";
import { readPlatformProvenance } from "./lib/platform-provenance.mjs";

if (process.platform !== "darwin" || process.arch !== "x64") {
  throw new Error("La wheel PaddlePaddle macOS Intel doit être compilée sur un Mac Intel.");
}

const root = process.cwd();
const args = parseArgs(process.argv.slice(2));
const lock = await readPlatformProvenance(root);
const source = lock.ocr.paddlepaddle.source;
const output = path.resolve(args.outputDir ?? path.join(root, "engine-sources", "ocr-runtime", "paddle-macos-x86_64"));
const downloads = path.join(os.tmpdir(), "multi-converter-paddle-source");
const archive = path.join(downloads, `Paddle-${source.tag}.tar.gz`);
const sourceRoot = path.join(output, "source");
const buildRoot = path.join(output, "build");
const python = path.resolve(args.python ?? process.env.MC_OCR_PYTHON ?? "python3");

await fs.mkdir(downloads, { recursive: true });
await downloadIfMissingVerified(source.url, archive, source.sha256, { "User-Agent": "Multi-Converter-Packager" });
if ((await fs.stat(archive)).size !== source.bytes) throw new Error("L’archive source PaddlePaddle a une taille inattendue.");
await fs.rm(sourceRoot, { recursive: true, force: true });
await fs.rm(buildRoot, { recursive: true, force: true });
await fs.mkdir(sourceRoot, { recursive: true });
await fs.mkdir(buildRoot, { recursive: true });
run("tar", ["-xzf", archive, "--strip-components=1", "-C", sourceRoot]);

const include = commandOutput(python, ["-c", "import sysconfig; print(sysconfig.get_paths()['include'])"]);
const library = commandOutput(python, ["-c", "import sysconfig; print(sysconfig.get_config_var('LIBDIR') + '/libpython3.12.dylib')"]);
run("cmake", [
  "-S", sourceRoot,
  "-B", buildRoot,
  "-DPY_VERSION=3.12",
  `-DPYTHON_EXECUTABLE=${python}`,
  `-DPYTHON_INCLUDE_DIR=${include}`,
  `-DPYTHON_LIBRARY=${library}`,
  "-DWITH_GPU=OFF",
  "-DWITH_ARM=OFF",
  "-DWITH_TESTING=OFF",
  "-DCMAKE_BUILD_TYPE=Release",
]);
run("cmake", ["--build", buildRoot, "--parallel", String(os.cpus().length)]);

const wheelDirectory = path.join(buildRoot, "python", "dist");
const wheels = (await fs.readdir(wheelDirectory)).filter((name) => name.endsWith(".whl"));
if (wheels.length !== 1 || !/paddlepaddle-3\.3\.1-.*macosx.*x86_64\.whl$/iu.test(wheels[0])) {
  throw new Error(`La compilation doit produire une seule wheel macOS x86_64 3.3.1: ${wheels.join(", ")}`);
}
const wheel = path.join(wheelDirectory, wheels[0]);
const digest = createHash("sha256").update(await fs.readFile(wheel)).digest("hex");
await fs.writeFile(`${wheel}.sha256`, `${digest}  ${wheels[0]}\n`);
await fs.writeFile(path.join(wheelDirectory, "paddle-build-provenance.json"), `${JSON.stringify({
  schemaVersion: 1,
  tag: source.tag,
  commit: source.commit,
  sourceSha256: source.sha256,
  wheel: wheels[0],
  wheelSha256: digest,
  toolchain: {
    python: commandOutput(python, ["--version"]),
    cmake: commandOutput("cmake", ["--version"]).split("\n")[0],
    xcode: commandOutput("xcodebuild", ["-version"]).replaceAll("\n", " "),
  },
}, null, 2)}\n`);
console.log(`PaddlePaddle macOS Intel wheel ready: ${wheel}`);

function parseArgs(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] === "--output-dir") parsed.outputDir = values[++index];
    else if (values[index] === "--python") parsed.python = values[++index];
    else throw new Error(`Argument PaddlePaddle inconnu: ${values[index]}`);
  }
  return parsed;
}

function run(command, commandArgs) {
  const result = spawnSync(command, commandArgs, { cwd: root, stdio: "inherit" });
  if (result.status !== 0) throw new Error(`Échec de ${command} (${result.status ?? "signal"}).`);
}

function commandOutput(command, commandArgs) {
  const result = spawnSync(command, commandArgs, { cwd: root, encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || `Échec de ${command}.`);
  return result.stdout.trim() || result.stderr.trim();
}
