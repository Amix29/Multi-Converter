import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const args = process.argv.slice(2);
const assertMode = args.includes("--assert");
const outPath = path.resolve(optionValue(args, "--out") ?? path.join(root, "tmp", "v1.0.5-status.json"));
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
const readme = readText("README.md");
const testingDocs = readText("docs/TESTING.md");
const macosChecklist = readText("docs/RELEASE_CHECKLIST_MACOS.md");
const validationEvidence = readOptionalText("docs/V1_0_5_VALIDATION.md");
const releaseValidator = readText("scripts/validate-release-assets.mjs");
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
const hasMacosAutomatedReleaseEvidence = Object.values(macosAutomationEvidence).every(Boolean);
const hasManualCleanMacEvidence = /Manual clean-Mac smoke testing: success/i.test(validationEvidence);
const hasMacosPublicReleaseEvidence = hasMacosAutomatedReleaseEvidence && hasManualCleanMacEvidence;
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
  check("release validator guards macOS conversion coverage claims", /claimsFullMacosConversionCoverage/.test(releaseValidator)),
  check("production config does not expose broad Tauri env variables", packageJson.scripts?.check?.includes("test:production-config") && /must not expose broad TAURI_/.test(productionConfigTest)),
  check("secret leak guard is part of the local quality gate", packageJson.scripts?.check?.includes("test:secret-leaks") && /Potential secret leak detected/.test(secretLeakTest)),
  check("v1.0.5 validation evidence records macOS CI runs", hasMacosAutomatedReleaseEvidence),
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
    hasManualCleanMacEvidence,
    missingMacosAdvancedEngines,
    missingMacosSidecars,
    macosAutomationEvidence,
  },
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify(status, null, 2)}\n`);

if (assertMode) {
  if (failedChecks.length > 0) {
    fail(`V1.0.5 status contradictions found:\n${failedChecks.map((item) => `- ${item.name}`).join("\n")}`);
  }
}

console.log(`V1.0.5 status written to ${path.relative(root, outPath)}`);
console.log(status.releaseReady ? "V1.0.5 release status: ready" : "V1.0.5 release status: not ready");
for (const blocker of evidenceBlockers) {
  console.log(`- ${blocker}`);
}

function check(name, passed) {
  return { name, passed: Boolean(passed) };
}

function macosEvidenceBlockers() {
  const blockers = [];
  if (!hasMacosAutomatedReleaseEvidence) {
    if (process.platform !== "darwin") {
      blockers.push("macOS universal DMG build and verification still require a real macOS host or successful macOS GitHub Actions evidence.");
    }
    if (!macosAutomationEvidence.engineStaging && missingMacosSidecars.length > 0) {
      blockers.push(`Missing real macOS FFmpeg/ffprobe sidecars or staging evidence: ${missingMacosSidecars.join(", ")}.`);
    }
    if (!macosAutomationEvidence.engineStaging && missingMacosAdvancedEngines.length > 0) {
      blockers.push(`Missing reviewed macos-universal advanced engines or staging evidence: ${missingMacosAdvancedEngines.join(", ")}.`);
    }
    if (!macosAutomationEvidence.conversionMatrix) {
      blockers.push("macOS Conversion Matrix success evidence is missing.");
    }
    if (!macosAutomationEvidence.dmgBuild) {
      blockers.push("macOS universal DMG build and verification success evidence is missing.");
    }
  }
  if (!macosAutomationEvidence.engineStaging && missingMacosAdvancedEngines.length === 0 && !macosAdvancedEngines.every((engine) => /^[a-f0-9]{64}$/i.test(String(engine.sha256 ?? "")))) {
    blockers.push("One or more macos-universal advanced engines has no pinned SHA-256 checksum.");
  }
  if (hasMacosAutomatedReleaseEvidence && !hasManualCleanMacEvidence) {
    blockers.push("Manual clean-Mac Gatekeeper/install smoke testing is still required before a public macOS release claim.");
  }
  return blockers;
}

function macosAutomationEvidenceFromDocs() {
  return {
    libvipsRuntime: /macOS libvips Runtime:\s*run `27459737669`, success/i.test(validationEvidence),
    engineStaging: /macOS Engine Staging:\s*run `27463128979`, success/i.test(validationEvidence),
    conversionMatrix: /macOS Conversion Matrix:\s*run `27464257789`, success/i.test(validationEvidence),
    dmgBuild: /macOS DMG Build:\s*run `27465964283`, success/i.test(validationEvidence) && validationEvidence.includes(`Multi-Converter_${packageJson.version}_macos-universal.dmg`),
  };
}

function readmeMacosStatusMatchesEvidence() {
  if (!hasMacosPublicReleaseEvidence) {
    return /\|\s*.*macOS\s*\|\s*.*In development for v1\.0\.5\s*\|/.test(readme);
  }
  return (
    /\|\s*.*macOS\s*\|\s*.*Available\s*\|/.test(readme) &&
    readme.includes(`Multi-Converter_${packageJson.version}_macos-universal.dmg`)
  );
}

function readText(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function readOptionalText(relativePath) {
  const fullPath = path.join(root, relativePath);
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

function fail(message) {
  console.error(message);
  process.exit(1);
}
