import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
const keywords = new Set(packageJson.keywords ?? []);

assert.equal(packageJson.homepage, "https://github.com/Amix29/Multi-Converter#readme", "homepage must point to the GitHub README");
assert.equal(packageJson.repository?.url, "git+https://github.com/Amix29/Multi-Converter.git", "repository URL must point to GitHub");
assert.equal(packageJson.bugs?.url, "https://github.com/Amix29/Multi-Converter/issues", "bug tracker URL must point to GitHub issues");

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
  "windows",
  "windows-app",
  "macos",
  "macos-app",
  "macos-universal",
  "macos-dmg",
  "universal-dmg",
  "apple-silicon",
  "intel-mac",
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

console.log("Repository metadata tests passed.");
