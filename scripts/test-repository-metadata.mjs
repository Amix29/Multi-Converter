import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
const securityPolicy = fs.readFileSync(path.join(root, "SECURITY.md"), "utf8");
const githubTopics = fs.readFileSync(path.join(root, "docs", "GITHUB_TOPICS.md"), "utf8");
const testingDocs = fs.readFileSync(path.join(root, "docs", "TESTING.md"), "utf8");
const v107Plan = fs.readFileSync(path.join(root, "docs", "V1_0_7_PLAN.md"), "utf8");
const v107Validation = fs.readFileSync(path.join(root, "docs", "V1_0_7_VALIDATION.md"), "utf8");
const v107Ocr = fs.readFileSync(path.join(root, "docs", "V1_0_7_OCR.md"), "utf8");
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
assert.equal(packageJson.scripts["status:v1.0.6"], "node scripts/report-v1-0-6-status.mjs", "V1.0.6 status report script must be exposed through npm");
assert.equal(packageJson.scripts["test:v1.0.6-status"], "node scripts/test-v1-0-6-status.mjs", "V1.0.6 status assertion script must be exposed through npm");
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
  "macos-apple-silicon",
  "macos-dmg",
  "mac-file-converter",
  "apple-silicon",
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
  "macos-apple-silicon",
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

assert.match(githubTopics, /V1\.0\.6 is the current public stable release/, "GitHub topic docs must identify the current stable release");
assert.match(githubTopics, /Linux x64 is available as one AppImage with updater metadata/, "GitHub topic docs must describe Linux release support");
assert.match(testingDocs, /npm run status:v1\.0\.6/, "testing docs must document the current V1.0.6 status audit command");
assert.match(testingDocs, /npm run test:secret-leaks/, "testing docs must document the secret leak scan");
assert.match(testingDocs, /npm run test:production-config/, "testing docs must document the production config test");
assert.match(testingDocs, /npm run test:linux:ci/, "testing docs must document the Linux CI gate");
assert.match(testingDocs, /npm run test:linux:environment/, "testing docs must document the Linux environment gate");
assert.match(testingDocs, /npm run test:linux:host/, "testing docs must document the Linux host gate");
assert.match(testingDocs, /npm run test:linux:conversions/, "testing docs must document the full Linux conversion gate");
assert.match(testingDocs, /npm run verify:linux-appimage/, "testing docs must document the Linux AppImage verification gate");
assert.match(testingDocs, /Linux AppImage Build/, "testing docs must document the Linux AppImage workflow");
assert.match(testingDocs, /linux-x86_64/, "testing docs must document the Linux updater platform key");
assert.match(testingDocs, /committed V1\.0\.6 evidence is complete[\s\S]*`releaseReady: true`/, "testing docs must describe the published V1.0.6 status accurately");
assert.match(testingDocs, /V1\.0\.7[\s\S]*conversion and OCR/, "testing docs must require a new version-specific gate for V1.0.7");
assert.match(testingDocs, /macOS Conversion Matrix[\s\S]*requires actual ARM FFmpeg/, "testing docs must require native ARM conversion evidence");
assert.match(v107Plan, /file converter[\s\S]*PP-OCRv6_medium/, "V1.0.7 plan must preserve the conversion and local OCR scope");
assert.match(v107Plan, /repository metadata is synchronized to `1\.0\.7`[\s\S]*version change is not a release-readiness claim/, "V1.0.7 plan must distinguish development metadata from release readiness");
assert.match(v107Validation, /Overall gate:\s*\*\*blocked\*\*/, "V1.0.7 validation must not claim release readiness");
assert.match(v107Ocr, /Windows implementation:\s*\*\*patched reference runtime built and packaged; smoke and full 40-case corpus passed\*\*/, "OCR documentation must record the verified Windows runtime boundary");
assert.match(v107Ocr, /Windows NSIS build:\s*\*\*local [a-f0-9]+ candidate built; updater signature verified; installed acceptance pending\*\*/, "OCR documentation must distinguish the verified package from pending installed acceptance");
assert.match(v107Ocr, /Windows packaged application smoke:\s*\*\*previous checkpoint only; current application acceptance pending\*\*/, "OCR documentation must distinguish packaged smoke evidence from the installed matrix");
assert.match(v107Ocr, /macOS Apple Silicon runtime:\s*\*\*official runtime built and packaged reproducibly; license inventory passed; worker startup and application acceptance pending/, "Mac OCR packaging must remain distinct from worker and installed application acceptance");
const macSelection = JSON.parse(fs.readFileSync(path.join(root, "docs", "audits", "2026-10-30", "macos-ocr-runtime-selection.json"), "utf8"));
const macLicenses = JSON.parse(fs.readFileSync(path.join(root, "docs", "audits", "2026-10-30", "macos-ocr-runtime-licenses.json"), "utf8"));
assert.equal(macSelection.platform, "macos-aarch64");
assert.ok(macSelection.artifact.fileCount > 0);
assert.match(macSelection.archive.sha256, /^[a-f0-9]{64}$/);
assert.equal(macLicenses.runtimeAggregateSha256, macSelection.artifact.aggregateSha256);
assert.deepEqual(macLicenses.packagesWithoutLicenseFiles, []);
assert.deepEqual(macLicenses.unresolvedMetadata, []);
assert.match(v107Ocr, /Linux x64:\s*\*\*official runtime built and packaged reproducibly; direct 40-case corpus passed and isolated extracted-archive four-case probe passed/, "Linux OCR documentation must distinguish native worker proof from installed application acceptance");
const linuxOcrProof = JSON.parse(fs.readFileSync(path.join(root, "docs", "audits", "2026-10-30", "linux-ocr-corpus-direct.json"), "utf8"));
const linuxArchiveProof = JSON.parse(fs.readFileSync(path.join(root, "docs", "audits", "2026-10-30", "linux-ocr-corpus-packaged.json"), "utf8"));
assert.equal(linuxOcrProof.platform, "linux-x64");
assert.equal(linuxOcrProof.results.length, 40);
assert.ok(linuxOcrProof.cleanMean >= 0.98 && linuxOcrProof.difficultMean >= 0.95);
assert.ok(linuxOcrProof.networkSamples > 0);
assert.deepEqual(linuxOcrProof.observedWorkerConnections, []);
assert.equal(linuxArchiveProof.results.length, 4);
assert.ok(linuxArchiveProof.results.every((entry) => entry.accuracy === 1));
assert.match(linuxArchiveProof.runtimeArchiveSha256, /^[a-f0-9]{64}$/);
assert.deepEqual(linuxArchiveProof.observedWorkerConnections, []);
assert.match(v107Ocr, /PDF Flow[\s\S]*Image Flow And Clipboard/, "OCR documentation must cover both required user outcomes");
assert.match(releaseNotesDraft, /Multi-Converter_1\.0\.5_linux-x64\.AppImage/, "release notes draft must name the versioned Linux AppImage");
assert.match(releaseNotesDraft, /Linux automatic updates are enabled/, "release notes draft must mention enabled Linux automatic updates");
assert.match(releaseNotesDraft, /Linux AppImage Build[\s\S]*Linux Conversion Matrix[\s\S]*Linux AppImage Verification/, "release notes draft must keep final Linux proof visible before publication");
assert.match(releaseNotesDraft, /must not be published until the final downloaded Linux AppImage smoke test/i, "release notes draft must keep final Linux smoke proof visible before publication");
assert.doesNotMatch(testingDocs, /strict gate is expected to fail until real macOS sidecars/i, "testing docs must not describe the current macOS conversion matrix as still waiting on staged engines");
assert.match(macosChecklist, /No compile-only placeholders count as conversion evidence/, "Mac native gates must reject placeholder evidence");
assert.match(macosChecklist, /aarch64-apple-darwin/, "Mac checklist must target ARM");
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
