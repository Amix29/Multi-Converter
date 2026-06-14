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
  assert.equal(currentStatus.summary.hasMacosTwoArchitectureConversionEvidence, true, "current evidence must record two-architecture macOS conversion proof");
  assert.equal(currentStatus.summary.hasMacosTwoArchitectureDmgEvidence, true, "current evidence must record two-architecture DMG proof");
  assert.equal(currentStatus.summary.hasMacosAutomatedReleaseEvidence, true, "current evidence must record automated macOS release proof");
  assert.equal(currentStatus.summary.hasLinuxAutomatedReleaseEvidence, false, "current evidence must not claim final Linux automation proof before the real AppImage workflow runs");
  assert.equal(currentStatus.summary.hasLinuxSidecarStagingEvidence, true, "current evidence must record the real Linux sidecar staging proof");
  assert.equal(currentStatus.summary.hasManualLinuxAppImageEvidence, false, "current pending receipt must not count as Linux AppImage smoke proof");
  assert.deepEqual(currentStatus.summary.missingLinuxAdvancedEngines, ["pdfium", "libreoffice", "pandoc", "libvips"], "current status must record missing Linux advanced engines");
  assert.doesNotMatch(currentStatus.blockers.join("\n"), /macOS Conversion Matrix/, "current status must not keep the macOS conversion blocker after final matrix proof");
  assert.doesNotMatch(currentStatus.blockers.join("\n"), /DMG verification.*Intel/, "current status must not keep the Intel DMG blocker after final DMG proof");
  assert.match(currentStatus.blockers.join("\n"), /Manual clean-Mac Gatekeeper\/install smoke testing/, "current status must keep the clean-Mac blocker");
  assert.doesNotMatch(currentStatus.blockers.join("\n"), /Linux Sidecar Staging success evidence is missing/, "current status must not keep the Linux sidecar staging blocker after real workflow proof");
  assert.match(currentStatus.blockers.join("\n"), /Missing reviewed linux-x64 advanced engines/, "current status must keep the Linux advanced-engine blocker");
  assert.match(currentStatus.blockers.join("\n"), /Linux AppImage Build success evidence is missing/, "current status must keep the Linux AppImage build blocker");
  assert.match(currentStatus.blockers.join("\n"), /Linux Conversion Matrix success evidence is missing/, "current status must keep the Linux conversion blocker");
  assert.match(currentStatus.blockers.join("\n"), /Linux AppImage verification success evidence is missing/, "current status must keep the Linux verification blocker");
  assert.match(currentStatus.blockers.join("\n"), /Manual Linux AppImage smoke testing/, "current status must keep the final Linux AppImage smoke-test blocker");
  assert.match(currentStatus.blockers.join("\n"), /Codex Security/, "current status must keep the final security blocker until the post-Linux scan is recorded");
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
  assert.equal(completedReceiptStatus.summary.hasManualLinuxAppImageEvidence, false, "macOS receipt alone must not count as Linux AppImage smoke proof");
  assert.match(completedReceiptStatus.blockers.join("\n"), /Codex Security/, "manual receipts alone must not satisfy the final security blocker");
  assert.doesNotMatch(completedReceiptStatus.blockers.join("\n"), /macOS Conversion Matrix/, "complete macOS automation evidence must satisfy the macOS conversion blocker");
  assert.doesNotMatch(completedReceiptStatus.blockers.join("\n"), /DMG verification/, "complete automation evidence must satisfy the DMG blocker");
  assert.equal(completedReceiptStatus.summary.hasCodexSecurityScanEvidence, false, "pre-final scan evidence must not count as final Codex Security proof");

  const missingMetadataStatus = runStatus("missing-metadata.md", completedReceipt(currentEvidence).replace("- Date: 2026-06-13", "- Date: pending"));
  assert.equal(missingMetadataStatus.summary.hasManualCleanMacEvidence, false, "receipt metadata must be recorded before clean-Mac proof counts");
  assert.match(missingMetadataStatus.summary.cleanMacSmokeEvidence.missing.join("\n"), /Date recorded/, "missing receipt metadata must be reported explicitly");

  const vagueArchitectureStatus = runStatus("vague-architecture.md", completedReceipt(currentEvidence).replace("- Architecture tested: Apple Silicon", "- Architecture tested: clean test machine"));
  assert.equal(vagueArchitectureStatus.summary.hasManualCleanMacEvidence, false, "clean-Mac proof must name Apple Silicon or Intel");
  assert.match(vagueArchitectureStatus.summary.cleanMacSmokeEvidence.missing.join("\n"), /Architecture tested records Apple Silicon or Intel/, "vague architecture evidence must be reported explicitly");

  const localDmgSourceStatus = runStatus("local-dmg-source.md", completedReceipt(currentEvidence).replace("- DMG source: final downloaded GitHub release asset", "- DMG source: local workflow artifact"));
  assert.equal(localDmgSourceStatus.summary.hasManualCleanMacEvidence, false, "clean-Mac proof must use the final downloaded release DMG");
  assert.match(localDmgSourceStatus.summary.cleanMacSmokeEvidence.missing.join("\n"), /Final downloaded GitHub release DMG source recorded/, "local DMG source evidence must be reported explicitly");

  const untrustedSecurityStatus = runStatus(
    "untrusted-security.md",
    `${pendingSecurityEvidence(completedReceipt(currentEvidence))}

## Untrusted Notes

- Final Codex Security scan after Linux AppImage/release asset changes: accepted
`,
    { requireReady: true, expectedStatus: 1, readme: readyReadme(currentReadme) },
  );
  assert.equal(untrustedSecurityStatus.status.releaseReady, false, "Codex Security evidence outside the security section must not unlock readiness");
  assert.match(untrustedSecurityStatus.output, /Codex Security/, "untrusted security evidence must keep the security blocker");

  const incompleteSecurityStatus = runStatus(
    "incomplete-security.md",
    incompleteSecurityEvidence(completedReceipt(currentEvidence)),
    { requireReady: true, expectedStatus: 1, readme: readyReadme(currentReadme) },
  );
  assert.equal(incompleteSecurityStatus.status.releaseReady, false, "a bare accepted Codex Security line must not unlock readiness");
  assert.match(incompleteSecurityStatus.output, /Final security date recorded/, "incomplete security evidence must report missing structured fields");

  const appleSiliconOnlyStatus = runStatus("apple-silicon-only.md", completedReleaseEvidence(currentEvidence).replace(/^- macOS Conversion Matrix \(Intel\):.*\n/m, ""), {
    requireReady: true,
    expectedStatus: 1,
    readme: readyReadme(currentReadme),
  });
  assert.equal(appleSiliconOnlyStatus.status.releaseReady, false, "Apple Silicon-only conversion proof must not unlock universal macOS readiness");
  assert.match(appleSiliconOnlyStatus.output, /Intel/, "missing Intel conversion evidence must be reported explicitly");

  const missingIntelDmgStatus = runStatus("missing-intel-dmg.md", completedReleaseEvidence(currentEvidence).replace(/^- macOS DMG Verification \(Intel\):.*\n/m, ""), {
    requireReady: true,
    expectedStatus: 1,
    readme: readyReadme(currentReadme),
  });
  assert.equal(missingIntelDmgStatus.status.releaseReady, false, "Apple Silicon-only DMG proof must not unlock universal macOS readiness");
  assert.match(missingIntelDmgStatus.output, /DMG verification.*Intel/, "missing Intel DMG evidence must be reported explicitly");

  const missingReadmeInstallNotesStatus = runStatus("missing-readme-install-notes.md", completedReleaseEvidence(currentEvidence), {
    requireReady: true,
    expectedStatus: 1,
    readme: readyReadmeTableOnly(currentReadme),
  });
  assert.equal(missingReadmeInstallNotesStatus.status.releaseReady, false, "macOS release readiness must require public README install notes");
  assert.match(missingReadmeInstallNotesStatus.output, /README macOS status matches available release evidence/, "missing README install notes must fail the README evidence check");

  const incompleteReadmeInstallNotesStatus = runStatus("incomplete-readme-install-notes.md", completedReleaseEvidence(currentEvidence), {
    requireReady: true,
    expectedStatus: 1,
    readme: readyReadme(currentReadme).replace("System Settings > Privacy & Security", "Privacy & Security"),
  });
  assert.equal(incompleteReadmeInstallNotesStatus.status.releaseReady, false, "macOS release readiness must require the full System Settings install path");
  assert.match(incompleteReadmeInstallNotesStatus.output, /README macOS status matches available release evidence/, "incomplete README install notes must fail the README evidence check");

  const missingReadmeArchitectureStatus = runStatus("missing-readme-architectures.md", completedReleaseEvidence(currentEvidence), {
    requireReady: true,
    expectedStatus: 1,
    readme: readyReadme(currentReadme).replace(" for Apple Silicon and Intel Macs", ""),
  });
  assert.equal(missingReadmeArchitectureStatus.status.releaseReady, false, "macOS release readiness must require Apple Silicon and Intel README wording");
  assert.match(missingReadmeArchitectureStatus.output, /README macOS status matches available release evidence/, "missing README architecture wording must fail the README evidence check");

  const missingLinuxAutomationStatus = runStatus("missing-linux-automation.md", completedLinuxReceipt(completedReceipt(currentEvidence)), {
    requireReady: true,
    expectedStatus: 1,
    readme: readyReadme(currentReadme),
  });
  assert.equal(missingLinuxAutomationStatus.status.releaseReady, false, "Linux smoke proof alone must not unlock release readiness without AppImage workflow evidence");
  assert.match(missingLinuxAutomationStatus.output, /Linux AppImage Build success evidence is missing/, "missing Linux AppImage build evidence must be reported explicitly");

  const missingLinuxSmokeStatus = runStatus("missing-linux-smoke.md", finalLinuxAutomationEvidence(completedReceipt(currentEvidence)), {
    requireReady: true,
    expectedStatus: 1,
    readme: readyReadme(currentReadme),
  });
  assert.equal(missingLinuxSmokeStatus.status.releaseReady, false, "Linux automation proof alone must not unlock release readiness without AppImage smoke testing");
  assert.match(missingLinuxSmokeStatus.output, /Manual Linux AppImage smoke testing/, "missing Linux AppImage smoke proof must be reported explicitly");

  const missingLinuxConversionStatus = runStatus("missing-linux-conversion.md", completedReleaseEvidence(currentEvidence).replace(/^- Linux Conversion Matrix:.*\n/m, ""), {
    requireReady: true,
    expectedStatus: 1,
    readme: readyReadme(currentReadme),
  });
  assert.equal(missingLinuxConversionStatus.status.releaseReady, false, "Linux release readiness must require Linux Conversion Matrix evidence");
  assert.match(missingLinuxConversionStatus.output, /Linux Conversion Matrix success evidence is missing/, "missing Linux conversion matrix evidence must be reported explicitly");

  const missingLinuxSidecarStatus = runStatus("missing-linux-sidecar.md", completedReleaseEvidence(currentEvidence).replace(/^- Linux Sidecar Staging:.*\n/m, ""), {
    requireReady: true,
    expectedStatus: 1,
    readme: readyReadme(currentReadme),
  });
  assert.equal(missingLinuxSidecarStatus.status.releaseReady, false, "Linux release readiness must require Linux sidecar staging evidence");
  assert.match(missingLinuxSidecarStatus.output, /Linux Sidecar Staging success evidence is missing/, "missing Linux sidecar staging evidence must be reported explicitly");

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
  return completedFinalSecurityEvidence(
    completedLinuxReceipt(finalLinuxAutomationEvidence(completedReceipt(finalDmgVerificationEvidence(finalMacosConversionEvidence(evidence))))),
  );
}

function finalLinuxAutomationEvidence(evidence) {
  return evidence
    .replace(
      "- Linux Sidecar Staging: pending",
      "- Linux Sidecar Staging: run `9991999`, success. Published `ffmpeg-x86_64-unknown-linux-gnu`, `ffmpeg-x86_64-unknown-linux-gnu.sha256`, `ffprobe-x86_64-unknown-linux-gnu` and `ffprobe-x86_64-unknown-linux-gnu.sha256` from reviewed Linux x64 binaries.",
    )
    .replace(
      "- Linux AppImage Build: pending",
      "- Linux AppImage Build: run `9992001`, success. Built, signed and packaged `Multi-Converter_1.0.5_linux-x64.AppImage` with real Linux sidecars.",
    )
    .replace(
      "- Linux Conversion Matrix: pending",
      "- Linux Conversion Matrix: run `9992001`, success. Passed `npm run test:linux:conversions` on Linux x64 with real Linux FFmpeg/ffprobe sidecars.",
    )
    .replace(
      "- Linux AppImage Verification: pending",
      "- Linux AppImage Verification: run `9992002`, success. Verified `Multi-Converter_1.0.5_linux-x64.AppImage` on Linux before release publication.",
    );
}

function completedLinuxReceipt(evidence) {
  return evidence
    .replace("- Manual Linux AppImage smoke testing: pending", "- Manual Linux AppImage smoke testing: success")
    .replace("- Linux distribution: pending", "- Linux distribution: Ubuntu 22.04 clean desktop")
    .replace("- AppImage source: pending", "- AppImage source: final downloaded GitHub release asset")
    .replace("- Marked AppImage executable: no", "- Marked AppImage executable: yes")
    .replace("- Launched AppImage: no", "- Launched AppImage: yes")
    .replace("- Notes: pending", "- Notes: release smoke fixture only")
    .replace("- Architecture tested: pending", "- Architecture tested: x64")
    .replace("- Date: pending", "- Date: 2026-06-13")
    .replace("- Tester: pending", "- Tester: maintainer")
    .replace("- File selection verified: no", "- File selection verified: yes")
    .replace("- FFmpeg media conversion verified: no", "- FFmpeg media conversion verified: yes")
    .replace("- Document/PDF/image advanced conversion verified: no", "- Document/PDF/image advanced conversion verified: yes")
    .replace("- Updater metadata behavior checked: no", "- Updater metadata behavior checked: yes");
}

function pendingSecurityEvidence(evidence) {
  return evidence
    .replace(/^- Final Codex Security scan.*$/m, "- Final Codex Security scan after Linux AppImage/release asset changes: pending")
    .replace(/^- Final security date:.*$/m, "- Final security date: pending")
    .replace(/^- Final security reviewer:.*$/m, "- Final security reviewer: pending")
    .replace(/^- Final security scope:.*$/m, "- Final security scope: pending")
    .replace(/^- Final confidential information exposure:.*$/m, "- Final confidential information exposure: pending")
    .replace(/^- Final security outcome:.*$/m, "- Final security outcome: pending");
}

function incompleteSecurityEvidence(evidence) {
  return pendingSecurityEvidence(evidence).replace(
    "- Final Codex Security scan after Linux AppImage/release asset changes: pending",
    "- Final Codex Security scan after Linux AppImage/release asset changes: accepted",
  );
}

function completedFinalSecurityEvidence(evidence) {
  return evidence
    .replace(
      "- Final Codex Security scan after Linux AppImage/release asset changes: pending",
      "- Final Codex Security scan after Linux AppImage/release asset changes: passed",
    )
    .replace("- Final security date: pending", "- Final security date: 2026-06-14")
    .replace("- Final security reviewer: pending", "- Final security reviewer: Codex Security final pass")
    .replace(
      "- Final security scope: pending",
      "- Final security scope: full repository diff and tracked-file confidentiality scan after Linux AppImage/release asset evidence",
    )
    .replace(
      "- Final confidential information exposure: pending",
      "- Final confidential information exposure: no tracked secret, signing key value, private repository reference or maintainer-local path exposure found",
    )
    .replace("- Final security outcome: pending", "- Final security outcome: no surviving reportable finding remains");
}

function finalMacosConversionEvidence(evidence) {
  if (
    /macOS Conversion Matrix \(Apple Silicon\):\s*run `\d+`, success/i.test(evidence) &&
    /macOS Conversion Matrix \(Intel\):\s*run `\d+`, success/i.test(evidence)
  ) {
    return evidence;
  }
  return evidence.replace(
    /^- macOS Conversion Matrix \(single macOS runner\):.*$/m,
    "- macOS Conversion Matrix (Apple Silicon): run `9990001`, success. Passed the strict macOS conversion matrix for the conversions exposed on macOS with the staged engine set.\n- macOS Conversion Matrix (Intel): run `9990002`, success. Passed the strict macOS conversion matrix for the conversions exposed on macOS with the staged engine set.",
  );
}

function finalDmgVerificationEvidence(evidence) {
  if (
    /macOS DMG Build \(Apple Silicon\):\s*run `\d+`, success/i.test(evidence) &&
    /macOS DMG Verification \(Intel\):\s*run `\d+`, success/i.test(evidence)
  ) {
    return evidence;
  }
  return evidence.replace(
    /^- macOS DMG Build \(Apple Silicon\):.*$/m,
    "- macOS DMG Build (Apple Silicon): run `9991001`, success. Built, mounted and verified `Multi-Converter_1.0.5_macos-universal.dmg` on Apple Silicon.\n- macOS DMG Verification (Intel): run `9991001`, success. Downloaded the same `Multi-Converter_1.0.5_macos-universal.dmg` artifact and verified it on Intel.",
  );
}

function readyReadme(readme) {
  return `${readyReadmeTableOnly(readme)}

## macOS Installation

Download \`Multi-Converter_macos-universal.dmg\` for Apple Silicon and Intel Macs. The same release also includes \`Multi-Converter_1.0.5_macos-universal.dmg\` for traceability. This macOS build is not Apple-signed and not notarized. After the first launch warning, open \`System Settings > Privacy & Security\`, choose \`Open Anyway\`, then confirm \`Open\`.

macOS automatic updates are enabled.
`;
}

function readyReadmeTableOnly(readme) {
  return readme.replace(/^## macOS Installation\s*[\s\S]*?(?=^##\s+)/m, "").replace(
    /\|\s*🍎 macOS[^|]*\|[^\n]+/,
    "| 🍎 macOS Apple Silicon + Intel | ✅ Available | `Multi-Converter_macos-universal.dmg` |",
  );
}
