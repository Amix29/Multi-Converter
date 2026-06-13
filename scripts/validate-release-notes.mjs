import fs from "node:fs";
import path from "node:path";
import { validateReleaseNotes } from "./lib/release-notes-validation.mjs";

const args = parseArgs(process.argv.slice(2));
const version = args.version ?? readPackageVersion();
const includeMacos = parseBoolean(args.includeMacos ?? "false", "--include-macos");
const minLength = args.minLength === undefined ? 1 : Number(args.minLength);
const body = readReleaseNotes(args);
const validation = validateReleaseNotes({ body, version, includeMacos, minLength });

if (!validation.ok) {
  for (const error of validation.errors) {
    console.error(error);
  }
  process.exit(1);
}

console.log(`Release notes validated for Multi-Converter v${version} (${includeMacos ? "with macOS" : "Windows-only"}).`);

function parseArgs(rawArgs) {
  const parsed = {};
  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];
    if (arg === "--version") parsed.version = rawArgs[++index];
    else if (arg === "--notes-file") parsed.notesFile = rawArgs[++index];
    else if (arg === "--notes-env") parsed.notesEnv = rawArgs[++index];
    else if (arg === "--include-macos") parsed.includeMacos = rawArgs[++index];
    else if (arg === "--min-length") parsed.minLength = rawArgs[++index];
    else fail(`Unknown argument: ${arg}`);
  }
  return parsed;
}

function readReleaseNotes(parsedArgs) {
  if (parsedArgs.notesFile && parsedArgs.notesEnv) {
    fail("Pass either --notes-file or --notes-env, not both.");
  }
  if (parsedArgs.notesFile) {
    const notesPath = path.resolve(parsedArgs.notesFile);
    if (!fs.existsSync(notesPath)) fail(`Missing release notes file: ${notesPath}`);
    return fs.readFileSync(notesPath, "utf8");
  }
  if (parsedArgs.notesEnv) {
    const value = process.env[parsedArgs.notesEnv];
    if (!value) fail(`Release notes environment variable is empty or missing: ${parsedArgs.notesEnv}`);
    return value;
  }
  fail("Missing release notes. Pass --notes-file <path> or --notes-env <name>.");
}

function readPackageVersion() {
  const pkg = JSON.parse(fs.readFileSync(path.resolve("package.json"), "utf8"));
  return pkg.version;
}

function parseBoolean(value, name) {
  if (value === true || value === "true" || value === "1") return true;
  if (value === false || value === "false" || value === "0") return false;
  fail(`${name} must be true or false.`);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
