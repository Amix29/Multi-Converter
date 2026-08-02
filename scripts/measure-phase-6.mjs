import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = path.resolve(import.meta.dirname, "..");
const budgets = {
  frontendRawBytes: 1_095_149,
  initialChunkBytes: 211_600,
  largestChunkBytes: 500_000,
  windowsExecutableBytes: 28_070_784,
};

function walkFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const child = path.join(directory, entry.name);
    return entry.isDirectory() ? walkFiles(child) : [child];
  });
}

function bytes(filePath) {
  return fs.statSync(filePath).size;
}

const distFiles = walkFiles(path.join(root, "dist"));
const javascript = distFiles.filter((filePath) => filePath.endsWith(".js"));
const indexHtml = path.join(root, "dist", "index.html");
const initialNames = fs.existsSync(indexHtml)
  ? [...fs.readFileSync(indexHtml, "utf8").matchAll(/src="(?:\.\/|\/)?assets\/([^"]+\.js)"/gu)].map((match) => match[1])
  : [];
const initialChunkBytes = javascript
  .filter((filePath) => initialNames.includes(path.basename(filePath)))
  .reduce((total, filePath) => total + bytes(filePath), 0);
const largestChunkBytes = Math.max(0, ...javascript.map(bytes));
const frontendRawBytes = distFiles.reduce((total, filePath) => total + bytes(filePath), 0);

const executableCandidates = [
  process.env.MULTI_CONVERTER_PHASE_6_WINDOWS_EXECUTABLE,
  path.join(root, "src-tauri", "target", "release", "multi-converter.exe"),
  path.join(root, "target", "release", "multi-converter.exe"),
].filter(Boolean).map((candidate) => path.resolve(candidate));
const executablePath = executableCandidates.find(fs.existsSync) ?? null;
const windowsExecutableBytes = executablePath ? bytes(executablePath) : null;

const measurements = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  budgets,
  frontend: {
    exists: distFiles.length > 0,
    rawBytes: frontendRawBytes,
    initialChunkBytes,
    largestChunkBytes,
  },
  windowsExecutable: {
    exists: Boolean(executablePath),
    bytes: windowsExecutableBytes,
    path: executablePath ? path.relative(root, executablePath).replaceAll("\\", "/") : null,
  },
};

const failures = [];
if (measurements.frontend.exists) {
  if (frontendRawBytes > budgets.frontendRawBytes) failures.push("frontend raw bundle budget exceeded");
  if (initialChunkBytes > budgets.initialChunkBytes) failures.push("initial JavaScript budget exceeded");
  if (largestChunkBytes >= budgets.largestChunkBytes) failures.push("a JavaScript chunk reached 500 kB");
}
if (windowsExecutableBytes !== null && windowsExecutableBytes > budgets.windowsExecutableBytes) {
  failures.push("Windows executable budget exceeded");
}

const outputDir = path.join(root, "test-results", "phase-6");
fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, "measurements.json"), `${JSON.stringify(measurements, null, 2)}\n`);

if (failures.length > 0) {
  for (const failure of failures) console.error(failure);
  process.exitCode = 1;
} else {
  console.log(`Phase 6 measurements written (${frontendRawBytes} frontend bytes, ${windowsExecutableBytes ?? "no executable"}).`);
}
