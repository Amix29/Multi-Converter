import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const runtimeLock = readJson("src-tauri/ocr-runtime-lock.json");
const inventory = readJson("src-tauri/ocr-runtime-licenses.json");
const supplemental = readJson("tools/ocr-runtime/supplemental-licenses.json");
const requirementsPath = path.join(root, "tools", "ocr-runtime", "requirements-windows-x64.lock.txt");
const requirements = fs.readFileSync(requirementsPath, "utf8");
const failures = [];

expect(runtimeLock.buildEnvironment?.python === "3.12.10", "CPython build version must be exactly locked");
expect(runtimeLock.buildEnvironment?.uv === "0.11.21", "uv build version must be exactly locked");
expect(
  runtimeLock.buildEnvironment?.requirementsSha256 === sha256(requirements),
  "requirements lock SHA-256 differs from ocr-runtime-lock.json",
);

const locked = parseRequirements(requirements);
const inventoried = new Map(inventory.packages.map((entry) => [normalizeName(entry.name), String(entry.version)]));
expect(locked.size === inventory.packageCount, "requirements lock package count differs from runtime inventory");
for (const [name, version] of inventoried) {
  expect(locked.get(name)?.version === version, `${name} ${version} is missing from the requirements lock`);
  expect((locked.get(name)?.hashes.length ?? 0) > 0, `${name} has no artifact SHA-256`);
}
for (const name of locked.keys()) expect(inventoried.has(name), `${name} is locked but absent from the runtime inventory`);

const supplements = new Map(supplemental.packages.map((entry) => [normalizeName(entry.name), entry]));
for (const packageName of inventory.packagesWithoutEmbeddedLicenseFiles ?? inventory.packagesWithoutLicenseFiles) {
  const entry = supplements.get(normalizeName(packageName));
  expect(Boolean(entry), `${packageName} has neither embedded nor supplemental license text`);
  if (!entry) continue;
  const licensePath = path.join(root, entry.licenseFile);
  expect(fs.existsSync(licensePath), `${packageName} supplemental license file is missing`);
  if (fs.existsSync(licensePath)) {
    const canonicalLicense = fs.readFileSync(licensePath, "utf8").replaceAll("\r\n", "\n");
    expect(sha256(canonicalLicense) === entry.licenseSha256, `${packageName} license SHA-256 differs`);
  }
  expect(locked.get(normalizeName(packageName))?.hashes.includes(entry.wheel.sha256), `${packageName} wheel hash is not locked`);
  expect(locked.get(normalizeName(packageName))?.hashes.includes(entry.sdist.sha256), `${packageName} sdist hash is not locked`);
}

if (failures.length > 0) {
  console.error("OCR runtime supply-chain audit failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log(`OCR runtime supply-chain audit passed: ${locked.size} hashed distributions and complete license coverage.`);

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function parseRequirements(source) {
  const packages = new Map();
  let current = null;
  for (const line of source.split(/\r?\n/u)) {
    const packageMatch = /^([a-z0-9_.-]+)==([^\s\\]+)\s*\\?$/iu.exec(line);
    if (packageMatch) {
      current = { version: packageMatch[2], hashes: [] };
      packages.set(normalizeName(packageMatch[1]), current);
      continue;
    }
    const hashMatch = /--hash=sha256:([a-f0-9]{64})/iu.exec(line);
    if (hashMatch && current) current.hashes.push(hashMatch[1].toLowerCase());
  }
  return packages;
}

function normalizeName(value) {
  return String(value).toLowerCase().replace(/[_.]+/gu, "-");
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function expect(condition, message) {
  if (!condition) failures.push(message);
}
