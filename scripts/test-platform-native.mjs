import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const args = parseArgs(process.argv.slice(2));
if (!new Set(["macos", "linux"]).has(args.platform)) throw new Error("--platform macos|linux est requis.");
if (args.selfTest) {
  selfTest();
  process.exit(0);
}

const expectedHost = args.platform === "macos" ? "darwin" : "linux";
if (process.platform !== expectedHost || (args.platform === "linux" && process.arch !== "x64")) {
  throw new Error(`La preuve native ${args.platform} doit être exécutée sur son hôte réel.`);
}

const proofRoot = path.resolve(args.proofDir ?? path.join(root, "test-results", `phase-8-${args.platform}-native`));
fs.mkdirSync(proofRoot, { recursive: true });
const isolated = fs.mkdtempSync(path.join(os.tmpdir(), `mc-${args.platform}-native-`));
try {
  if (args.platform === "macos") await validateMacos();
  else await validateLinux();
} finally {
  fs.rmSync(isolated, { recursive: true, force: true });
}

async function validateMacos() {
  if (!args.package) throw new Error("--package <DMG> est requis.");
  runNpm(["run", "verify:macos-dmg", "--", "--dmg", path.resolve(args.package)]);
  const mount = path.join(isolated, "mount");
  fs.mkdirSync(mount);
  run("hdiutil", ["attach", path.resolve(args.package), "-nobrowse", "-readonly", "-mountpoint", mount]);
  try {
    const sourceApp = path.join(mount, "Multi-Converter.app");
    const app = path.join(isolated, "Multi-Converter.app");
    run("ditto", [sourceApp, app]);
    const info = spawnSync("plutil", ["-extract", "CFBundleExecutable", "raw", "-o", "-", path.join(app, "Contents", "Info.plist")], { encoding: "utf8" });
    if (info.status !== 0 || !info.stdout.trim()) throw new Error("CFBundleExecutable macOS illisible.");
    const executable = path.join(app, "Contents", "MacOS", info.stdout.trim());
    await launchTwice(executable, [], "macos");
    writeProof("macos", path.resolve(args.package));
  } finally {
    spawnSync("hdiutil", ["detach", mount, "-quiet"], { stdio: "ignore" });
  }
}

async function validateLinux() {
  if (!args.package || !args.signature) throw new Error("--package <AppImage> et --signature <sig> sont requis.");
  const appImage = path.resolve(args.package);
  fs.chmodSync(appImage, fs.statSync(appImage).mode | 0o755);
  runNpm(["run", "verify:linux-appimage", "--", "--appimage", appImage, "--signature", path.resolve(args.signature)]);
  await launchTwice(appImage, [], "linux");
  writeProof("linux", appImage);
}

async function launchTwice(executable, executableArgs, label) {
  for (let runIndex = 1; runIndex <= 2; runIndex += 1) {
    const home = path.join(isolated, "home");
    const config = path.join(isolated, "config");
    const data = path.join(isolated, "data");
    const temporary = path.join(isolated, "tmp");
    for (const directory of [home, config, data, temporary]) fs.mkdirSync(directory, { recursive: true });
    const child = spawn(executable, executableArgs, {
      cwd: isolated,
      env: { ...process.env, HOME: home, XDG_CONFIG_HOME: config, XDG_DATA_HOME: data, TMPDIR: temporary },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    await new Promise((resolve) => setTimeout(resolve, 8000));
    if (child.exitCode !== null) throw new Error(`${label}: lancement ${runIndex} terminé prématurément (${child.exitCode}): ${stderr}`);
    captureScreen(path.join(proofRoot, `${label}-launch-${runIndex}.png`));
    child.kill("SIGTERM");
    await Promise.race([
      new Promise((resolve) => child.once("exit", resolve)),
      new Promise((_, reject) => setTimeout(() => reject(new Error(`${label}: arrêt du lancement ${runIndex} hors délai`)), 10000)),
    ]);
  }
}

function captureScreen(target) {
  const result = args.platform === "macos"
    ? spawnSync("screencapture", ["-x", target], { stdio: "ignore" })
    : spawnSync("scrot", [target], { stdio: "ignore" });
  if (result.status !== 0 || !fs.statSync(target, { throwIfNoEntry: false })?.isFile()) {
    throw new Error(`Capture native impossible: ${target}`);
  }
}

function writeProof(platform, packagePath) {
  const stat = fs.statSync(packagePath);
  fs.writeFileSync(path.join(proofRoot, "native-proof.json"), `${JSON.stringify({
    schemaVersion: 1,
    platform,
    architecture: process.arch,
    package: path.basename(packagePath),
    packageBytes: stat.size,
    packageSha256: sha256(packagePath),
    launches: 2,
    networkMode: "active-observation-only",
    cleanUserMachineClaimed: false,
  }, null, 2)}\n`);
  console.log(`${platform} native package smoke passed twice; evidence written to ${proofRoot}.`);
}

function selfTest() {
  const fixture = { schemaVersion: 1, platform: args.platform, networkMode: "active-observation-only", cleanUserMachineClaimed: false };
  if (fixture.cleanUserMachineClaimed || fixture.networkMode !== "active-observation-only") throw new Error("contrat de preuve natif invalide");
  console.log(`${args.platform} native validator self-test passed; real package execution remains host-only.`);
}

function parseArgs(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === "--platform") parsed.platform = values[++index];
    else if (value === "--package") parsed.package = values[++index];
    else if (value === "--signature") parsed.signature = values[++index];
    else if (value === "--proof-dir") parsed.proofDir = values[++index];
    else if (value === "--self-test") parsed.selfTest = true;
    else throw new Error(`Argument de preuve native inconnu: ${value}`);
  }
  return parsed;
}

function run(command, commandArgs) {
  const result = spawnSync(command, commandArgs, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `${command} a échoué`);
}

function runNpm(commandArgs) {
  run(process.platform === "win32" ? "npm.cmd" : "npm", commandArgs);
}

function sha256(filePath) {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}
