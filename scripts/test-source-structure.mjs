import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const projectRoot = path.resolve(import.meta.dirname, "..");
const hardLimit = 500;
const targetLimit = 300;
const handwrittenExtensions = new Set([".cjs", ".js", ".mjs", ".rs", ".ts", ".tsx"]);
const ignoredDirectories = new Set([
  ".git",
  ".next",
  "binaries",
  "bundled-engine-archives",
  "bundled-engines",
  "dist",
  "dist-engines",
  "engine-sources",
  "gen",
  "installer-assets",
  "node_modules",
  "ocr-resources",
  "output",
  "release",
  "site",
  "target",
  "test-results",
]);

function sourceFilesUnder(entryPath) {
  const stat = fs.statSync(entryPath);
  if (stat.isFile()) {
    return handwrittenExtensions.has(path.extname(entryPath)) ? [entryPath] : [];
  }

  const files = [];
  for (const entry of fs.readdirSync(entryPath, { withFileTypes: true })) {
    const childPath = path.join(entryPath, entry.name);
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) files.push(...sourceFilesUnder(childPath));
    } else if (entry.isFile() && handwrittenExtensions.has(path.extname(entry.name))) {
      files.push(childPath);
    }
  }
  return files;
}

function nonBlankLines(source) {
  return source.split(/\r?\n/u).filter((line) => line.trim().length > 0).length;
}

const roots = ["scripts", "src", "src-tauri", "tests", "tools"]
  .map((entry) => path.join(projectRoot, entry))
  .filter((entry) => fs.existsSync(entry));

const measurements = roots
  .flatMap(sourceFilesUnder)
  .map((filePath) => ({
    path: path.relative(projectRoot, filePath).replaceAll("\\", "/"),
    lines: nonBlankLines(fs.readFileSync(filePath, "utf8")),
  }))
  .sort((left, right) => right.lines - left.lines || left.path.localeCompare(right.path));

const oversized = measurements.filter((entry) => entry.lines > hardLimit);
if (oversized.length > 0) {
  for (const entry of oversized) {
    console.error(`${entry.path}: ${entry.lines} non-blank lines exceeds ${hardLimit}`);
  }
  process.exitCode = 1;
} else {
  const aboveTarget = measurements.filter((entry) => entry.lines > targetLimit);
  const largest = measurements[0];
  console.log(
    `Source structure passed: ${measurements.length} files, largest ${largest.path} (${largest.lines}), ${aboveTarget.length} above the ${targetLimit}-line target.`,
  );
}
