import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const args = process.argv.slice(2);
const assertMode = args.includes("--assert");
const requireReady = args.includes("--require-ready");
const outPath = path.resolve(optionValue(args, "--out") ?? path.join(root, "tmp", "v1.0.5-status.json"));
const validationEvidencePath = optionValue(args, "--validation-evidence") ?? "docs/V1_0_5_VALIDATION.md";
const readmePath = optionValue(args, "--readme") ?? "README.md";
const requiredAdvancedEngines = ["pdfium", "libreoffice", "pandoc", "libvips"];
const requiredMacosSidecars = [
  "ffmpeg-aarch64-apple-darwin",
  "ffmpeg-x86_64-apple-darwin",
  "ffmpeg-universal-apple-darwin",
  "ffprobe-aarch64-apple-darwin",
  "ffprobe-x86_64-apple-darwin",
  "ffprobe-universal-apple-darwin",
];

const packageJson = readJson("package.json");
const macosConfig = readJson("src-tauri/tauri.macos.conf.json");
const enginesManifest = readJson("src-tauri/engines-manifest.json");
const readme = readText(readmePath);
const testingDocs = readText("docs/TESTING.md");
const macosChecklist = readText("docs/RELEASE_CHECKLIST_MACOS.md");
const validationEvidence = readOptionalText(validationEvidencePath);
const cleanMacSmokeReceipt = markdownSection(validationEvidence, "Manual Clean-Mac Smoke Test Receipt");
const securityEvidenceSection = markdownSection(validationEvidence, "Security And Confidentiality Evidence");
const releaseNotesValidator = readText("scripts/lib/release-notes-validation.mjs");
const windowsGate = readText("scripts/test-windows-ci-gate.mjs");
const uiLayoutTest = readText("scripts/test-ui-layout.mjs");
const macosConversionTest = readText("scripts/test-macos-conversions.mjs");
const secretLeakTest = readText("scripts/test-secret-leaks.mjs");
const productionConfigTest = readText("scripts/test-production-config.mjs");

const macosAdvancedEngines = (enginesManifest.engines ?? []).filter((engine) => engine.platform === "macos-universal" && engine.mode === "advanced");
const macosAdvancedEngineIds = new Set(macosAdvancedEngines.map((engine) => engine.id));
const missingMacosAdvancedEngines = requiredAdvancedEngines.filter((id) => !macosAdvancedEngineIds.has(id));
const missingMacosSidecars = requiredMacosSidecars.filter((name) => !fs.existsSync(path.join(root, "src-tauri", "binaries", name)));
const macosAutomationEvidence = macosAutomationEvidenceFromDocs();
const hasMacosTwoArchitectureConversionEvidence =
  macosAutomationEvidence.conversionMatrixAppleSilicon &&
  macosAutomationEvidence.conversionMatrixIntel;
const hasMacosAutomatedBaselineEvidence =
  macosAutomationEvidence.libvipsRuntime &&
  macosAutomationEvidence.engineStaging &&
  (macosAutomationEvidence.conversionMatrixSingleRunner || hasMacosTwoArchitectureConversionEvidence) &&
  macosAutomationEvidence.dmgBuildAppleSilicon;
const hasMacosTwoArchitectureDmgEvidence =
  macosAutomationEvidence.dmgBuildAppleSilicon &&
  macosAutomationEvidence.dmgVerifyIntel;
const hasMacosAutomatedReleaseEvidence =
  macosAutomationEvidence.libvipsRuntime &&
  macosAutomationEvidence.engineStaging &&
  hasMacosTwoArchitectureConversionEvidence &&
  hasMacosTwoArchitectureDmgEvidence;
const cleanMacSmokeEvidence = cleanMacSmokeEvidenceFromDocs();
const hasManualCleanMacEvidence = cleanMacSmokeEvidence.complete;
const hasMacosPublicReleaseEvidence = hasMacosAutomatedReleaseEvidence && hasManualCleanMacEvidence;
const hasSecurityCheckEvidence = securityCheckEvidenceFromDocs();
const codexSecurityEvidence = codexSecurityEvidenceFromDocs();
const hasCodexSecurityScanEvidence = codexSecurityEvidence.complete;
const evidenceBlockers = macosEvidenceBlockers();

const checks = [
  check("version is 1.0.5", packageJson.version === "1.0.5"),
  check("macOS build command targets universal-apple-darwin", /universal-apple-darwin/.test(packageJson.scripts?.["tauri:build:macos"] ?? "")),
  check("macOS bundle shape is app + dmg", JSON.stringify(macosConfig.bundle?.targets) === JSON.stringify(["app", "dmg"])),
  check("macOS updater artifacts are disabled for initial DMG", macosConfig.bundle?.createUpdaterArtifacts === false),
  check("macOS unsigned builds use ad-hoc signing", macosConfig.bundle?.macOS?.signingIdentity === "-"),
  check("README macOS status matches available release evidence", readmeMacosStatusMatchesEvidence()),
  check("README keeps Linux in development", /\|\s*.*Linux\s*\|\s*.*In development\s*\|/.test(readme)),
  check("UI floating stack overlap contract exists", /floating-corner/.test(uiLayoutTest) && /feedback-launcher/.test(uiLayoutTest) && /update-reminder/.test(uiLayoutTest)),
  check("Windows CI gate is grouped and checkpointed", /windows-ci-gate-status\.json/.test(windowsGate) && /beginStep\(command\)/.test(windowsGate)),
  check("macOS conversion gate rejects placeholders", /is a CI placeholder, not a real conversion sidecar/.test(macosConversionTest)),
  check("release validator guards macOS conversion coverage claims", /claimsFullMacosConversionCoverage/.test(releaseNotesValidator)),
  check("production config does not expose broad Tauri env variables", packageJson.scripts?.check?.includes("test:production-config") && /must not expose broad TAURI_/.test(productionConfigTest)),
  check("secret leak guard is part of the local quality gate", packageJson.scripts?.check?.includes("test:secret-leaks") && /Potential secret leak detected/.test(secretLeakTest)),
  check("v1.0.5 validation evidence records macOS CI runs", hasMacosAutomatedBaselineEvidence),
  check("v1.0.5 validation evidence records security checks", hasSecurityCheckEvidence),
  check("v1.0.5 validation evidence includes a structured clean-Mac smoke receipt", cleanMacSmokeReceipt.length > 0 && /Mounted final downloaded DMG/.test(cleanMacSmokeReceipt) && /Opened through System Settings > Privacy & Security > Open Anyway/.test(cleanMacSmokeReceipt)),
  check("testing docs warn static checks do not prove macOS conversions", /They do not prove that macOS conversions work\./.test(testingDocs)),
  check("macOS checklist defines the Mac-only handoff boundary", /## Mac Handoff Readiness/.test(macosChecklist) && /macOS-only work/.test(macosChecklist)),
  check("macOS checklist requires real conversion matrix before full coverage claims", /macOS Conversion Matrix/.test(macosChecklist) && /all macOS conversions pass/.test(macosChecklist)),
];

const failedChecks = checks.filter((item) => !item.passed);
const status = {
  generatedAt: new Date().toISOString(),
  version: packageJson.version,
  releaseReady: evidenceBlockers.length === 0 && failedChecks.length === 0,
  checks,
  blockers: evidenceBlockers,
  summary: {
    passedChecks: checks.length - failedChecks.length,
    totalChecks: checks.length,
    blockerCount: evidenceBlockers.length,
    hasMacosAutomatedReleaseEvidence,
    hasMacosAutomatedBaselineEvidence,
    hasMacosTwoArchitectureConversionEvidence,
    hasMacosTwoArchitectureDmgEvidence,
    hasManualCleanMacEvidence,
    hasSecurityCheckEvidence,
    hasCodexSecurityScanEvidence,
    missingMacosAdvancedEngines,
    missingMacosSidecars,
    macosAutomationEvidence,
    cleanMacSmokeEvidence,
    codexSecurityEvidence,
  },
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify(status, null, 2)}\n`);

if (assertMode) {
  if (failedChecks.length > 0) {
    fail(`V1.0.5 status contradictions found:\n${failedChecks.map((item) => `- ${item.name}`).join("\n")}`);
  }
}

if (requireReady && !status.releaseReady) {
  fail(`V1.0.5 is not release-ready:\n${[...failedChecks.map((item) => item.name), ...evidenceBlockers].map((item) => `- ${item}`).join("\n")}`);
}

console.log(`V1.0.5 status written to ${path.relative(root, outPath)}`);
console.log(status.releaseReady ? "V1.0.5 release status: ready" : "V1.0.5 release status: not ready");
for (const failedCheck of failedChecks) {
  console.log(`- Check failed: ${failedCheck.name}`);
}
for (const blocker of evidenceBlockers) {
  console.log(`- ${blocker}`);
}

function check(name, passed) {
  return { name, passed: Boolean(passed) };
}

function macosEvidenceBlockers() {
  const blockers = [];
  if (!hasMacosAutomatedReleaseEvidence) {
    if (!macosAutomationEvidence.dmgBuildAppleSilicon && process.platform !== "darwin") {
      blockers.push("macOS universal DMG build and verification still require a real macOS host or successful macOS GitHub Actions evidence.");
    }
    if (!macosAutomationEvidence.engineStaging && missingMacosSidecars.length > 0) {
      blockers.push(`Missing real macOS FFmpeg/ffprobe sidecars or staging evidence: ${missingMacosSidecars.join(", ")}.`);
    }
    if (!macosAutomationEvidence.engineStaging && missingMacosAdvancedEngines.length > 0) {
      blockers.push(`Missing reviewed macos-universal advanced engines or staging evidence: ${missingMacosAdvancedEngines.join(", ")}.`);
    }
    if (!hasMacosTwoArchitectureConversionEvidence) {
      const missingArchitectures = [];
      if (!macosAutomationEvidence.conversionMatrixAppleSilicon) missingArchitectures.push("Apple Silicon");
      if (!macosAutomationEvidence.conversionMatrixIntel) missingArchitectures.push("Intel");
      blockers.push(`macOS Conversion Matrix success evidence is missing for ${missingArchitectures.join(" and ")}.`);
    }
    if (!hasMacosTwoArchitectureDmgEvidence) {
      const missingArchitectures = [];
      if (!macosAutomationEvidence.dmgBuildAppleSilicon) missingArchitectures.push("Apple Silicon");
      if (!macosAutomationEvidence.dmgVerifyIntel) missingArchitectures.push("Intel");
      blockers.push(`macOS universal DMG verification success evidence is missing for ${missingArchitectures.join(" and ")}.`);
    }
  }
  if (!macosAutomationEvidence.engineStaging && missingMacosAdvancedEngines.length === 0 && !macosAdvancedEngines.every((engine) => /^[a-f0-9]{64}$/i.test(String(engine.sha256 ?? "")))) {
    blockers.push("One or more macos-universal advanced engines has no pinned SHA-256 checksum.");
  }
  if (hasMacosAutomatedBaselineEvidence && !hasManualCleanMacEvidence) {
    if (/Manual clean-Mac smoke testing:\s*success/i.test(cleanMacSmokeReceipt) && cleanMacSmokeEvidence.missing.length > 0) {
      blockers.push(`Manual clean-Mac smoke receipt is incomplete: ${cleanMacSmokeEvidence.missing.join(", ")}.`);
    } else {
      blockers.push("Manual clean-Mac Gatekeeper/install smoke testing is still required before a public macOS release claim.");
    }
  }
  if (hasSecurityCheckEvidence && !hasCodexSecurityScanEvidence) {
    if (/Exhaustive Codex Security subagent scan:\s*(?:success|accepted|passed)/i.test(securityEvidenceSection) && codexSecurityEvidence.missing.length > 0) {
      blockers.push(`Codex Security evidence is incomplete: ${codexSecurityEvidence.missing.join(", ")}.`);
    } else {
      blockers.push("Exhaustive Codex Security subagent scan is still pending explicit maintainer approval or accepted replacement evidence.");
    }
  }
  return blockers;
}

function macosAutomationEvidenceFromDocs() {
  return {
    libvipsRuntime: /macOS libvips Runtime:\s*run `\d+`, success/i.test(validationEvidence),
    engineStaging: /macOS Engine Staging:\s*run `\d+`, success/i.test(validationEvidence),
    conversionMatrixSingleRunner: /macOS Conversion Matrix \(single macOS runner\):\s*run `\d+`, success/i.test(validationEvidence),
    conversionMatrixAppleSilicon: /macOS Conversion Matrix \(Apple Silicon\):\s*run `\d+`, success/i.test(validationEvidence),
    conversionMatrixIntel: /macOS Conversion Matrix \(Intel\):\s*run `\d+`, success/i.test(validationEvidence),
    dmgBuildAppleSilicon: /macOS DMG Build \(Apple Silicon\):\s*run `\d+`, success/i.test(validationEvidence) && validationEvidence.includes(`Multi-Converter_${packageJson.version}_macos-universal.dmg`),
    dmgVerifyIntel: /macOS DMG Verification \(Intel\):\s*run `\d+`, success/i.test(validationEvidence) && validationEvidence.includes(`Multi-Converter_${packageJson.version}_macos-universal.dmg`),
  };
}

function securityCheckEvidenceFromDocs() {
  return (
    /`npm run test:secret-leaks`: passed on June 13, 2026\./.test(validationEvidence) &&
    /`npm run test:production-config`: passed on June 13, 2026\./.test(validationEvidence) &&
    /`npm audit --audit-level=moderate`: passed on June 13, 2026 with 0 reported npm vulnerabilities\./.test(validationEvidence) &&
    /Extra tracked-file confidentiality search: passed on June 13, 2026\./.test(validationEvidence)
  );
}

function codexSecurityEvidenceFromDocs() {
  const required = [
    ["Exhaustive Codex Security subagent scan: success, passed or accepted", /Exhaustive Codex Security subagent scan:\s*(?:success|accepted|passed)/i],
    ["Security date recorded", /^-\s*Security date:[ \t]+(?!pending\s*$).+\S\s*$/im],
    ["Security reviewer recorded", /^-\s*Security reviewer:[ \t]+(?!pending\s*$).+\S\s*$/im],
    ["Security scope recorded", /^-\s*Security scope:[ \t]+(?!pending\s*$).+\S\s*$/im],
    ["Confidential information exposure recorded", /^-\s*Confidential information exposure:[ \t]+(?!pending\s*$).+\S\s*$/im],
    ["Security outcome recorded", /^-\s*Security outcome:[ \t]+(?!pending\s*$).+\S\s*$/im],
  ];
  const missing = required.filter(([, pattern]) => !pattern.test(securityEvidenceSection)).map(([name]) => name);
  return {
    complete: missing.length === 0,
    missing,
  };
}

function cleanMacSmokeEvidenceFromDocs() {
  const expectedDmg = `Multi-Converter_${packageJson.version}_macos-universal.dmg`;
  const required = [
    ["Manual clean-Mac smoke testing: success", /Manual clean-Mac smoke testing:\s*success/i],
    ["Date recorded", /^-\s*Date:[ \t]+(?!pending\s*$).+\S\s*$/im],
    ["Tester recorded", /^-\s*Tester:[ \t]+(?!pending\s*$).+\S\s*$/im],
    ["macOS version recorded", /^-\s*macOS version:[ \t]+(?!pending\s*$).+\S\s*$/im],
    ["Mac model recorded", /^-\s*Mac model:[ \t]+(?!pending\s*$).+\S\s*$/im],
    ["Architecture tested records Apple Silicon or Intel", /^-\s*Architecture tested:[ \t]+(?=.*(?:Apple Silicon|Intel)).+\S\s*$/im],
    [`DMG: ${expectedDmg}`, new RegExp(`DMG:\\s*${escapeRegExp(expectedDmg)}\\b`, "i")],
    ["Final downloaded GitHub release DMG source recorded", /^-\s*DMG source:[ \t]+(?=.*(?:final downloaded|GitHub release asset|GitHub release download)).+\S\s*$/im],
    ["Mounted final downloaded DMG: yes", /Mounted final downloaded DMG:\s*yes/i],
    ["Dragged app to Applications: yes", /Dragged app to Applications:\s*yes/i],
    ["Unsigned/not-notarized first launch warning verified: yes", /Unsigned\/not-notarized first launch warning verified:\s*yes/i],
    ["Opened through System Settings > Privacy & Security > Open Anyway: yes", /Opened through System Settings > Privacy & Security > Open Anyway:\s*yes/i],
    ["Confirmed Open prompt: yes", /Confirmed Open prompt:\s*yes/i],
    ["Second launch verified: yes", /Second launch verified:\s*yes/i],
    ["File selection verified: yes", /File selection verified:\s*yes/i],
    ["FFmpeg media conversion verified: yes", /FFmpeg media conversion verified:\s*yes/i],
    ["Document/PDF/image advanced conversion verified: yes", /Document\/PDF\/image advanced conversion verified:\s*yes/i],
    ["Updater metadata behavior checked: yes", /Updater metadata behavior checked:\s*yes/i],
  ];
  const missing = required.filter(([, pattern]) => !pattern.test(cleanMacSmokeReceipt)).map(([name]) => name);
  return {
    complete: missing.length === 0,
    expectedDmg,
    missing,
  };
}

function readmeMacosStatusMatchesEvidence() {
  if (!hasMacosPublicReleaseEvidence) {
    return /\|\s*.*macOS\s*\|\s*.*In development for v1\.0\.5\s*\|/.test(readme);
  }
  const macosInstallSection = markdownSection(readme, "macOS Installation");
  return (
    /\|\s*.*macOS\s*\|\s*.*Available\s*\|/.test(readme) &&
    macosInstallSection.includes(`Multi-Converter_${packageJson.version}_macos-universal.dmg`) &&
    /Apple\s+Silicon/i.test(macosInstallSection) &&
    /Intel/i.test(macosInstallSection) &&
    /not\s+Apple-signed/i.test(macosInstallSection) &&
    /not\s+notarized/i.test(macosInstallSection) &&
    macosInstallSection.includes("System Settings") &&
    macosInstallSection.includes("Open Anyway") &&
    macosInstallSection.includes("Privacy & Security") &&
    /confirm\s+`?Open`?/i.test(macosInstallSection) &&
    /macOS\s+automatic\s+updates\s+are\s+not\s+enabled/i.test(macosInstallSection)
  );
}

function readText(relativePath) {
  return fs.readFileSync(projectPath(relativePath), "utf8");
}

function readOptionalText(relativePath) {
  const fullPath = projectPath(relativePath);
  return fs.existsSync(fullPath) ? fs.readFileSync(fullPath, "utf8") : "";
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

function optionValue(values, name) {
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === name) return values[index + 1];
    if (value.startsWith(`${name}=`)) return value.slice(name.length + 1);
  }
  return null;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function markdownSection(markdown, heading) {
  const headingPattern = new RegExp(`^##\\s+${escapeRegExp(heading)}\\s*$`, "im");
  const match = headingPattern.exec(markdown);
  if (!match) return "";
  const sectionStart = match.index + match[0].length;
  const remaining = markdown.slice(sectionStart);
  const nextSectionIndex = remaining.search(/^##\s+/m);
  return (nextSectionIndex === -1 ? remaining : remaining.slice(0, nextSectionIndex)).trim();
}

function projectPath(value) {
  return path.isAbsolute(value) ? value : path.join(root, value);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
