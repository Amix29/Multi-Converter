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
const paddleVersion = source.tag?.match(/^v(\d+\.\d+\.\d+)$/u)?.[1];
if (paddleVersion !== "3.3.1") {
  throw new Error(`Le tag PaddlePaddle verrouillé doit être v3.3.1: ${source.tag ?? "absent"}`);
}
const buildEnvironment = {
  ...process.env,
  ARCHFLAGS: "-arch x86_64",
  MACOSX_DEPLOYMENT_TARGET: "11.0",
  PADDLE_VERSION: paddleVersion,
  _PYTHON_HOST_PLATFORM: "macosx-11.0-x86_64",
};

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
const compatibilityOverrides = stageCompatibilityRefs(sourceRoot, source.compatibilityRefs);

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
  "-DCMAKE_OSX_ARCHITECTURES=x86_64",
  "-DCMAKE_OSX_DEPLOYMENT_TARGET=11.0",
  "-DCMAKE_BUILD_TYPE=Release",
], buildEnvironment);
run("cmake", ["--build", buildRoot, "--parallel", String(os.cpus().length)], buildEnvironment);

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
  compatibilityOverrides,
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

function run(command, commandArgs, environment = process.env) {
  const result = spawnSync(command, commandArgs, { cwd: root, env: environment, stdio: "inherit" });
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

function stageCompatibilityRefs(repositoryRoot, refs) {
  const entries = Object.entries(refs ?? {});
  if (!entries.length) {
    throw new Error("Les références de compatibilité PaddlePaddle doivent être verrouillées.");
  }
  const paths = parseGitConfig(commandOutput("git", [
    "-C", repositoryRoot, "config", "-f", ".gitmodules", "--get-regexp", "^submodule\\..*\\.path$",
  ]));
  const urls = parseGitConfig(commandOutput("git", [
    "-C", repositoryRoot, "config", "-f", ".gitmodules", "--get-regexp", "^submodule\\..*\\.url$",
  ]));
  return entries.map(([name, entry]) => {
    if (!entry || !/^[a-f0-9]{40}$/u.test(entry.objectSha ?? "") || !/^[a-f0-9]{40}$/u.test(entry.commit ?? "")) {
      throw new Error(`${name}: objet ou commit de compatibilité invalide.`);
    }
    if (!/^refs\/(tags|heads)\/[A-Za-z0-9._-]+$/u.test(entry.ref ?? "")) {
      throw new Error(`${name}: référence de compatibilité invalide.`);
    }
    const pathRecord = [...paths.entries()].find(([, value]) => value === entry.path);
    if (!pathRecord) {
      throw new Error(`${name}: chemin de sous-module absent de .gitmodules.`);
    }
    const moduleKey = pathRecord[0].slice(0, -".path".length);
    const configuredUrl = urls.get(`${moduleKey}.url`);
    if (configuredUrl !== entry.url || new URL(configuredUrl).protocol !== "https:") {
      throw new Error(`${name}: URL du sous-module différente de la provenance verrouillée.`);
    }
    const checkout = path.join(repositoryRoot, entry.path);
    runWithRetries("git", ["-C", checkout, "fetch", "--depth", "1", "origin", entry.objectSha], 4);
    const fetchedObject = commandOutput("git", ["-C", checkout, "rev-parse", "FETCH_HEAD"]);
    if (fetchedObject !== entry.objectSha) {
      throw new Error(`${name}: l’objet de compatibilité récupéré ne correspond pas au verrou.`);
    }
    const [kind, localName] = entry.ref.startsWith("refs/tags/")
      ? ["tags", entry.ref.slice("refs/tags/".length)]
      : ["heads", entry.ref.slice("refs/heads/".length)];
    if (kind === "tags") run("git", ["-C", checkout, "tag", "-f", localName, entry.objectSha]);
    else run("git", ["-C", checkout, "branch", "-f", localName, entry.commit]);
    if (commandOutput("git", ["-C", checkout, "rev-parse", `refs/${kind}/${localName}`]) !== entry.objectSha) {
      throw new Error(`${name}: l’objet de la référence locale ne correspond pas au verrou.`);
    }
    if (commandOutput("git", ["-C", checkout, "rev-parse", `refs/${kind}/${localName}^{commit}`]) !== entry.commit) {
      throw new Error(`${name}: le commit pointé par la référence locale ne correspond pas au verrou.`);
    }
    return {
      name, path: entry.path, url: entry.url, ref: entry.ref, objectSha: entry.objectSha, commit: entry.commit,
    };
  });
}

function parseGitConfig(output) {
  return new Map(output.split("\n").filter(Boolean).map((line) => {
    const separator = line.indexOf(" ");
    if (separator < 1) throw new Error("Entrée .gitmodules ambiguë.");
    return [line.slice(0, separator), line.slice(separator + 1)];
  }));
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
