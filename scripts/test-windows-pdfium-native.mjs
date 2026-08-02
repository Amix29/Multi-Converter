import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { sha256File } from "./lib/engine-package-files.mjs";
import { readPdfiumLock, validateLockedPdfiumTree } from "./lib/pdfium-package.mjs";

const root = process.cwd();
const args = process.argv.slice(2);
const evidenceRoot = path.join(root, "test-results", "phase-7-pdfium-native");

if (args.includes("--self-test")) await selfTest();
else await validateInstalledCandidate();

async function validateInstalledCandidate() {
  requireWindows();
  const installer = path.resolve(requiredOption("--installer"));
  await assertFile(installer, "installateur NSIS");
  const lock = await readPdfiumLock(root);
  const runId = option("--run-id") ?? new Date().toISOString().replaceAll(/[:.]/g, "-");
  if (!/^[a-zA-Z0-9_-]+$/.test(runId)) throw new Error("--run-id contient des caracteres invalides.");
  const runRoot = path.join(evidenceRoot, runId);
  const installRoot = path.join(os.tmpdir(), `mc-phase-7-pdfium-${runId}`);
  if (await exists(runRoot) || await exists(installRoot)) throw new Error("Le dossier de preuve ou d'installation existe deja.");
  await fs.mkdir(runRoot, { recursive: true });
  const fixtureRoot = path.join(root, "tests", "fixtures", "ocr", "phase-6");
  const fixturePaths = ["pdf-native.pdf", "pdf-scanned.pdf", "pdf-mixed-multipage.pdf"].map((name) => path.join(fixtureRoot, name));
  const sourceBefore = await Promise.all(fixturePaths.map(fileRecord));
  const report = {
    schemaVersion: 1,
    runId,
    sourceCommit: git("rev-parse", "HEAD"),
    sourceBranch: git("branch", "--show-current"),
    networkMode: "active-process-observation",
    phase5ManualScenariosReplayed: false,
    installer: await fileRecord(installer),
    installRoot,
    cycles: [],
  };
  try {
    for (let cycle = 1; cycle <= 2; cycle += 1) {
      install(installer, installRoot);
      const app = await findFile(installRoot, "multi-converter.exe");
      const wrapper = await findFile(installRoot, path.basename(lock.wrapper.binaryPath));
      const engineRoot = path.dirname(path.dirname(wrapper));
      const validated = await validateLockedPdfiumTree(engineRoot, lock, fixtureRoot);
      const cycleEvidence = {
        cycle,
        application: await fileRecord(app),
        wrapper: await fileRecord(validated.wrapper),
        library: await fileRecord(validated.dll),
        health: "passed",
      };
      if (cycle === 1 && !args.includes("--skip-corpus")) {
        runNpm("test:ocr:corpus", {
          MULTI_CONVERTER_TEST_PDFIUM_RENDER: validated.wrapper,
          MULTI_CONVERTER_TEST_PDFIUM_LIBRARY: validated.dll,
          MULTI_CONVERTER_TEST_PDFIUM_DLL: validated.dll,
        }, 40 * 60_000);
        const corpusReport = path.join(root, "test-results", "phase-6", "ocr-corpus.json");
        cycleEvidence.corpus = await fileRecord(corpusReport);
      }
      report.cycles.push(cycleEvidence);
      const uninstaller = await findFile(installRoot, "uninstall.exe");
      uninstall(uninstaller);
      await waitForGone(app, 120_000, `Le cycle ${cycle} n'a pas retire l'application installee.`);
      await fs.rm(installRoot, { recursive: true, force: true });
    }
    const sourceAfter = await Promise.all(fixturePaths.map(fileRecord));
    if (JSON.stringify(sourceBefore) !== JSON.stringify(sourceAfter)) throw new Error("Une fixture PDF source a ete modifiee.");
    report.sources = sourceAfter;
    report.status = "passed";
    report.completedAt = new Date().toISOString();
    await writeReport(runRoot, report);
    console.log(`Installed PDFium validation passed: ${path.relative(root, runRoot)}.`);
  } catch (error) {
    report.status = "failed";
    report.error = error.message;
    report.completedAt = new Date().toISOString();
    await writeReport(runRoot, report);
    throw error;
  } finally {
    await fs.rm(installRoot, { recursive: true, force: true });
  }
}

function install(installer, destination) {
  run(installer, ["/S", `/D=${destination}`], 10 * 60_000, "installation NSIS PDFium");
}

function uninstall(uninstaller) {
  run(uninstaller, ["/S"], 10 * 60_000, "desinstallation NSIS PDFium");
}

function runNpm(script, extraEnv, timeout) {
  const npmCli = process.env.npm_execpath;
  if (!npmCli) throw new Error("npm_execpath est requis pour lancer le corpus PDFium.");
  run(process.execPath, [npmCli, "run", script], timeout, script, extraEnv);
}

function run(command, commandArgs, timeout, label, extraEnv = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd: root,
    env: { ...process.env, ...extraEnv },
    encoding: "utf8",
    timeout,
    windowsHide: true,
    stdio: "inherit",
  });
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`${label}: code ${result.status}.`);
}

async function selfTest() {
  const lock = await readPdfiumLock(root);
  assert.equal(lock.wrapper.version, "0.3.0");
  assert.equal(lock.upstream.librarySha256.length, 64);
  assert.equal(lock.package.releaseTag, "engines-v0.1.1-alpha.0");
  assert.equal(args.includes("--offline"), false, "Le protocole Phase 7 ne doit pas couper le reseau.");
  console.log("Windows PDFium native protocol self-test passed (network stays active; Phase 5 ledger unchanged). ");
}

async function findFile(directory, expectedName) {
  const queue = [directory];
  const matches = [];
  while (queue.length) {
    const current = queue.shift();
    for (const entry of await fs.readdir(current, { withFileTypes: true })) {
      const child = path.join(current, entry.name);
      if (entry.isDirectory()) queue.push(child);
      else if (entry.isFile() && entry.name.toLowerCase() === expectedName.toLowerCase()) matches.push(child);
    }
  }
  if (matches.length !== 1) throw new Error(`${expectedName}: un seul fichier installe est requis, trouve ${matches.length}.`);
  return matches[0];
}

async function fileRecord(filePath) {
  const stat = await assertFile(filePath, path.basename(filePath));
  return { path: filePath, bytes: stat.size, sha256: await sha256File(filePath) };
}

async function assertFile(filePath, label) {
  const stat = await fs.stat(filePath).catch(() => null);
  if (!stat?.isFile() || stat.size <= 0) throw new Error(`${label}: fichier absent ou vide.`);
  return stat;
}

async function writeReport(directory, report) {
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, "manifest.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

function git(...gitArgs) {
  const result = spawnSync("git", gitArgs, { cwd: root, encoding: "utf8", windowsHide: true });
  if (result.status !== 0) throw new Error(`git ${gitArgs.join(" ")} impossible.`);
  return result.stdout.trim();
}

function option(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

function requiredOption(name) {
  const value = option(name);
  if (!value) throw new Error(`${name} est requis.`);
  return value;
}

async function exists(target) {
  return Boolean(await fs.stat(target).catch(() => null));
}

async function waitForGone(target, timeoutMs, message) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!(await exists(target))) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(message);
}

function requireWindows() {
  if (process.platform !== "win32" || process.arch !== "x64") throw new Error("La validation PDFium installee exige Windows x64.");
}
