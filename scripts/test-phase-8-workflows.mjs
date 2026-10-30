import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { reviewedRustAction } from "./lib/workflow-action-pins.mjs";

const root = process.cwd();
const staging = read("ocr-runtime-staging.yml");
const conversions = read("macos-conversions.yml");
const dmg = read("macos-dmg.yml");
const appimage = read("linux-appimage.yml");
const engines = read("phase-8-engine-staging.yml");
const pythonAudit = fs.readFileSync(path.join(root, "scripts", "audit-ocr-platform-locks.mjs"), "utf8");

assert.match(staging, /^name: OCR Runtime Staging$/m);
assert.match(staging, /lfs: false/g);
assert.match(staging, /macos-aarch64[\s\S]*macos-latest/);
assert.doesNotMatch(staging, /macos-x86_64|macos-15-intel|build:paddle:macos-intel/);
assert.match(staging, /linux-x64[\s\S]*ubuntu-22\.04/);
assert.match(staging, /PYTHON_VERSION: 3\.12\.10/);
assert.match(staging, /UV_VERSION: 0\.11\.21/);
assert.match(staging, /windows-x64[\s\S]*windows-latest/);
assert.match(staging, /paddle\.utils\.run_check/);
assert.match(staging, /--verify-reproducible/);
assert.match(staging, /name: ocr-models[\s\S]*include-hidden-files: true/);
assert.match(staging, /inventory:ocr-runtime-licenses/);
assert.doesNotMatch(staging, /CoreML|OpenVINO|DirectML/);
assert.doesNotMatch(staging, /gh release (create|upload)/);
assert.doesNotMatch(pythonAudit, /macos-x86_64|paddle-build-macos/);
assert.match(pythonAudit, /windows-x64/);
assert.match(pythonAudit, /macos-aarch64/);
assert.match(pythonAudit, /linux-x64/);

assert.match(engines, /^name: Phase 8 Engine Staging$/m);
assert.match(engines, /artifact_id: 7621760659/);
assert.match(engines, /artifact_sha256: 1d16c5ad057d16b6a2293c1d49ee0e5f591bf380f5bcdecf1e83058d4e2de082/);
assert.match(engines, /package-locked-pdfium-platform\.mjs/);
assert.ok(engines.includes(reviewedRustAction));
assert.match(engines, /wrapper 0\.4\.0/);
assert.match(engines, /--evidence "\$evidence"/);
assert.match(engines, /pdfium-0\.4-package-evidence-/);
assert.match(engines, /test:pdfium-wrapper/);
assert.match(engines, /clippy:pdfium-wrapper/);
assert.match(engines, /restage-platform-pdfium\.mjs/);
assert.doesNotMatch(engines, /complete-macos-sidecar-set\.mjs/);
assert.match(engines, /lipo "src-tauri\/binaries\/\$engine-aarch64-apple-darwin" -verify_arch arm64/);
assert.match(engines, /macOS Engine Staging\|success\|\$GITHUB_SHA/);
assert.doesNotMatch(engines, /macos-universal|macos-x86_64|macos-15-intel/);
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
assert.doesNotMatch(dmg, /macos-native-proof-intel|verify-intel:/);
assert.doesNotMatch(dmg, /mc-macos-release-artifacts\/Multi-Converter_macos-aarch64\.dmg/);
assert.match(appimage, /xvfb-run -a npm run test:linux:native/);
assert.match(appimage, /linux-native-proof/);
assert.doesNotMatch(appimage, /mc-linux-release-artifacts\/Multi-Converter_linux-x64\.AppImage/);

console.log("Phase 8 workflow contracts passed: native OCR staging, Apple Silicon DMG and Linux AppImage evidence are wired without public aliases.");

function read(name) {
  return fs.readFileSync(path.join(root, ".github", "workflows", name), "utf8");
}
