import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  SCENARIOS,
  SCENARIO_BY_ID,
  completeSourceRecord,
  createManifest,
  directoryRecord,
  fileRecord,
  sourceRecord,
  temporaryResiduals,
  temporarySnapshot,
  validateManifest,
} from "./lib/windows-native-evidence.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const evidenceRoot = path.join(root, "test-results", "phase-5-windows-native");
const args = process.argv.slice(2);

if (args.includes("--self-test")) await selfTest();
else if (args.includes("--init")) await initialize();
else if (option("--begin")) await beginScenario();
else if (option("--complete")) await completeScenario();
else await validate();

async function initialize() {
  requireWindows();
  const runId = option("--run-id") ?? new Date().toISOString().replaceAll(/[:.]/g, "-");
  if (!/^[a-zA-Z0-9_-]+$/.test(runId)) fail("--run-id may contain only letters, numbers, underscores and hyphens");
  const manifestPath = manifestForRun(runId);
  if (await exists(manifestPath)) fail(`Run already exists: ${manifestPath}`);

  const installerPath = requiredOption("--installer");
  const executablePath = requiredOption("--installed-executable");
  const profileIsolation = requiredOption("--profile-isolation");
  const packageMode = requiredOption("--package-mode");
  const networkMode = requiredOption("--network-mode");
  const metadata = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8"));
  const manifest = createManifest({
    runId,
    candidate: {
      version: metadata.version,
      sourceCommit: git("rev-parse", "HEAD"),
      sourceBranch: git("branch", "--show-current"),
      installer: await fileRecord(installerPath, "installer"),
      installedExecutable: await fileRecord(executablePath, "installed-executable"),
      engineResources: await installedEngineInventory(executablePath),
    },
    environment: {
      platform: process.platform,
      arch: process.arch,
      osRelease: os.release(),
      profileIsolation,
      packageMode,
      networkMode,
    },
  });
  await writeJson(manifestPath, manifest);
  console.log(`Native Windows evidence initialized: ${path.relative(root, manifestPath)}`);
  console.log(`${SCENARIOS.length} required scenarios are pending.`);
}

async function beginScenario() {
  const scenarioId = option("--begin");
  const definition = requireScenario(scenarioId);
  const { manifest, manifestPath } = await loadManifest();
  const scenario = manifest.scenarios.find((entry) => entry.id === scenarioId);
  if (scenario.status === "pass") fail(`${scenarioId} already passed`);
  const sources = options("--source");
  if (definition.sourceIntegrityRequired && sources.length === 0) fail(`${scenarioId} requires at least one --source`);
  scenario.status = "running";
  scenario.startedAt = new Date().toISOString();
  scenario.sources = await Promise.all(sources.map(sourceRecord));
  scenario.tempBefore = await temporarySnapshot();
  scenario.artifacts = [];
  scenario.tempResiduals = [];
  touch(manifest);
  await writeJson(manifestPath, manifest);
  console.log(`Started ${scenarioId}. Perform the native interaction, then use --complete.`);
}

async function completeScenario() {
  const scenarioId = option("--complete");
  const definition = requireScenario(scenarioId);
  const { manifest, manifestPath } = await loadManifest();
  const scenario = manifest.scenarios.find((entry) => entry.id === scenarioId);
  const status = requiredOption("--status");
  if (!["pass", "fail", "blocked"].includes(status)) fail("--status must be pass, fail or blocked");
  if (status === "pass" && definition.sourceIntegrityRequired && scenario.status !== "running") {
    fail(`${scenarioId} must be started with --begin so source hashes are captured before the interaction`);
  }
  scenario.status = status;
  scenario.completedAt = new Date().toISOString();
  scenario.notes = option("--note") ?? "";
  scenario.artifacts = await Promise.all(options("--artifact").map(parseArtifact));
  scenario.processes = await Promise.all(options("--process").map((value) => fileRecord(value, "process")));
  scenario.sources = await Promise.all((scenario.sources ?? []).map(completeSourceRecord));
  const tempAfter = await temporarySnapshot();
  scenario.tempResiduals = temporaryResiduals(scenario.tempBefore, tempAfter);
  delete scenario.tempBefore;
  if (status === "pass") {
    const focused = { ...manifest, scenarios: [scenario] };
    const errors = await validateScenarioOnly(focused, definition);
    if (errors.length) {
      scenario.status = "fail";
      scenario.notes = [scenario.notes, ...errors].filter(Boolean).join(" | ");
      touch(manifest);
      await writeJson(manifestPath, manifest);
      fail(errors.join("\n"));
    }
  }
  touch(manifest);
  await writeJson(manifestPath, manifest);
  console.log(`Recorded ${scenarioId}: ${status}`);
}

async function validate() {
  requireWindows();
  const { manifest, manifestPath } = await loadManifest();
  const errors = await validateManifest(manifest);
  manifest.updatedAt = new Date().toISOString();
  await writeJson(manifestPath, manifest);
  if (errors.length) {
    console.error(`Native Windows evidence is incomplete (${errors.length} issue(s)):`);
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }
  console.log(`Native Windows evidence passed: ${path.relative(root, manifestPath)}`);
}

async function selfTest() {
  assert.equal(SCENARIOS.length, new Set(SCENARIOS.map(({ id }) => id)).size);
  assert.ok(SCENARIO_BY_ID.has("installer.first-launch"));
  assert.ok(SCENARIO_BY_ID.has("editor.docx.assets-restart"));
  assert.ok(SCENARIO_BY_ID.has("ocr.pdf.mixed.rtf"));
  assert.ok(SCENARIO_BY_ID.has("ocr.image.tiff.recognize-copy"));
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "mc-native-self-test-"));
  try {
    const file = path.join(temporary, "proof.txt");
    await fs.writeFile(file, "phase-5-proof\n");
    const identity = await fileRecord(file, "log");
    const installationRoot = path.join(temporary, "installed");
    for (const directory of ["engine-archives", "engines", "ocr"]) {
      await fs.mkdir(path.join(installationRoot, directory), { recursive: true });
      await fs.writeFile(path.join(installationRoot, directory, "resource.bin"), directory);
    }
    await fs.writeFile(path.join(installationRoot, "ffmpeg.exe"), "ffmpeg");
    await fs.writeFile(path.join(installationRoot, "ffprobe.exe"), "ffprobe");
    const inventory = await installedEngineInventory(path.join(installationRoot, "multi-converter.exe"));
    assert.equal(inventory.files.length, 2);
    assert.equal(inventory.trees.length, 3);
    assert.ok(inventory.trees.every(({ path: treePath }) => treePath.startsWith(installationRoot)));
    const manifest = createManifest({
      runId: "self-test",
      candidate: { version: "1.0.6", installer: identity, installedExecutable: identity },
      environment: { platform: "win32", arch: "x64", profileIsolation: "dedicated", packageMode: "installed", networkMode: "offline" },
    });
    const errors = await validateManifest(manifest, { rehash: false });
    assert.ok(errors.some((error) => error.includes("expected pass")));
    const changed = { path: file, beforeBytes: 1, afterBytes: 2, beforeSha256: "a", afterSha256: "b" };
    const scenario = { id: "converter.rust-text", status: "pass", artifacts: [identity], sources: [changed] };
    const focusedErrors = await validateScenarioOnly({ scenarios: [scenario] }, SCENARIO_BY_ID.get(scenario.id));
    assert.ok(focusedErrors.some((error) => error.includes("source")));
  } finally {
    await fs.rm(temporary, { recursive: true, force: true });
  }
  console.log(`Windows native evidence protocol self-test passed (${SCENARIOS.length} scenarios).`);
}

async function validateScenarioOnly(manifest, definition) {
  const scenario = manifest.scenarios[0];
  const errors = [];
  if (scenario.status !== "pass") errors.push(`${scenario.id}: expected pass`);
  if (!(scenario.artifacts ?? []).some((artifact) => definition.artifactKinds.includes(artifact.kind))) {
    errors.push(`${scenario.id}: missing required artifact`);
  }
  for (const artifact of scenario.artifacts ?? []) {
    const current = await fileRecord(artifact.path, artifact.kind).catch(() => null);
    if (!current || current.sha256 !== artifact.sha256) errors.push(`${scenario.id}: artifact changed or missing`);
  }
  if ((scenario.processes ?? []).length < (definition.processCount ?? 0)) {
    errors.push(`${scenario.id}: missing launched-process identity`);
  }
  for (const processRecord of scenario.processes ?? []) {
    const current = await fileRecord(processRecord.path, "process").catch(() => null);
    if (!current || current.sha256 !== processRecord.sha256) errors.push(`${scenario.id}: process executable changed or missing`);
  }
  if (definition.sourceIntegrityRequired) {
    if (!scenario.sources?.length) errors.push(`${scenario.id}: source integrity evidence is required`);
    for (const source of scenario.sources ?? []) {
      if (source.beforeSha256 !== source.afterSha256 || source.beforeBytes !== source.afterBytes) {
        errors.push(`${scenario.id}: source changed`);
      }
    }
  }
  if (definition.cleanupRequired && scenario.tempResiduals?.length) errors.push(`${scenario.id}: temporary residuals remain`);
  return errors;
}

async function parseArtifact(value) {
  const separator = value.indexOf("=");
  if (separator <= 0) fail("--artifact must use kind=path");
  const kind = value.slice(0, separator);
  if (!["screenshot", "output", "log"].includes(kind)) fail(`Unsupported artifact kind: ${kind}`);
  return fileRecord(value.slice(separator + 1), kind);
}

async function installedEngineInventory(executablePath) {
  const installationRoot = path.dirname(path.resolve(executablePath));
  const candidates = [
    path.join(installationRoot, "ffmpeg.exe"),
    path.join(installationRoot, "ffprobe.exe"),
  ];
  const trees = ["engine-archives", "engines", "ocr"].map((directory) =>
    path.join(installationRoot, directory),
  );
  return {
    files: await Promise.all(candidates.sort().map((candidate) => fileRecord(candidate, "engine-resource"))),
    trees: await Promise.all(trees.map((directory) => directoryRecord(directory, "installed-engine-tree"))),
  };
}

async function loadManifest() {
  const explicit = option("--manifest");
  let manifestPath = explicit ? path.resolve(explicit) : null;
  if (!manifestPath) {
    const entries = await fs.readdir(evidenceRoot, { withFileTypes: true }).catch(() => []);
    const runs = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort().reverse();
    if (!runs.length) fail("No native evidence run found. Initialize one with --init.");
    manifestPath = manifestForRun(runs[0]);
  }
  assertEvidencePath(manifestPath);
  return { manifestPath, manifest: JSON.parse(await fs.readFile(manifestPath, "utf8")) };
}

function manifestForRun(runId) {
  return path.join(evidenceRoot, runId, "manifest.json");
}

function assertEvidencePath(value) {
  const relative = path.relative(evidenceRoot, path.resolve(value));
  if (relative.startsWith("..") || path.isAbsolute(relative)) fail("Manifest must stay under test-results/phase-5-windows-native");
}

function requireScenario(id) {
  const scenario = SCENARIO_BY_ID.get(id);
  if (!scenario) fail(`Unknown scenario: ${id}`);
  return scenario;
}

function requireWindows() {
  if (process.platform !== "win32" || process.arch !== "x64") fail("Native evidence must run on Windows x64");
}

function git(...gitArgs) {
  return execFileSync("git", gitArgs, { cwd: root, encoding: "utf8" }).trim();
}

function option(name) {
  const index = args.findIndex((value) => value === name || value.startsWith(`${name}=`));
  if (index < 0) return null;
  return args[index].startsWith(`${name}=`) ? args[index].slice(name.length + 1) : args[index + 1];
}

function options(name) {
  const values = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === name) values.push(args[index + 1]);
    else if (args[index].startsWith(`${name}=`)) values.push(args[index].slice(name.length + 1));
  }
  return values;
}

function requiredOption(name) {
  const value = option(name);
  if (!value) fail(`${name} is required`);
  return value;
}

function touch(manifest) {
  manifest.updatedAt = new Date().toISOString();
  manifest.state = "in-progress";
}

async function writeJson(filePath, value) {
  assertEvidencePath(filePath);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, { flag: "w" });
}

async function exists(filePath) {
  return fs.access(filePath).then(() => true, () => false);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
