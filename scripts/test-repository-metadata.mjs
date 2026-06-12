import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
const githubTopics = fs.readFileSync(path.join(root, "docs", "GITHUB_TOPICS.md"), "utf8");
const testingDocs = fs.readFileSync(path.join(root, "docs", "TESTING.md"), "utf8");
const keywords = new Set(packageJson.keywords ?? []);
const topics = new Set(
  (githubTopics.match(/```text\s+([\s\S]*?)```/)?.[1] ?? "")
    .split(/\s+/)
    .map((topic) => topic.trim())
    .filter(Boolean),
);

assert.equal(packageJson.homepage, "https://github.com/Amix29/Multi-Converter#readme", "homepage must point to the GitHub README");
assert.equal(packageJson.repository?.url, "git+https://github.com/Amix29/Multi-Converter.git", "repository URL must point to GitHub");
assert.equal(packageJson.bugs?.url, "https://github.com/Amix29/Multi-Converter/issues", "bug tracker URL must point to GitHub issues");
assert.equal(packageJson.scripts["status:v1.0.5"], "node scripts/report-v1-0-5-status.mjs", "V1.0.5 status report script must be exposed through npm");
assert.equal(packageJson.scripts["test:v1.0.5-status"], "node scripts/report-v1-0-5-status.mjs --assert", "V1.0.5 status assertion script must be exposed through npm");

for (const keyword of [
  "file-converter",
  "batch-conversion",
  "multi-format",
  "offline-converter",
  "local-first",
  "privacy-first",
  "no-account-required",
  "desktop-app",
  "tauri",
  "tauri-v2",
  "rust",
  "react",
  "typescript",
  "windows",
  "windows-app",
  "macos",
  "macos-app",
  "macos-universal",
  "macos-dmg",
  "universal-dmg",
  "apple-silicon",
  "intel-mac",
  "linux",
  "linux-app",
  "linux-desktop",
  "pdf-converter",
  "video-converter",
  "image-converter",
]) {
  assert.ok(keywords.has(keyword), `missing package keyword: ${keyword}`);
}

assert.match(readme, /\|\s*.*Windows x64\s*\|\s*.*Available\s*\|/, "README must show Windows x64 as available");
assert.match(readme, /\|\s*.*macOS\s*\|\s*.*In development for v1\.0\.5\s*\|/, "README must show macOS as in development for v1.0.5");
assert.match(readme, /\|\s*.*Linux\s*\|\s*.*In development\s*\|/, "README must show Linux as in development");
assert.match(readme, /npm run tauri:build:macos/, "README must document the macOS build command");
assert.match(readme, /refuses this command on Windows\/Linux/, "README must explain that macOS DMG builds are refused on non-macOS hosts");
assert.match(readme, /Advanced macOS engines must not be advertised until/, "README must not overclaim advanced macOS engines");
assert.match(readme, /docs\/GITHUB_TOPICS\.md/, "README must link the recommended GitHub topics");

for (const topic of [
  "file-converter",
  "desktop-converter",
  "batch-conversion",
  "multi-format",
  "offline-converter",
  "local-first",
  "privacy-first",
  "tauri",
  "tauri-app",
  "rust",
  "react",
  "windows",
  "windows-app",
  "macos",
  "macos-app",
  "macos-universal",
  "apple-silicon",
  "intel-mac",
  "linux",
]) {
  assert.ok(topics.has(topic), `missing recommended GitHub topic: ${topic}`);
  assert.ok(keywords.has(topic), `recommended GitHub topic is missing from package keywords: ${topic}`);
}

assert.match(githubTopics, /Linux is in development and must not be presented as a released platform yet\./, "GitHub topic docs must prevent overclaiming Linux release support");
assert.match(testingDocs, /npm run status:v1\.0\.5/, "testing docs must document the V1.0.5 status audit command");
assert.match(testingDocs, /releaseReady` false/, "testing docs must state that V1.0.5 readiness remains false until real macOS validation");

console.log("Repository metadata tests passed.");
