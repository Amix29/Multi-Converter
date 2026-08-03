import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { readPlatformProvenance } from "./lib/platform-provenance.mjs";

if (process.platform !== "darwin" || process.arch !== "x64") {
  throw new Error("La wheel PaddlePaddle macOS Intel doit être compilée sur un Mac Intel.");
}

const root = process.cwd();
const args = parseArgs(process.argv.slice(2));
const lock = await readPlatformProvenance(root);
const source = lock.ocr.paddlepaddle.source;
const output = path.resolve(args.outputDir ?? path.join(root, "engine-sources", "ocr-runtime", "paddle-macos-x86_64"));
const sourceRoot = path.join(output, "source");
const buildRoot = path.join(output, "build");
const python = path.resolve(args.python ?? process.env.MC_OCR_PYTHON ?? "python3");
const buildRequirements = path.join(root, "tools", "ocr-runtime", "paddle-build-macos-x86_64.lock.txt");

const uvVersion = commandOutput("uv", ["--version"]);
if (!uvVersion.startsWith("uv 0.11.21 ")) {
  throw new Error(`uv 0.11.21 est requis pour les dépendances de build: ${uvVersion}`);
}
run("uv", [
  "pip", "install", "--python", python, "--require-hashes", "--only-binary", ":all:", "-r", buildRequirements,
]);

await fs.rm(sourceRoot, { recursive: true, force: true });
await fs.rm(buildRoot, { recursive: true, force: true });
await fs.mkdir(sourceRoot, { recursive: true });
await fs.mkdir(buildRoot, { recursive: true });
run("git", ["-C", sourceRoot, "init"]);
run("git", ["-C", sourceRoot, "remote", "add", "origin", source.repository]);
run("git", ["-C", sourceRoot, "fetch", "--depth", "1", "origin", source.commit]);
run("git", ["-C", sourceRoot, "checkout", "--detach", source.commit]);
validateSubmoduleUrls(commandOutput("git", ["-C", sourceRoot, "config", "-f", ".gitmodules", "--get-regexp", "^submodule\\..*\\.url$"]));
runWithRetries(
  "git",
  ["-C", sourceRoot, "submodule", "update", "--init", "--recursive", "--depth", "1"],
  4,
);
if (commandOutput("git", ["-C", sourceRoot, "rev-parse", "HEAD"]) !== source.commit) {
  throw new Error("Le checkout PaddlePaddle ne correspond pas au commit verrouillé.");
}
const submodules = commandOutput("git", ["-C", sourceRoot, "submodule", "status", "--recursive"]);
if (submodules.split("\n").some((line) => line && line[0] !== " ")) {
  throw new Error("Les sous-modules PaddlePaddle ne correspondent pas aux commits verrouillés par le dépôt.");
}

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
const buildRequirementsSha256 = createHash("sha256")
  .update(await fs.readFile(buildRequirements))
  .digest("hex");
await fs.writeFile(`${wheel}.sha256`, `${digest}  ${wheels[0]}\n`);
const licenseInventory = await collectSourceLicenses(sourceRoot, path.join(wheelDirectory, "paddle-source-licenses"));
await fs.writeFile(
  path.join(wheelDirectory, "paddle-source-license-inventory.json"),
  `${JSON.stringify({ schemaVersion: 1, fileCount: licenseInventory.length, files: licenseInventory }, null, 2)}\n`,
);
await fs.writeFile(path.join(wheelDirectory, "paddle-build-provenance.json"), `${JSON.stringify({
  schemaVersion: 1,
  tag: source.tag,
  commit: source.commit,
  repository: source.repository,
  referenceArchive: { url: source.url, bytes: source.bytes, sha256: source.sha256 },
  submodules: submodules.split("\n").filter(Boolean),
  wheel: wheels[0],
  wheelSha256: digest,
  toolchain: {
    python: commandOutput(python, ["--version"]),
    uv: uvVersion,
    buildRequirements: {
      path: path.relative(root, buildRequirements).split(path.sep).join("/"),
      sha256: buildRequirementsSha256,
    },
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

function runWithRetries(command, commandArgs, attempts) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const result = spawnSync(command, commandArgs, { cwd: root, stdio: "inherit" });
    if (result.status === 0) return;
    if (attempt === attempts) {
      throw new Error(`Échec de ${command} après ${attempts} tentatives (${result.status ?? "signal"}).`);
    }
    console.error(`${command}: tentative ${attempt}/${attempts} interrompue, reprise du même checkout verrouillé.`);
  }
}

function commandOutput(command, commandArgs) {
  const result = spawnSync(command, commandArgs, { cwd: root, encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || `Échec de ${command}.`);
  return result.stdout.trimEnd() || result.stderr.trimEnd();
}

function validateSubmoduleUrls(output) {
  const urls = output.split("\n").filter(Boolean).map((line) => line.slice(line.indexOf(" ") + 1));
  if (!urls.length || urls.some((value) => {
    try {
      return new URL(value).protocol !== "https:";
    } catch {
      return true;
    }
  })) {
    throw new Error("Tous les sous-modules PaddlePaddle doivent utiliser une provenance HTTPS explicite.");
  }
}

async function collectSourceLicenses(directory, output, relative = "") {
  const results = [];
  for (const entry of await fs.readdir(path.join(directory, relative), { withFileTypes: true })) {
    if (entry.name === ".git" || entry.isSymbolicLink()) continue;
    const child = path.join(relative, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await collectSourceLicenses(directory, output, child)));
    } else if (entry.isFile() && /^(license|licence|copying|notice)(\..*)?$/iu.test(entry.name)) {
      const sourceFile = path.join(directory, child);
      const target = path.join(output, child);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.copyFile(sourceFile, target);
      const bytes = await fs.readFile(sourceFile);
      results.push({ path: child.split(path.sep).join("/"), bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") });
    }
  }
  return results.sort((left, right) => left.path.localeCompare(right.path, "en"));
}
