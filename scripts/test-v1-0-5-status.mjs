import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mc-v105-status-"));
const currentEvidence = fs.readFileSync(path.join(root, "docs", "V1_0_5_VALIDATION.md"), "utf8");
const currentReadme = fs.readFileSync(path.join(root, "README.md"), "utf8");

try {
  const currentStatus = runStatus("current.md", currentEvidence, { assertMode: true });
  assert.equal(currentStatus.summary.hasManualCleanMacEvidence, false, "current pending receipt must not count as clean-Mac proof");
  assert.match(currentStatus.blockers.join("\n"), /Manual clean-Mac Gatekeeper\/install smoke testing/, "current status must keep the clean-Mac blocker");
  const currentReadyGate = runStatus("current-require-ready.md", currentEvidence, { requireReady: true, expectedStatus: 1 });
  assert.equal(currentReadyGate.status.releaseReady, false, "require-ready fixture must still write the failing status JSON");
  assert.match(currentReadyGate.output, /V1\.0\.5 is not release-ready/, "require-ready mode must explain that the release is blocked");

  const falsePositiveEvidence = `${currentEvidence}

## Untrusted Notes

- Manual clean-Mac smoke testing: success
- DMG: Multi-Converter_1.0.5_macos-universal.dmg
- Mounted final downloaded DMG: yes
- Dragged app to Applications: yes
- Unsigned/not-notarized first launch warning verified: yes
- Opened through System Settings > Privacy & Security > Open Anyway: yes
- Confirmed Open prompt: yes
- Second launch verified: yes
- File selection verified: yes
- FFmpeg media conversion verified: yes
- Document/PDF/image advanced conversion verified: yes
- Updater metadata behavior checked: yes
`;
  const falsePositiveStatus = runStatus("false-positive.md", falsePositiveEvidence);
  assert.equal(falsePositiveStatus.summary.hasManualCleanMacEvidence, false, "success lines outside the receipt section must not unlock macOS release readiness");

  const completedReceiptStatus = runStatus("completed-receipt.md", completedReceipt(currentEvidence));
  assert.equal(completedReceiptStatus.summary.hasManualCleanMacEvidence, true, "a complete receipt section must count as clean-Mac proof");
  assert.equal(completedReceiptStatus.summary.cleanMacSmokeEvidence.missing.length, 0, "complete receipt should not report missing smoke-test fields");
  assert.equal(completedReceiptStatus.releaseReady, false, "clean-Mac proof alone must not bypass the final security gate");
  assert.match(completedReceiptStatus.blockers.join("\n"), /Codex Security/, "clean-Mac proof alone must keep the security blocker");

  const readyStatus = runStatus("ready.md", completedReleaseEvidence(currentEvidence), { requireReady: true, readme: readyReadme(currentReadme) });
  assert.equal(readyStatus.releaseReady, true, "complete clean-Mac and accepted security evidence must satisfy require-ready mode");
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

console.log("V1.0.5 status tests passed.");

function runStatus(name, evidence, options = {}) {
  const evidencePath = path.join(tempDir, name);
  const outPath = path.join(tempDir, `${name}.json`);
  fs.writeFileSync(evidencePath, evidence);
  let readmePath = null;
  if (options.readme) {
    readmePath = path.join(tempDir, `${name}.README.md`);
    fs.writeFileSync(readmePath, options.readme);
  }
  const args = ["scripts/report-v1-0-5-status.mjs", "--validation-evidence", evidencePath, "--out", outPath];
  if (readmePath) args.push("--readme", readmePath);
  if (options.assertMode) args.push("--assert");
  if (options.requireReady) args.push("--require-ready");
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  const expectedStatus = options.expectedStatus ?? 0;
  assert.equal(result.status, expectedStatus, result.stderr || result.stdout);
  const status = JSON.parse(fs.readFileSync(outPath, "utf8"));
  return expectedStatus === 0 ? status : { status, output: `${result.stderr}\n${result.stdout}` };
}

function completedReceipt(evidence) {
  return evidence
    .replace("- Manual clean-Mac smoke testing: pending", "- Manual clean-Mac smoke testing: success")
    .replace("- Date: pending", "- Date: 2026-06-13")
    .replace("- Tester: pending", "- Tester: maintainer")
    .replace("- macOS version: pending", "- macOS version: 15.x")
    .replace("- Mac model: pending", "- Mac model: clean test Mac")
    .replace("- Architecture tested: pending", "- Architecture tested: Apple Silicon")
    .replace("- DMG source: pending", "- DMG source: final downloaded GitHub release asset")
    .replace("- Mounted final downloaded DMG: no", "- Mounted final downloaded DMG: yes")
    .replace("- Dragged app to Applications: no", "- Dragged app to Applications: yes")
    .replace("- Unsigned/not-notarized first launch warning verified: no", "- Unsigned/not-notarized first launch warning verified: yes")
    .replace("- Opened through System Settings > Privacy & Security > Open Anyway: no", "- Opened through System Settings > Privacy & Security > Open Anyway: yes")
    .replace("- Confirmed Open prompt: no", "- Confirmed Open prompt: yes")
    .replace("- Second launch verified: no", "- Second launch verified: yes")
    .replace("- File selection verified: no", "- File selection verified: yes")
    .replace("- FFmpeg media conversion verified: no", "- FFmpeg media conversion verified: yes")
    .replace("- Document/PDF/image advanced conversion verified: no", "- Document/PDF/image advanced conversion verified: yes")
    .replace("- Updater metadata behavior checked: no", "- Updater metadata behavior checked: yes")
    .replace("- Notes: pending", "- Notes: clean-Mac smoke fixture only");
}

function completedReleaseEvidence(evidence) {
  return `${completedReceipt(evidence)}

- Exhaustive Codex Security subagent scan: accepted
`;
}

function readyReadme(readme) {
  return readme.replace(
    /\|\s*🍎 macOS\s*\|[^\n]+/,
    "| 🍎 macOS | ✅ Available | `Multi-Converter_1.0.5_macos-universal.dmg` |",
  );
}
