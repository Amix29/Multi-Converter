import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const staging = read("ocr-runtime-staging.yml");
const conversions = read("macos-conversions.yml");
const dmg = read("macos-dmg.yml");
const appimage = read("linux-appimage.yml");
const engines = read("phase-8-engine-staging.yml");
const paddleIntelBuild = fs.readFileSync(path.join(root, "scripts", "build-paddle-macos-intel.mjs"), "utf8");
const pythonAudit = fs.readFileSync(path.join(root, "scripts", "audit-ocr-platform-locks.mjs"), "utf8");

assert.match(staging, /^name: OCR Runtime Staging$/m);
assert.match(staging, /lfs: false/g);
assert.match(staging, /macos-aarch64[\s\S]*macos-latest/);
assert.match(staging, /macos-x86_64[\s\S]*macos-15-intel/);
assert.match(staging, /linux-x64[\s\S]*ubuntu-22\.04/);
assert.match(staging, /PYTHON_VERSION: 3\.12\.10/);
assert.match(staging, /UV_VERSION: 0\.11\.21/);
assert.match(staging, /build:paddle:macos-intel/);
assert.match(staging, /paddle\.utils\.run_check/);
assert.match(staging, /--verify-reproducible/);
assert.match(staging, /inventory:ocr-runtime-licenses/);
assert.doesNotMatch(staging, /CoreML|OpenVINO|DirectML/);
assert.doesNotMatch(staging, /gh release (create|upload)/);
assert.match(paddleIntelBuild, /paddle-build-macos-x86_64\.lock\.txt/);
assert.match(paddleIntelBuild, /--require-hashes/);
assert.match(paddleIntelBuild, /uv 0\.11\.21/);
assert.match(paddleIntelBuild, /runWithRetries/);
assert.match(pythonAudit, /paddle-build-macos-x86_64\.lock\.txt/);

assert.match(engines, /^name: Phase 8 Engine Staging$/m);
assert.match(engines, /artifact_id: 7609654944/);
assert.match(engines, /artifact_id: 7621760659/);
assert.match(engines, /artifact_sha256: d393adbaddeb900cee51a62d7ef0cee589da6f344f660b329e960f1327d3cbf5/);
assert.match(engines, /artifact_sha256: 1d16c5ad057d16b6a2293c1d49ee0e5f591bf380f5bcdecf1e83058d4e2de082/);
assert.match(engines, /package-locked-pdfium-platform\.mjs/);
assert.match(engines, /restage-platform-pdfium\.mjs/);
assert.doesNotMatch(engines, /gh release (create|upload)/);

for (const [label, workflow] of [["macOS conversions", conversions], ["macOS DMG", dmg], ["Linux AppImage", appimage]]) {
  assert.match(workflow, /ocr_staging_run_id:/, `${label}: OCR staging input absent`);
  assert.match(workflow, /MC_OCR_RUNTIME_STAGING_RUN_ID/, `${label}: persistent test variable absent`);
  assert.match(workflow, /OCR Runtime Staging\|success\|\$GITHUB_SHA/, `${label}: exact workflow/commit validation absent`);
  assert.match(workflow, /stage:ocr-runtime-artifacts/, `${label}: secure OCR staging absent`);
  assert.match(workflow, /test:ocr:runtime/, `${label}: packaged runtime smoke absent`);
  assert.match(workflow, /test:ocr:corpus/, `${label}: corpus OCR absent`);
  assert.match(workflow, /lfs: false/, `${label}: Git LFS must remain disabled`);
}

assert.match(dmg, /test:macos:native/);
assert.match(dmg, /macos-native-proof-apple-silicon/);
assert.match(dmg, /macos-native-proof-intel/);
assert.doesNotMatch(dmg, /mc-macos-release-artifacts\/Multi-Converter_macos-universal\.dmg/);
assert.match(appimage, /xvfb-run -a npm run test:linux:native/);
assert.match(appimage, /linux-native-proof/);
assert.doesNotMatch(appimage, /mc-linux-release-artifacts\/Multi-Converter_linux-x64\.AppImage/);

console.log("Phase 8 workflow contracts passed: native OCR staging, universal DMG and Linux AppImage evidence are wired without public aliases.");

function read(name) {
  return fs.readFileSync(path.join(root, ".github", "workflows", name), "utf8");
}
