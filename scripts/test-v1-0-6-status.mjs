import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mc-v106-status-"));

try {
  const current = runStatus("current.md", fs.readFileSync(path.join(root, "docs", "V1_0_6_VALIDATION.md"), "utf8"), {
    assertMode: true,
  });
  assert.equal(current.version, "1.0.6");
  assert.equal(current.releaseReady, false, "current V1.0.6 evidence should stay blocked until final platform proofs exist");
  assert.match(current.blockers.join("\n"), /macOS Conversion Matrix/);
  assert.match(current.blockers.join("\n"), /Linux AppImage Build/);
  assert.doesNotMatch(current.blockers.join("\n"), /Final Codex Security pass/);

  const ready = runStatus("ready.md", completedEvidence(), { requireReady: true });
  assert.equal(ready.releaseReady, true, "complete V1.0.6 evidence should satisfy require-ready mode");

  const missingSecurity = runStatus("missing-security.md", completedEvidence().replace("Final Codex Security pass: passed", "Final Codex Security pass: pending"), {
    requireReady: true,
    expectedStatus: 1,
  });
  assert.equal(missingSecurity.status.releaseReady, false);
  assert.match(missingSecurity.output, /Final Codex Security pass evidence is missing/);
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

console.log("V1.0.6 status tests passed.");

function completedEvidence() {
  return `# Multi-Converter v1.0.6 Validation Evidence

## Local Windows Validation

- npm run test:rust: passed

## macOS Release Evidence

- macOS Conversion Matrix (Apple Silicon): success
- macOS Conversion Matrix (Intel): success
- macOS DMG verification (Apple Silicon): success
- macOS DMG verification (Intel): success
- Manual clean-Mac smoke testing: success

## Linux Release Evidence

- Linux AppImage Build: success
- Linux Conversion Matrix: success
- Linux AppImage Verification: success
- Manual Linux AppImage smoke testing: success

## Security And Confidentiality Evidence

- npm run test:secret-leaks: passed
- npm run test:production-config: passed
- Final Codex Security pass: passed
- Confidential information exposure: none found

## Release Asset Evidence

- Windows release assets: prepared
- macOS release assets: prepared
- Linux release assets: prepared
`;
}

function runStatus(name, evidence, options = {}) {
  const evidencePath = path.join(tempDir, name);
  const outPath = path.join(tempDir, `${name}.json`);
  fs.writeFileSync(evidencePath, evidence);
  const args = ["scripts/report-v1-0-6-status.mjs", "--validation-evidence", evidencePath, "--out", outPath];
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
