import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const OFFICE_FORMATS = ["odt", "docx", "rtf"];
const OFFICE_CHECKS = [
  "import-rich",
  "styles-tables",
  "assets-restart",
  "header-footer",
  "page-number",
  "page-layout",
  "save-as-reopen",
  "overwrite-confirmation",
  "external-conflict",
  "failure-preserves-original",
  "pdf-export",
];
const OCR_PDF_KINDS = ["native", "scanned", "mixed"];
const OCR_TARGETS = ["txt", "markdown", "html", "csv", "json", "xml", "docx", "odt", "rtf"];

export const SCENARIOS = Object.freeze([
  ...scenarioGroup("installer", [
    "install",
    "first-launch",
    "second-launch",
    "uninstall",
    "reinstall",
    "external-files-preserved",
  ]).map((scenario) => ({
    ...scenario,
    processCount: /first-launch|second-launch/.test(scenario.id) ? 1 : 0,
    installedExecutableRequired: /first-launch|second-launch/.test(scenario.id),
  })),
  ...scenarioGroup(
    "converter",
    [
      "native-picker",
      "native-drop",
      "clipboard-file",
      "ffmpeg-ffprobe",
      "rust-image",
      "svg-ico",
      "libvips",
      "pdfium",
      "libreoffice",
      "pandoc",
      "rust-text",
      "batch",
      "cancel-retry",
      "close-during-job",
    ],
    { sourceIntegrityRequired: true },
  ).map((scenario) => ({
    ...scenario,
    processCount: scenario.id.endsWith("ffmpeg-ffprobe")
      ? 2
      : /libvips|pdfium|libreoffice|pandoc/.test(scenario.id)
        ? 1
        : 0,
  })),
  { id: "editor.native-drop", artifactKinds: ["screenshot", "log"], sourceIntegrityRequired: true },
  ...OFFICE_FORMATS.flatMap((format) =>
    OFFICE_CHECKS.map((check) => ({
      id: `editor.${format}.${check}`,
      artifactKinds: check === "pdf-export" ? ["output", "screenshot"] : ["screenshot", "output", "log"],
      cleanupRequired: check === "failure-preserves-original",
      sourceIntegrityRequired: true,
    })),
  ),
  ...["png", "jpeg", "webp", "tiff", "bmp"].map((format) => ({
    id: `ocr.image.${format}.recognize-copy`,
    artifactKinds: ["screenshot", "log"],
    processCount: format === "png" ? 1 : 0,
    sourceIntegrityRequired: true,
  })),
  ...OCR_PDF_KINDS.flatMap((kind) =>
    OCR_TARGETS.map((target) => ({
      id: `ocr.pdf.${kind}.${target}`,
      artifactKinds: ["output"],
      sourceIntegrityRequired: true,
    })),
  ),
  ...scenarioGroup(
    "ocr",
    [
      "pdf-editor",
      "blank",
      "rotation",
      "multipage",
      "low-contrast",
      "corrupt-input",
      "password-protected",
      "source-limit",
      "pixel-limit",
      "page-limit",
      "cancel",
      "timeout",
      "worker-crash-retry",
      "cleanup-atomicity",
      "offline-restart",
    ],
    { sourceIntegrityRequired: true },
  ).map((scenario) => ({
    ...scenario,
    cleanupRequired: /cancel|timeout|crash|cleanup|corrupt|limit/.test(scenario.id),
    processCount: scenario.id === "ocr.offline-restart" ? 1 : 0,
  })),
]);

export const SCENARIO_BY_ID = new Map(SCENARIOS.map((scenario) => [scenario.id, scenario]));

export function createManifest({ candidate, environment, runId }) {
  return {
    schemaVersion: 1,
    runId,
    state: "in-progress",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    candidate,
    environment,
    scenarios: SCENARIOS.map(({ id }) => ({ id, status: "pending" })),
  };
}

export async function validateManifest(manifest, { rehash = true } = {}) {
  const errors = [];
  if (manifest.schemaVersion !== 1) errors.push("schemaVersion must be 1");
  if (manifest.candidate?.version !== "1.0.6") errors.push("candidate version must remain 1.0.6");
  if (manifest.environment?.platform !== "win32" || manifest.environment?.arch !== "x64") {
    errors.push("evidence must come from Windows x64");
  }
  if (manifest.environment?.profileIsolation !== "dedicated") {
    errors.push("a dedicated clean Windows profile is required");
  }
  if (manifest.environment?.packageMode !== "installed") errors.push("the NSIS candidate must be installed, not only extracted");
  if (manifest.environment?.networkMode !== "offline") errors.push("installed validation must run offline");
  await validateFileRecord(manifest.candidate?.installer, "installer", errors, rehash);
  await validateFileRecord(manifest.candidate?.installedExecutable, "installed executable", errors, rehash);
  for (const resource of manifest.candidate?.engineResources?.files ?? []) {
    await validateFileRecord(resource, "engine resource", errors, rehash);
  }
  for (const tree of manifest.candidate?.engineResources?.trees ?? []) {
    await validateDirectoryRecord(tree, "engine tree", errors, rehash);
  }

  const actual = new Map((manifest.scenarios ?? []).map((scenario) => [scenario.id, scenario]));
  for (const definition of SCENARIOS) {
    const scenario = actual.get(definition.id);
    if (!scenario) {
      errors.push(`missing scenario: ${definition.id}`);
      continue;
    }
    if (scenario.status !== "pass") {
      errors.push(`${definition.id}: expected pass, got ${scenario.status ?? "missing"}`);
      continue;
    }
    const artifacts = scenario.artifacts ?? [];
    if (!artifacts.some((artifact) => definition.artifactKinds.includes(artifact.kind))) {
      errors.push(`${definition.id}: missing ${definition.artifactKinds.join(" or ")} evidence`);
    }
    for (const artifact of artifacts) {
      await validateFileRecord(artifact, `${definition.id} artifact`, errors, rehash);
    }
    const processes = scenario.processes ?? [];
    if (processes.length < (definition.processCount ?? 0)) {
      errors.push(`${definition.id}: missing launched-process identity`);
    }
    for (const processRecord of processes) {
      await validateFileRecord(processRecord, `${definition.id} process`, errors, rehash);
    }
    if (definition.installedExecutableRequired && !processes.some((record) =>
      record.sha256 === manifest.candidate?.installedExecutable?.sha256 &&
      path.resolve(record.path) === path.resolve(manifest.candidate?.installedExecutable?.path ?? ""))) {
      errors.push(`${definition.id}: launched process is not the installed candidate`);
    }
    if (definition.sourceIntegrityRequired) validateSourceIntegrity(scenario, errors);
    if (definition.cleanupRequired && (scenario.tempResiduals ?? []).length > 0) {
      errors.push(`${definition.id}: temporary residuals remain`);
    }
  }
  for (const id of actual.keys()) {
    if (!SCENARIO_BY_ID.has(id)) errors.push(`unknown scenario: ${id}`);
  }

  if (errors.length === 0) manifest.state = "passed";
  return errors;
}

export async function fileRecord(filePath, kind) {
  const absolutePath = path.resolve(filePath);
  const stat = await fs.stat(absolutePath);
  if (!stat.isFile() || stat.size === 0) throw new Error(`Evidence file is absent or empty: ${absolutePath}`);
  return { kind, path: absolutePath, bytes: stat.size, sha256: await sha256(absolutePath) };
}

export async function sourceRecord(filePath) {
  const record = await fileRecord(filePath, "source");
  return { path: record.path, beforeBytes: record.bytes, beforeSha256: record.sha256 };
}

export async function directoryRecord(directoryPath, kind) {
  const absolutePath = path.resolve(directoryPath);
  const entries = await collectFiles(absolutePath);
  if (entries.length === 0) throw new Error(`Evidence directory is empty: ${absolutePath}`);
  const hash = createHash("sha256");
  let totalBytes = 0;
  for (const entry of entries) {
    const filePath = path.join(absolutePath, entry);
    const stat = await fs.stat(filePath);
    const fileSha256 = await sha256(filePath);
    totalBytes += stat.size;
    hash.update(`${entry.split(path.sep).join("/")}\0${stat.size}\0${fileSha256}\n`);
  }
  return {
    kind,
    path: absolutePath,
    fileCount: entries.length,
    bytes: totalBytes,
    aggregateSha256: hash.digest("hex"),
  };
}

export async function completeSourceRecord(record) {
  const current = await fileRecord(record.path, "source");
  return { ...record, afterBytes: current.bytes, afterSha256: current.sha256 };
}

export async function temporarySnapshot() {
  const entries = await fs.readdir(os.tmpdir(), { withFileTypes: true }).catch(() => []);
  return entries
    .filter((entry) => entry.name.startsWith("multi-converter-"))
    .map((entry) => entry.name)
    .sort();
}

export function temporaryResiduals(before, after) {
  const existing = new Set(before ?? []);
  return (after ?? []).filter((entry) => !existing.has(entry));
}

export async function sha256(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

function scenarioGroup(prefix, names, defaults = {}) {
  return names.map((name) => ({
    id: `${prefix}.${name}`,
    artifactKinds: ["screenshot", "output", "log"],
    cleanupRequired: /cancel|close-during|failure/.test(name),
    processCount: 0,
    sourceIntegrityRequired: false,
    ...defaults,
  }));
}

function validateSourceIntegrity(scenario, errors) {
  if (!scenario.sources?.length) {
    errors.push(`${scenario.id}: source integrity evidence is required`);
    return;
  }
  for (const source of scenario.sources) {
    if (!source.beforeSha256 || !source.afterSha256 || source.beforeSha256 !== source.afterSha256) {
      errors.push(`${scenario.id}: source changed or lacks before/after hashes: ${source.path ?? "unknown"}`);
    }
    if (source.beforeBytes !== source.afterBytes) errors.push(`${scenario.id}: source size changed: ${source.path}`);
  }
}

async function validateFileRecord(record, label, errors, rehash) {
  if (!record?.path || !record.sha256 || !Number.isFinite(record.bytes)) {
    errors.push(`${label}: incomplete file identity`);
    return;
  }
  if (!rehash) return;
  const stat = await fs.stat(record.path).catch(() => null);
  if (!stat?.isFile()) {
    errors.push(`${label}: file not found: ${record.path}`);
    return;
  }
  if (stat.size !== record.bytes) errors.push(`${label}: file size changed: ${record.path}`);
  if ((await sha256(record.path)) !== record.sha256) errors.push(`${label}: SHA-256 changed: ${record.path}`);
}

async function validateDirectoryRecord(record, label, errors, rehash) {
  if (!record?.path || !record.aggregateSha256 || !Number.isFinite(record.fileCount)) {
    errors.push(`${label}: incomplete directory identity`);
    return;
  }
  if (!rehash) return;
  const current = await directoryRecord(record.path, record.kind).catch(() => null);
  if (!current) {
    errors.push(`${label}: directory not found: ${record.path}`);
    return;
  }
  if (current.fileCount !== record.fileCount || current.bytes !== record.bytes) {
    errors.push(`${label}: directory size or file count changed: ${record.path}`);
  }
  if (current.aggregateSha256 !== record.aggregateSha256) {
    errors.push(`${label}: aggregate SHA-256 changed: ${record.path}`);
  }
}

async function collectFiles(directory, relative = "") {
  const entries = await fs.readdir(path.join(directory, relative), { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name, "en"))) {
    const child = path.join(relative, entry.name);
    if (entry.isDirectory()) files.push(...(await collectFiles(directory, child)));
    else if (entry.isFile()) files.push(child);
    else throw new Error(`Engine tree contains a non-regular entry: ${child}`);
  }
  return files;
}
