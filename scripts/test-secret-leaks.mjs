import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const ignoredPaths = new Set([
  "AGENTS.md",
  "Cargo.lock",
  "package-lock.json",
]);
const ignoredPrefixes = [
  "docs/screenshots/",
  "src-tauri/icons/",
  "src-tauri/installer-assets/",
];
const maxTextFileBytes = 2 * 1024 * 1024;
const patterns = [
  ["private test repository reference", new RegExp(`\\b(?:Amix29/)?Multi-Converter-Test-${"Prive"}\\b`, "gi")],
  ["private test repository slug", new RegExp(`\\btest-${"prive"}\\b`, "gi")],
  ["maintainer local Windows path", /\b[A-Z]:[\\/]+Users[\\/]+ryadb[\\/]+/gi],
  ["Apple signing private key filename", /\bAuthKey_[A-Z0-9]{10}\.p8\b/g],
  ["Apple signing key file", /\b(?:AuthKey|Apple|ASC|AppStoreConnect|DeveloperID|Developer-ID)[A-Za-z0-9_.-]*\.p8\b/gi],
  ["Apple signing certificate file", /\b[A-Za-z0-9_. -]+\.p12\b/gi],
  ["Apple provisioning profile file", /\b[A-Za-z0-9_. -]+\.(?:mobileprovision|provisionprofile)\b/gi],
  ["private key block", /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/g],
  ["GitHub token", /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{36,}\b/g],
  ["GitHub fine-grained token", /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g],
  ["OpenAI API key", /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g],
  ["AWS access key", /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g],
  ["Google API key", /\bAIza[A-Za-z0-9_-]{35}\b/g],
  ["Slack token", /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/g],
  ["Tauri signing secret value", /\bTAURI_SIGNING_PRIVATE_KEY(?:_PASSWORD)?\s*[:=]\s*["']?[A-Za-z0-9+/=_-]{32,}/g],
  ["Apple credential value", /\bAPPLE_(?:API_KEY|API_ISSUER|ID|PASSWORD|TEAM_ID)\s*[:=]\s*["']?[A-Za-z0-9@._+/=-]{16,}/g],
];

const files = gitTrackedFiles();
const findings = [];

for (const relative of files) {
  const normalized = relative.replaceAll("\\", "/");
  if (ignoredPaths.has(normalized) || ignoredPrefixes.some((prefix) => normalized.startsWith(prefix))) continue;

  const absolute = path.join(root, relative);
  const stat = fs.statSync(absolute, { throwIfNoEntry: false });
  if (!stat?.isFile() || stat.size > maxTextFileBytes) continue;

  const buffer = fs.readFileSync(absolute);
  if (buffer.includes(0)) continue;

  const text = buffer.toString("utf8");
  for (const [label, pattern] of patterns) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(text)) !== null) {
      findings.push({
        file: normalized,
        line: lineNumberAt(text, match.index),
        label,
      });
    }
  }
}

if (findings.length > 0) {
  console.error("Potential secret leak detected in tracked files:");
  for (const finding of findings) {
    console.error(`- ${finding.file}:${finding.line} (${finding.label})`);
  }
  console.error("Move real credentials to environment variables or repository secrets before committing.");
  process.exit(1);
}

console.log("Secret leak scan passed.");

function gitTrackedFiles() {
  const result = spawnSync("git", ["ls-files", "-z"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  if (result.status !== 0) {
    throw new Error(`git ls-files failed: ${result.stderr || result.stdout}`);
  }
  return result.stdout.split("\0").filter(Boolean);
}

function lineNumberAt(text, index) {
  let line = 1;
  for (let cursor = 0; cursor < index; cursor += 1) {
    if (text.charCodeAt(cursor) === 10) line += 1;
  }
  return line;
}
