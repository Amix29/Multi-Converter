import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const args = process.argv.slice(2);
const assertMode = args.includes("--assert");
const requireReady = args.includes("--require-ready");
const releaseVersion = "1.0.6";
const outPath = path.resolve(optionValue(args, "--out") ?? path.join(root, "tmp", "v1.0.6-status.json"));
const validationEvidencePath = optionValue(args, "--validation-evidence") ?? "docs/V1_0_6_VALIDATION.md";

const packageJson = readJson("package.json");
const tauriConfig = readJson("src-tauri/tauri.conf.json");
const cargoToml = readText("src-tauri/Cargo.toml");
const cargoLock = readText("src-tauri/Cargo.lock");
const validationEvidence = readOptionalText(validationEvidencePath);

const requiredSections = [
  "Local Windows Validation",
  "macOS Release Evidence",
  "Linux Release Evidence",
  "Security And Confidentiality Evidence",
  "Release Asset Evidence",
];

const checks = [
  check("package.json version is 1.0.6", packageJson.version === releaseVersion),
  check("Tauri config version is 1.0.6", tauriConfig.version === releaseVersion),
  check("Cargo.toml version is 1.0.6", new RegExp(`^version = "${escapeRegExp(releaseVersion)}"$`, "m").test(cargoToml)),
  check("Cargo.lock package version is 1.0.6", /name = "multi-converter"\s+version = "1\.0\.6"/.test(cargoLock)),
  check("V1.0.6 validation evidence file exists", validationEvidence.length > 0),
  ...requiredSections.map((section) =>
    check(`V1.0.6 validation evidence includes ${section}`, markdownSection(validationEvidence, section).length > 0),
  ),
];

const blockers = [
  ...evidenceBlockers("macOS Release Evidence", [
    [/macOS Conversion Matrix \(Apple Silicon\):\s*success/i, "macOS Conversion Matrix success evidence is missing for Apple Silicon."],
    [/macOS Conversion Matrix \(Intel\):\s*success/i, "macOS Conversion Matrix success evidence is missing for Intel."],
    [/macOS DMG verification \(Apple Silicon\):\s*success/i, "macOS DMG verification success evidence is missing for Apple Silicon."],
    [/macOS DMG verification \(Intel\):\s*success/i, "macOS DMG verification success evidence is missing for Intel."],
    [/Manual clean-Mac smoke testing:\s*success/i, "Manual clean-Mac smoke testing is still required for the final downloaded DMG."],
  ]),
  ...evidenceBlockers("Linux Release Evidence", [
    [/Linux AppImage Build:\s*success/i, "Linux AppImage Build success evidence is missing."],
    [/Linux Conversion Matrix:\s*success/i, "Linux Conversion Matrix success evidence is missing."],
    [/Linux AppImage Verification:\s*success/i, "Linux AppImage verification success evidence is missing."],
    [/Manual Linux AppImage smoke testing:\s*success/i, "Manual Linux AppImage smoke testing is still required for the final downloaded AppImage."],
  ]),
  ...evidenceBlockers("Security And Confidentiality Evidence", [
    [/`?npm run test:secret-leaks`?:\s*passed/i, "Secret leak scan evidence is missing."],
    [/`?npm run test:production-config`?:\s*passed/i, "Production config check evidence is missing."],
    [/Final Codex Security pass:\s*(?:passed|accepted|success)/i, "Final Codex Security pass evidence is missing."],
    [/Confidential information exposure:\s*none found/i, "Confidential information exposure result is missing."],
  ]),
  ...evidenceBlockers("Release Asset Evidence", [
    [/Windows release assets:\s*(?:prepared|pending|not prepared)/i, "Windows release asset status is missing."],
    [/macOS release assets:\s*(?:prepared|pending|not prepared)/i, "macOS release asset status is missing."],
    [/Linux release assets:\s*(?:prepared|pending|not prepared)/i, "Linux release asset status is missing."],
  ]),
];

const failedChecks = checks.filter((item) => !item.passed);
const status = {
  generatedAt: new Date().toISOString(),
  version: packageJson.version,
  releaseReady: failedChecks.length === 0 && blockers.length === 0,
  checks,
  blockers,
  summary: {
    passedChecks: checks.length - failedChecks.length,
    totalChecks: checks.length,
    blockerCount: blockers.length,
  },
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify(status, null, 2)}\n`);

if (assertMode && failedChecks.length > 0) {
  fail(`V1.0.6 status contradictions found:\n${failedChecks.map((item) => `- ${item.name}`).join("\n")}`);
}

if (requireReady && !status.releaseReady) {
  fail(`V1.0.6 is not release-ready:\n${[...failedChecks.map((item) => item.name), ...blockers].map((item) => `- ${item}`).join("\n")}`);
}

console.log(`V1.0.6 status written to ${path.relative(root, outPath)}`);
console.log(status.releaseReady ? "V1.0.6 release status: ready" : "V1.0.6 release status: not ready");
for (const failedCheck of failedChecks) {
  console.log(`- Check failed: ${failedCheck.name}`);
}
for (const blocker of blockers) {
  console.log(`- ${blocker}`);
}

function evidenceBlockers(sectionName, requirements) {
  const section = markdownSection(validationEvidence, sectionName);
  if (!section) {
    return [`V1.0.6 validation evidence is missing the ${sectionName} section.`];
  }
  return requirements
    .filter(([pattern]) => !pattern.test(section))
    .map(([, message]) => message);
}

function check(name, passed) {
  return { name, passed: Boolean(passed) };
}

function readText(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function readOptionalText(relativePath) {
  const fullPath = path.isAbsolute(relativePath) ? relativePath : path.join(root, relativePath);
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

function markdownSection(markdown, heading) {
  const headingPattern = new RegExp(`^##\\s+${escapeRegExp(heading)}\\s*$`, "im");
  const match = headingPattern.exec(markdown);
  if (!match) return "";
  const sectionStart = match.index + match[0].length;
  const remaining = markdown.slice(sectionStart);
  const nextSectionIndex = remaining.search(/^##\s+/m);
  return (nextSectionIndex === -1 ? remaining : remaining.slice(0, nextSectionIndex)).trim();
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
