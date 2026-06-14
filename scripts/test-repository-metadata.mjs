import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
const securityPolicy = fs.readFileSync(path.join(root, "SECURITY.md"), "utf8");
const githubTopics = fs.readFileSync(path.join(root, "docs", "GITHUB_TOPICS.md"), "utf8");
const testingDocs = fs.readFileSync(path.join(root, "docs", "TESTING.md"), "utf8");
const releaseNotesDraft = fs.readFileSync(path.join(root, "docs", "RELEASE_NOTES_V1.0.5_DRAFT.md"), "utf8");
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
  "file-conversion",
  "free-file-converter",
  "batch-conversion",
  "multi-format",
  "offline-converter",
  "no-upload",
  "no-cloud",
  "local-first",
  "privacy-first",
  "private-file-converter",
  "secure-file-converter",
  "no-account-required",
  "open-source-converter",
  "cross-platform",
  "desktop-app",
  "tauri",
  "tauri-v2",
  "rust",
  "react",
  "typescript",
  "windows",
  "windows-converter",
  "windows-app",
  "windows-file-converter",
  "windows-installer",
  "macos",
  "macos-converter",
  "macos-app",
  "macos-desktop-app",
  "macos-universal",
  "macos-dmg",
  "mac-file-converter",
  "universal-dmg",
  "apple-silicon",
  "intel-mac",
  "linux",
  "linux-converter",
  "linux-app",
  "linux-desktop",
  "linux-desktop-app",
  "linux-file-converter",
  "appimage",
  "appimage-converter",
  "linux-appimage",
  "pdf-converter",
  "video-converter",
  "image-converter",
]) {
  assert.ok(keywords.has(keyword), `missing package keyword: ${keyword}`);
}

assert.match(readme, /\|\s*.*Windows x64\s*\|\s*.*Available\s*\|/, "README must show Windows x64 as available");
assert.match(readme, /\|\s*.*macOS.*\|\s*.*Available\s*\|/, "README must show macOS as available");
assert.match(readme, /\|\s*.*Linux x64\s*\|\s*.*Available\s*\|/, "README must show Linux x64 as available");
assert.match(readme, /Multi-Converter_linux-x64\.AppImage/, "README must link the stable latest Linux AppImage");
assert.match(readme, /npm run tauri:build:macos/, "README must document the macOS build command");
assert.match(readme, /npm run tauri:build:linux/, "README must document the Linux build command");
assert.match(readme, /refuses this command on Windows\/Linux/, "README must explain that macOS DMG builds are refused on non-macOS hosts");
assert.match(readme, /Advanced macOS engines must not be advertised unless/, "README must not overclaim advanced macOS engines");
assert.match(readme, /docs\/GITHUB_TOPICS\.md/, "README must link the recommended GitHub topics");
assert.match(readme, /private vulnerability reporting/, "README security section must prefer private vulnerability reporting");
assert.doesNotMatch(readme, /open a \*\*GitHub issue\*\*/i, "README must not tell users to post vulnerability details in a public issue");
assert.match(securityPolicy, /Do not post exploit details/, "security policy must warn against public exploit disclosure");
assert.match(securityPolicy, /private vulnerability reporting/, "security policy must prefer a private vulnerability reporting flow");
assert.match(securityPolicy, /minimal public issue/, "security policy must keep public fallback issues minimal");

for (const topic of [
  "file-converter",
  "file-conversion",
  "desktop-converter",
  "batch-conversion",
  "multi-format",
  "offline-converter",
  "local-first",
  "privacy-first",
  "no-upload",
  "open-source-converter",
  "tauri",
  "rust",
  "windows",
  "windows-file-converter",
  "macos",
  "macos-universal",
  "apple-silicon",
  "linux",
  "linux-appimage",
  "appimage",
]) {
  assert.ok(topics.has(topic), `missing recommended GitHub topic: ${topic}`);
  assert.ok(keywords.has(topic), `recommended GitHub topic is missing from package keywords: ${topic}`);
}

assert.ok(topics.size <= 20, `recommended GitHub topic set must stay within GitHub's practical 20-topic limit, got ${topics.size}`);
for (const secondaryTopic of ["free-file-converter", "private-file-converter", "no-cloud", "windows-converter", "macos-converter", "linux-converter"]) {
  assert.match(githubTopics, new RegExp(`\\b${secondaryTopic}\\b`), `missing secondary GitHub discovery term: ${secondaryTopic}`);
  assert.ok(keywords.has(secondaryTopic), `secondary GitHub discovery term is missing from package keywords: ${secondaryTopic}`);
}

assert.match(githubTopics, /Linux x64 is available for V1\.0\.5 as one AppImage with updater metadata\./, "GitHub topic docs must describe Linux release support");
assert.match(testingDocs, /npm run status:v1\.0\.5/, "testing docs must document the V1.0.5 status audit command");
assert.match(testingDocs, /npm run test:secret-leaks/, "testing docs must document the secret leak scan");
assert.match(testingDocs, /npm run test:production-config/, "testing docs must document the production config test");
assert.match(testingDocs, /npm run test:linux:ci/, "testing docs must document the Linux CI gate");
assert.match(testingDocs, /npm run test:linux:environment/, "testing docs must document the Linux environment gate");
assert.match(testingDocs, /npm run test:linux:host/, "testing docs must document the Linux host gate");
assert.match(testingDocs, /npm run test:linux:conversions/, "testing docs must document the full Linux conversion gate");
assert.match(testingDocs, /npm run verify:linux-appimage/, "testing docs must document the Linux AppImage verification gate");
assert.match(testingDocs, /Linux AppImage Build/, "testing docs must document the Linux AppImage workflow");
assert.match(testingDocs, /linux-x86_64/, "testing docs must document the Linux updater platform key");
assert.match(testingDocs, /current preparation state[\s\S]*`releaseReady` should remain false[\s\S]*Linux AppImage[\s\S]*evidence/, "testing docs must state that current V1.0.5 readiness remains false until final macOS and Linux proof exists");
assert.match(testingDocs, /same audit can report `releaseReady: true`/, "testing docs must allow the status audit to pass once final release proof exists");
assert.match(testingDocs, /two-architecture `macOS Conversion Matrix`[\s\S]*Apple Silicon[\s\S]*Intel/, "testing docs must require macOS conversion evidence on both architectures");
assert.match(testingDocs, /single-run macOS conversion evidence[\s\S]*not enough for final v1\.0\.5 readiness/, "testing docs must not let the older single-run matrix unlock final readiness");
assert.match(releaseNotesDraft, /Multi-Converter_1\.0\.5_linux-x64\.AppImage/, "release notes draft must name the versioned Linux AppImage");
assert.match(releaseNotesDraft, /Linux automatic updates are enabled/, "release notes draft must mention enabled Linux automatic updates");
assert.match(releaseNotesDraft, /Linux AppImage Build[\s\S]*Linux Conversion Matrix[\s\S]*Linux AppImage Verification/, "release notes draft must keep final Linux proof visible before publication");
assert.match(releaseNotesDraft, /must not be published until the final downloaded Linux AppImage smoke test/i, "release notes draft must keep final Linux smoke proof visible before publication");
assert.doesNotMatch(testingDocs, /strict gate is expected to fail until real macOS sidecars/i, "testing docs must not describe the current macOS conversion matrix as still waiting on staged engines");
assert.match(macosChecklist, /workflow must fail if any required `macos-universal` advanced engine entry is missing/, "macOS checklist must describe missing engines as a failure condition, not as the current expected state");
assert.match(macosChecklist, /Apple Silicon[\s\S]*Intel/, "macOS checklist must require final conversion validation on both macOS architectures");
assert.doesNotMatch(macosChecklist, /workflow is expected to fail until all required `macos-universal` advanced engine entries exist/i, "macOS checklist must not say the conversion matrix is still expected to fail");
assert.match(secretLeakScript, /private test repository reference/, "secret leak scan must reject private test repository references");
assert.match(secretLeakScript, /maintainer local Windows path/, "secret leak scan must reject maintainer-local Windows paths");
assert.match(secretLeakScript, /tracked dotenv file/, "secret leak scan must reject tracked dotenv files");
assert.match(secretLeakScript, /tracked npm credentials file/, "secret leak scan must reject tracked npm credential files");
assert.match(secretLeakScript, /tracked netrc credentials file/, "secret leak scan must reject tracked netrc credential files");
assert.match(secretLeakScript, /AuthKey_/, "secret leak scan must reject Apple signing private key filenames");
assert.match(secretLeakScript, /\\.p12/, "secret leak scan must reject Apple signing certificate filenames");
assert.match(secretLeakScript, /mobileprovision/, "secret leak scan must reject Apple provisioning profile filenames");
assert.match(secretLeakScript, /tracked private key file/, "secret leak scan must reject tracked private key filenames");
assert.match(secretLeakScript, /TAURI_SIGNING_PRIVATE_KEY/, "secret leak scan must reject accidental Tauri signing key values");

console.log("Repository metadata tests passed.");
