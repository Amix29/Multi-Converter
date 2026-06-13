import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
const securityPolicy = fs.readFileSync(path.join(root, "SECURITY.md"), "utf8");
const githubTopics = fs.readFileSync(path.join(root, "docs", "GITHUB_TOPICS.md"), "utf8");
const testingDocs = fs.readFileSync(path.join(root, "docs", "TESTING.md"), "utf8");
const macosChecklist = fs.readFileSync(path.join(root, "docs", "RELEASE_CHECKLIST_MACOS.md"), "utf8");
const secretLeakScript = fs.readFileSync(path.join(root, "scripts", "test-secret-leaks.mjs"), "utf8");
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
assert.equal(packageJson.scripts["test:v1.0.5-status"], "node scripts/test-v1-0-5-status.mjs", "V1.0.5 status assertion script must be exposed through npm");
assert.equal(packageJson.scripts["test:secret-leaks"], "node scripts/test-secret-leaks.mjs", "secret leak scan must be exposed through npm");
assert.equal(packageJson.scripts["test:production-config"], "node scripts/test-production-config.mjs", "production config test must be exposed through npm");
assert.match(packageJson.scripts.check, /npm run test:secret-leaks/, "main check script must include the secret leak scan");
assert.match(packageJson.scripts.check, /npm run test:production-config/, "main check script must include the production config test");

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
assert.match(readme, /private vulnerability reporting/, "README security section must prefer private vulnerability reporting");
assert.doesNotMatch(readme, /open a \*\*GitHub issue\*\*/i, "README must not tell users to post vulnerability details in a public issue");
assert.match(securityPolicy, /Do not post exploit details/, "security policy must warn against public exploit disclosure");
assert.match(securityPolicy, /private vulnerability reporting/, "security policy must prefer a private vulnerability reporting flow");
assert.match(securityPolicy, /minimal public issue/, "security policy must keep public fallback issues minimal");

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
assert.match(testingDocs, /npm run test:secret-leaks/, "testing docs must document the secret leak scan");
assert.match(testingDocs, /npm run test:production-config/, "testing docs must document the production config test");
assert.match(testingDocs, /current preparation state[\s\S]*`releaseReady` should remain false/, "testing docs must state that current V1.0.5 readiness remains false until real macOS validation");
assert.match(testingDocs, /same audit can report `releaseReady: true`/, "testing docs must allow the status audit to pass once final macOS proof exists");
assert.match(testingDocs, /strict GitHub `macOS Conversion Matrix` has passed[\s\S]*docs\/V1_0_5_VALIDATION\.md/, "testing docs must reflect current macOS automation evidence");
assert.doesNotMatch(testingDocs, /strict gate is expected to fail until real macOS sidecars/i, "testing docs must not describe the current macOS conversion matrix as still waiting on staged engines");
assert.match(macosChecklist, /workflow must fail if any required `macos-universal` advanced engine entry is missing/, "macOS checklist must describe missing engines as a failure condition, not as the current expected state");
assert.doesNotMatch(macosChecklist, /workflow is expected to fail until all required `macos-universal` advanced engine entries exist/i, "macOS checklist must not say the conversion matrix is still expected to fail");
assert.match(secretLeakScript, /private test repository reference/, "secret leak scan must reject private test repository references");
assert.match(secretLeakScript, /maintainer local Windows path/, "secret leak scan must reject maintainer-local Windows paths");
assert.match(secretLeakScript, /AuthKey_/, "secret leak scan must reject Apple signing private key filenames");
assert.match(secretLeakScript, /TAURI_SIGNING_PRIVATE_KEY/, "secret leak scan must reject accidental Tauri signing key values");

console.log("Repository metadata tests passed.");
