import path from "node:path";

const SOURCE_GROUP_ORDER = ["frontend", "rust", "automation", "tests", "configuration"];

const SOURCE_ROOTS = [
  { prefix: "src/", group: "frontend", extensions: [".css", ".ts", ".tsx"] },
  { prefix: "src-tauri/src/", group: "rust", extensions: [".rs"] },
  { prefix: "scripts/", group: "automation", extensions: [".js", ".mjs", ".ps1", ".ts"] },
  { prefix: "tests/", group: "tests", extensions: [".js", ".mjs", ".ts", ".tsx"] },
  { prefix: ".github/workflows/", group: "configuration", extensions: [".yaml", ".yml"] },
];

const CONFIG_FILES = new Set([
  "index.html",
  "package.json",
  "playwright.config.ts",
  "tsconfig.json",
  "tsconfig.tests.json",
  "vite.config.ts",
  "vitest.config.ts",
  "src-tauri/Cargo.toml",
  "src-tauri/build.rs",
  "src-tauri/engines-manifest.json",
  "src-tauri/nsis-hooks.nsh",
  "src-tauri/tauri.conf.json",
  "src-tauri/tauri.linux.conf.json",
  "src-tauri/tauri.macos.conf.json",
]);

export const SOURCE_SELECTION = Object.freeze({
  includedRoots: SOURCE_ROOTS.map(({ prefix }) => prefix),
  includedConfigFiles: [...CONFIG_FILES],
  excludedTrees: [
    ".git/",
    "branding-kit/",
    "dist/",
    "docs/",
    "engine-sources/",
    "node_modules/",
    "output/",
    "release/",
    "release-artifacts/",
    "site/",
    "src-tauri/binaries/",
    "src-tauri/bundled-engines/",
    "src-tauri/target/",
    "target/",
    "test-results/",
    "tools/",
  ],
  excludedGeneratedFiles: ["package-lock.json", "src-tauri/Cargo.lock"],
});

export function normalizeRepositoryPath(value) {
  return String(value).replaceAll("\\", "/").replace(/^\.\//, "").replace(/\/{2,}/g, "/");
}

export function classifySourcePath(value) {
  const normalized = normalizeRepositoryPath(value);
  if (!normalized || isUnsafeRepositoryPath(normalized)) return null;
  if (CONFIG_FILES.has(normalized)) return "configuration";

  for (const sourceRoot of SOURCE_ROOTS) {
    if (!normalized.startsWith(sourceRoot.prefix)) continue;
    const extension = path.posix.extname(normalized).toLowerCase();
    return sourceRoot.extensions.includes(extension) ? sourceRoot.group : null;
  }

  return null;
}

export function countTextLines(value) {
  if (value.length === 0) return { lines: 0, nonBlankLines: 0 };
  const lines = value.split(/\r\n|\r|\n/);
  if (lines.at(-1) === "") lines.pop();
  return {
    lines: lines.length,
    nonBlankLines: lines.reduce((count, line) => count + (line.trim().length > 0 ? 1 : 0), 0),
  };
}

export function summarizeSourceEntries(entries) {
  const groups = Object.fromEntries(SOURCE_GROUP_ORDER.map((group) => [group, emptySourceSummary()]));

  for (const entry of entries) {
    if (!(entry.group in groups)) throw new TypeError(`Unknown source group: ${entry.group}`);
    addSourceEntry(groups[entry.group], entry);
  }

  const totals = emptySourceSummary();
  for (const group of SOURCE_GROUP_ORDER) addSourceSummary(totals, groups[group]);
  return { totals, groups };
}

export function summarizeSizedFiles(entries, exists = true) {
  return {
    exists,
    fileCount: entries.length,
    bytes: entries.reduce((total, entry) => total + nonNegativeNumber(entry.bytes), 0),
  };
}

export function summarizeDistEntries(entries, exists = true) {
  const files = entries.map((entry) => ({
    path: typeof entry.path === "string" ? normalizeRepositoryPath(entry.path) : null,
    rawBytes: nonNegativeNumber(entry.rawBytes),
    gzipBytes: nonNegativeNumber(entry.gzipBytes),
  }));
  return {
    exists,
    fileCount: files.length,
    rawBytes: files.reduce((total, entry) => total + entry.rawBytes, 0),
    gzipBytes: files.reduce((total, entry) => total + entry.gzipBytes, 0),
    files,
  };
}

export function summarizeGateStatus(status) {
  if (!status || typeof status !== "object" || Array.isArray(status)) {
    throw new TypeError("Gate status must be a JSON object.");
  }

  const steps = Array.isArray(status.steps) ? status.steps : [];
  const byStatus = {};
  let totalStepDurationMs = 0;
  const normalizedSteps = steps.map((step, index) => {
    const stepStatus = typeof step?.status === "string" ? step.status : "unknown";
    const durationMs = nullableNonNegativeNumber(step?.durationMs);
    byStatus[stepStatus] = (byStatus[stepStatus] ?? 0) + 1;
    totalStepDurationMs += durationMs ?? 0;
    return {
      index: positiveInteger(step?.index) ?? index + 1,
      command: typeof step?.command === "string" ? step.command : null,
      status: stepStatus,
      durationMs,
    };
  });

  return {
    command: typeof status.command === "string" ? status.command : null,
    state: typeof status.state === "string" ? status.state : null,
    startedAt: validDateString(status.startedAt),
    updatedAt: validDateString(status.updatedAt),
    elapsedMs: dateDifference(status.startedAt, status.updatedAt),
    stepSummary: {
      total: normalizedSteps.length,
      byStatus,
      totalDurationMs: totalStepDurationMs,
    },
    steps: normalizedSteps,
  };
}

function isUnsafeRepositoryPath(value) {
  return (
    value.includes("\0") ||
    value.startsWith("/") ||
    /^[A-Za-z]:\//.test(value) ||
    value.split("/").some((segment) => segment === "..")
  );
}

function emptySourceSummary() {
  return { fileCount: 0, bytes: 0, lines: 0, nonBlankLines: 0 };
}

function addSourceEntry(summary, entry) {
  summary.fileCount += 1;
  summary.bytes += nonNegativeNumber(entry.bytes);
  summary.lines += nonNegativeNumber(entry.lines);
  summary.nonBlankLines += nonNegativeNumber(entry.nonBlankLines);
}

function addSourceSummary(target, source) {
  target.fileCount += source.fileCount;
  target.bytes += source.bytes;
  target.lines += source.lines;
  target.nonBlankLines += source.nonBlankLines;
}

function nonNegativeNumber(value) {
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

function nullableNonNegativeNumber(value) {
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function positiveInteger(value) {
  return Number.isInteger(value) && value > 0 ? value : null;
}

function validDateString(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : null;
}

function dateDifference(start, end) {
  const startMs = typeof start === "string" ? Date.parse(start) : Number.NaN;
  const endMs = typeof end === "string" ? Date.parse(end) : Number.NaN;
  return Number.isFinite(startMs) && Number.isFinite(endMs) && endMs >= startMs ? endMs - startMs : null;
}
