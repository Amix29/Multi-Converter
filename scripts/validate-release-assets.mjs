import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const requiredLanguages = ["en", "fr", "es", "de", "pt", "it"];
const requiredSections = ["Highlights", "Download And Installation", "Validation"];

const args = parseArgs(process.argv.slice(2));
const version = args.version ?? readPackageVersion();
const tag = `v${version}`;
const dir = args.dir ? path.resolve(args.dir) : path.join(process.env.LOCALAPPDATA ?? "", "Temp", "mc-release-assets", tag);

if (!version.match(/^\d+\.\d+\.\d+$/)) {
  fail(`Invalid version "${version}". Expected X.Y.Z.`);
}
if (!fs.existsSync(dir)) {
  fail(`Release asset directory does not exist: ${dir}`);
}

const versionedInstaller = `Multi-Converter_${version}_x64-setup.exe`;
const stableInstaller = "Multi-Converter_windows-x64_setup.exe";
const signatureFile = `${versionedInstaller}.sig`;
const checksumFile = `${versionedInstaller}.sha256`;
const expectedNames = [checksumFile, "latest.json", signatureFile, stableInstaller, versionedInstaller].sort();
const actualNames = fs.readdirSync(dir).filter((name) => fs.statSync(path.join(dir, name)).isFile()).sort();

assertArrayEqual(actualNames, expectedNames, "Release asset set must contain exactly the required files.");

const versionedPath = path.join(dir, versionedInstaller);
const stablePath = path.join(dir, stableInstaller);
const signaturePath = path.join(dir, signatureFile);
const checksumPath = path.join(dir, checksumFile);
const latestPath = path.join(dir, "latest.json");

const versionedHash = sha256File(versionedPath);
const stableHash = sha256File(stablePath);
if (versionedHash !== stableHash) {
  fail(`Stable setup alias hash does not match versioned installer hash.\n${versionedHash}\n${stableHash}`);
}

const checksumText = fs.readFileSync(checksumPath, "utf8").trim();
if (checksumText !== `${versionedHash}  ${versionedInstaller}`) {
  fail(`Checksum file must be "<sha256>  ${versionedInstaller}".`);
}

const signature = fs.readFileSync(signaturePath, "utf8").trim();
if (!signature || signature.length < 100) {
  fail("Updater signature is missing or unexpectedly short.");
}

const latest = JSON.parse(fs.readFileSync(latestPath, "utf8"));
if (latest.version !== version) fail(`latest.json version is ${latest.version}, expected ${version}.`);
if (!latest.pub_date || Number.isNaN(Date.parse(latest.pub_date))) fail("latest.json pub_date is missing or invalid.");
if (typeof latest.notes !== "string" || latest.notes.length < 200) fail("latest.json notes are missing or too short.");

const expectedUrl = `https://github.com/Amix29/Multi-Converter/releases/download/${tag}/${versionedInstaller}`;
const expectedPlatforms = ["windows-x86_64", "windows-x86_64-nsis"];
const actualPlatforms = Object.keys(latest.platforms ?? {}).sort();
assertArrayEqual(actualPlatforms, expectedPlatforms.sort(), "latest.json must contain exactly the expected updater platforms.");

for (const platform of expectedPlatforms) {
  const entry = latest.platforms?.[platform];
  if (!entry) fail(`latest.json missing platform ${platform}.`);
  if (entry.url !== expectedUrl) fail(`latest.json ${platform} URL is ${entry.url}, expected ${expectedUrl}.`);
  if (entry.signature !== signature) fail(`latest.json ${platform} signature does not match ${signatureFile}.`);
}

for (const language of requiredLanguages) {
  const block = releaseNotesBlock(latest.notes, language);
  if (!block) fail(`Missing localized release-note block for ${language}.`);
  if (!block.includes(`# Multi-Converter v${version}`)) fail(`Release-note block ${language} has the wrong title.`);
  for (const section of requiredSections) {
    if (!block.includes(`## ${section}`)) fail(`Release-note block ${language} is missing "## ${section}".`);
  }
}

console.log(`Release assets validated for Multi-Converter v${version}: ${dir}`);

function parseArgs(rawArgs) {
  const parsed = {};
  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];
    if (arg === "--version") parsed.version = rawArgs[++index];
    else if (arg === "--dir") parsed.dir = rawArgs[++index];
    else fail(`Unknown argument: ${arg}`);
  }
  return parsed;
}

function readPackageVersion() {
  const pkg = JSON.parse(fs.readFileSync(path.resolve("package.json"), "utf8"));
  return pkg.version;
}

function sha256File(file) {
  const hash = createHash("sha256");
  hash.update(fs.readFileSync(file));
  return hash.digest("hex");
}

function releaseNotesBlock(body, language) {
  const pattern = new RegExp(`<!--\\s*mc-release-notes:${language}\\s*-->([\\s\\S]*?)<!--\\s*/mc-release-notes\\s*-->`, "i");
  return body.match(pattern)?.[1]?.trim() ?? null;
}

function assertArrayEqual(actual, expected, message) {
  if (actual.length !== expected.length || actual.some((value, index) => value !== expected[index])) {
    fail(`${message}\nExpected: ${expected.join(", ")}\nActual:   ${actual.join(", ")}`);
  }
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
