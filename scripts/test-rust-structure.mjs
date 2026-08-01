import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const projectRoot = path.resolve(import.meta.dirname, "..");
const hardLimit = 500;
const targetLimit = 300;
const ignoredDirectories = new Set([
  ".git",
  "binaries",
  "bundled-engine-archives",
  "bundled-engines",
  "gen",
  "installer-assets",
  "node_modules",
  "ocr-resources",
  "target",
]);

function rustFilesUnder(entryPath) {
  const stat = fs.statSync(entryPath);
  if (stat.isFile()) {
    return entryPath.endsWith(".rs") ? [entryPath] : [];
  }

  const files = [];
  for (const entry of fs.readdirSync(entryPath, { withFileTypes: true })) {
    const childPath = path.join(entryPath, entry.name);
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) files.push(...rustFilesUnder(childPath));
    } else if (entry.isFile() && entry.name.endsWith(".rs")) {
      files.push(childPath);
    }
  }
  return files;
}

function nonBlankLines(source) {
  return source.split(/\r?\n/u).filter((line) => line.trim().length > 0).length;
}

function sourceWithoutComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//gu, "").replace(/\/\/.*$/gmu, "");
}

const rustInputs = [
  path.join(projectRoot, "src-tauri", "src"),
  path.join(projectRoot, "src-tauri", "build.rs"),
  path.join(projectRoot, "tools"),
];

const measurements = rustInputs
  .flatMap(rustFilesUnder)
  .map((filePath) => {
    const source = fs.readFileSync(filePath, "utf8");
    return {
      path: path.relative(projectRoot, filePath).replaceAll("\\", "/"),
      lines: nonBlankLines(source),
      usesIncludeMacro: /\binclude\s*!\s*\(/u.test(sourceWithoutComments(source)),
    };
  })
  .sort((left, right) => right.lines - left.lines || left.path.localeCompare(right.path));

const oversized = measurements.filter((entry) => entry.lines > hardLimit);
const includedSources = measurements.filter((entry) => entry.usesIncludeMacro);

if (oversized.length > 0 || includedSources.length > 0) {
  for (const entry of oversized) {
    console.error(`${entry.path}: ${entry.lines} non-blank lines exceeds ${hardLimit}`);
  }
  for (const entry of includedSources) {
    console.error(`${entry.path}: include! is forbidden for handwritten Rust modules`);
  }
  process.exitCode = 1;
} else {
  const aboveTarget = measurements.filter((entry) => entry.lines > targetLimit);
  const largest = measurements[0];
  console.log(
    `Rust structure passed: ${measurements.length} files, largest ${largest.path} (${largest.lines}), ${aboveTarget.length} above the ${targetLimit}-line target.`,
  );
}
