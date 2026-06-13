import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const version = "9.8.7";
const tag = `v${version}`;
const versionedInstaller = `Multi-Converter_${version}_x64-setup.exe`;
const stableInstaller = "Multi-Converter_windows-x64_setup.exe";
let updaterPublicKeyPath = "";
let updaterSignatureVerifierPath = "";
const windowsNotes = [
  `# Multi-Converter v${version}`,
  "",
  "A focused validation release for installer asset tests.",
  "",
  "## Highlights",
  "",
  "- Validates the Windows release asset contract for automated checks.",
  "",
  "## Download And Installation",
  "",
  `- Windows uses ${versionedInstaller}.`,
  "",
  "## Validation",
  "",
  "- Release asset validation, updater metadata validation and naming checks passed in this test fixture.",
].join("\n");
const notes = [
  `# Multi-Converter v${version}`,
  "",
  "A focused validation release for installer asset tests.",
  "",
  "## Highlights",
  "",
  "- Validates the release asset contract for automated checks.",
  "",
  "## Download And Installation",
  "",
  `- Windows uses ${versionedInstaller}.`,
  `- macOS uses Multi-Converter_${version}_macos-universal.dmg. This macOS build is not Apple-signed and not notarized. After the first launch warning, open System Settings > Privacy & Security, choose Open Anyway, then confirm Open. macOS automatic updates are not enabled for this first DMG workflow.`,
  "",
  "## Validation",
  "",
  "- Release asset validation, updater metadata validation, naming checks and macOS DMG verification passed on Apple Silicon and Intel in this test fixture.",
].join("\n");
const notesWithoutMacosWarning = [
  `# Multi-Converter v${version}`,
  "",
  "A focused validation release for installer asset tests.",
  "",
  "## Highlights",
  "",
  "- Validates the release asset contract for automated checks.",
  "",
  "## Download And Installation",
  "",
  `- Windows uses ${versionedInstaller}.`,
  `- macOS uses Multi-Converter_${version}_macos-universal.dmg.`,
  "",
  "## Validation",
  "",
  "- Release asset validation, updater metadata validation and naming checks passed in this test fixture.",
].join("\n");
const notesWithoutSystemSettings = notes.replace(
  "After the first launch warning, open System Settings > Privacy & Security, choose Open Anyway, then confirm Open.",
  "After the first launch warning, open Privacy & Security, choose Open Anyway.",
);
const notesWithFailedMacosDmgVerification = notes.replace(
  "macOS DMG verification passed",
  "macOS DMG verification failed",
);
const notesWithoutMacosDmgArchitectures = notes.replace(" on Apple Silicon and Intel", "");
const notesWithUnsupportedMacosConversionClaim = [
  `# Multi-Converter v${version}`,
  "",
  "A focused validation release for installer asset tests.",
  "",
  "## Highlights",
  "",
  "- All macOS conversions pass.",
  "",
  "## Download And Installation",
  "",
  `- Windows uses ${versionedInstaller}.`,
  `- macOS uses Multi-Converter_${version}_macos-universal.dmg. This macOS build is not Apple-signed and not notarized. After the first launch warning, open System Settings > Privacy & Security, choose Open Anyway, then confirm Open. macOS automatic updates are not enabled for this first DMG workflow.`,
  "",
  "## Validation",
  "",
  "- Release asset validation, updater metadata validation, naming checks and macOS DMG verification passed on Apple Silicon and Intel in this test fixture.",
].join("\n");
const notesWithUnsupportedMacosConversionArchitectureClaim = notesWithUnsupportedMacosConversionClaim.replace(
  "- Release asset validation, updater metadata validation, naming checks and macOS DMG verification passed on Apple Silicon and Intel in this test fixture.",
  "- Release asset validation, updater metadata validation, naming checks, macOS Conversion Matrix and macOS DMG verification passed in this test fixture.",
);
const notesWithMarkerBypassText = [
  "<!-- mc-release-notes:en -->",
  notes,
  "<!-- /mc-release-notes -->",
  "",
  "## Installation en francais",
  "",
  "- sudo spctl --master-disable",
].join("\n");

const windowsDir = fs.mkdtempSync(path.join(os.tmpdir(), "mc-assets-windows-"));
const allDir = fs.mkdtempSync(path.join(os.tmpdir(), "mc-assets-all-"));
const macosOnlyDir = fs.mkdtempSync(path.join(os.tmpdir(), "mc-assets-macos-"));
const windowsWithDmgDir = fs.mkdtempSync(path.join(os.tmpdir(), "mc-assets-windows-extra-dmg-"));
const windowsWithMacosNotesDir = fs.mkdtempSync(path.join(os.tmpdir(), "mc-assets-windows-macos-notes-"));
const allBadNotesDir = fs.mkdtempSync(path.join(os.tmpdir(), "mc-assets-all-bad-notes-"));
const allDarwinUpdaterDir = fs.mkdtempSync(path.join(os.tmpdir(), "mc-assets-all-darwin-updater-"));
const allMissingDmgDir = fs.mkdtempSync(path.join(os.tmpdir(), "mc-assets-all-missing-dmg-"));
const allMissingMacosValidationDir = fs.mkdtempSync(path.join(os.tmpdir(), "mc-assets-all-missing-macos-validation-"));
const allUnsupportedMacosConversionClaimDir = fs.mkdtempSync(path.join(os.tmpdir(), "mc-assets-all-unsupported-macos-conversion-claim-"));
const allUnsupportedMacosConversionArchitectureClaimDir = fs.mkdtempSync(path.join(os.tmpdir(), "mc-assets-all-unsupported-macos-conversion-architecture-claim-"));
const preparedBundleDir = fs.mkdtempSync(path.join(os.tmpdir(), "mc-assets-prepare-bundle-"));
const preparedOutputDir = fs.mkdtempSync(path.join(os.tmpdir(), "mc-assets-prepare-output-"));
const preparedDmgDir = fs.mkdtempSync(path.join(os.tmpdir(), "mc-assets-prepare-dmg-"));
const preparedBadNotesDir = fs.mkdtempSync(path.join(os.tmpdir(), "mc-assets-prepare-bad-notes-"));
const signingDir = fs.mkdtempSync(path.join(os.tmpdir(), "mc-assets-signing-"));

try {
  updaterSignatureVerifierPath = buildUpdaterSignatureVerifier(signingDir);
  updaterPublicKeyPath = generateUpdaterSigningKey(signingDir);
  writeWindowsAssets(windowsDir);
  runValidator(windowsDir, "windows");

  const windowsNotesPath = path.join(preparedDmgDir, "windows-notes.md");
  fs.writeFileSync(windowsNotesPath, windowsNotes);
  runReleaseNotesValidator(windowsNotesPath, false);

  const macosNotesPath = path.join(preparedDmgDir, "macos-notes.md");
  fs.writeFileSync(macosNotesPath, notes);
  runReleaseNotesValidator(macosNotesPath, true);
  runReleaseNotesValidatorFails(macosNotesPath, false, "include_macos=true");

  const macosNotesWithMarkerBypassTextPath = path.join(preparedDmgDir, "macos-notes-with-marker-bypass-text.md");
  fs.writeFileSync(macosNotesWithMarkerBypassTextPath, notesWithMarkerBypassText);
  runReleaseNotesValidatorFails(macosNotesWithMarkerBypassTextPath, true, "visible text outside");

  const macosNotesWithoutSystemSettingsPath = path.join(preparedDmgDir, "macos-notes-without-system-settings.md");
  fs.writeFileSync(macosNotesWithoutSystemSettingsPath, notesWithoutSystemSettings);
  runReleaseNotesValidatorFails(macosNotesWithoutSystemSettingsPath, true, "System Settings");

  const macosNotesWithFailedDmgVerificationPath = path.join(preparedDmgDir, "macos-notes-with-failed-dmg-verification.md");
  fs.writeFileSync(macosNotesWithFailedDmgVerificationPath, notesWithFailedMacosDmgVerification);
  runReleaseNotesValidatorFails(macosNotesWithFailedDmgVerificationPath, true, "verified on macOS");

  const macosNotesWithoutDmgArchitecturesPath = path.join(preparedDmgDir, "macos-notes-without-dmg-architectures.md");
  fs.writeFileSync(macosNotesWithoutDmgArchitecturesPath, notesWithoutMacosDmgArchitectures);
  runReleaseNotesValidatorFails(macosNotesWithoutDmgArchitecturesPath, true, "Apple Silicon and Intel");

  writeWindowsAssets(allDir, notes);
  fs.writeFileSync(path.join(allDir, `Multi-Converter_${version}_macos-universal.dmg`), "fake dmg\n");
  runValidator(allDir, "all");

  fs.writeFileSync(path.join(macosOnlyDir, `Multi-Converter_${version}_macos-universal.dmg`), "fake dmg\n");
  runValidator(macosOnlyDir, "macos");

  writeWindowsAssets(windowsWithDmgDir);
  fs.writeFileSync(path.join(windowsWithDmgDir, `Multi-Converter_${version}_macos-universal.dmg`), "fake dmg\n");
  runValidatorFails(windowsWithDmgDir, "windows", "Release asset set");

  writeWindowsAssets(windowsWithMacosNotesDir, notes);
  runValidatorFails(windowsWithMacosNotesDir, "windows", "include_macos=true");

  writeWindowsAssets(allBadNotesDir, notesWithoutMacosWarning);
  fs.writeFileSync(path.join(allBadNotesDir, `Multi-Converter_${version}_macos-universal.dmg`), "fake dmg\n");
  runValidatorFails(allBadNotesDir, "all", "not Apple-signed");

  writeWindowsAssets(allDarwinUpdaterDir, notes, { includeDarwinUpdater: true });
  fs.writeFileSync(path.join(allDarwinUpdaterDir, `Multi-Converter_${version}_macos-universal.dmg`), "fake dmg\n");
  runValidatorFails(allDarwinUpdaterDir, "all", "expected updater platforms");

  writeWindowsAssets(allMissingDmgDir);
  runValidatorFails(allMissingDmgDir, "all", "Release asset set");

  writeWindowsAssets(allMissingMacosValidationDir, notes.replace(" and macOS DMG verification", ""));
  fs.writeFileSync(path.join(allMissingMacosValidationDir, `Multi-Converter_${version}_macos-universal.dmg`), "fake dmg\n");
  runValidatorFails(allMissingMacosValidationDir, "all", "verified on macOS");

  writeWindowsAssets(allUnsupportedMacosConversionClaimDir, notesWithUnsupportedMacosConversionClaim);
  fs.writeFileSync(path.join(allUnsupportedMacosConversionClaimDir, `Multi-Converter_${version}_macos-universal.dmg`), "fake dmg\n");
  runValidatorFails(allUnsupportedMacosConversionClaimDir, "all", "macOS Conversion Matrix");

  writeWindowsAssets(allUnsupportedMacosConversionArchitectureClaimDir, notesWithUnsupportedMacosConversionArchitectureClaim);
  fs.writeFileSync(path.join(allUnsupportedMacosConversionArchitectureClaimDir, `Multi-Converter_${version}_macos-universal.dmg`), "fake dmg\n");
  runValidatorFails(allUnsupportedMacosConversionArchitectureClaimDir, "all", "Apple Silicon and Intel");

  writeBundleFixture(preparedBundleDir);
  fs.writeFileSync(path.join(preparedDmgDir, "source.dmg"), "fake dmg\n");
  fs.writeFileSync(path.join(preparedOutputDir, "stale.log"), "stale output\n");
  runPrepare(
    preparedBundleDir,
    preparedOutputDir,
    notes,
    path.join(preparedDmgDir, "source.dmg"),
  );
  assert.ok(!fs.existsSync(path.join(preparedOutputDir, "stale.log")), "prepare-release-assets must clean stale files from the output directory");
  runValidator(preparedOutputDir, "all");

  runPrepareFails(
    preparedBundleDir,
    preparedBadNotesDir,
    notesWithoutMacosWarning,
    path.join(preparedDmgDir, "source.dmg"),
    "not Apple-signed",
  );
} finally {
  for (const dir of [
    windowsDir,
    allDir,
    macosOnlyDir,
    windowsWithDmgDir,
    windowsWithMacosNotesDir,
    allBadNotesDir,
    allDarwinUpdaterDir,
    allMissingDmgDir,
    allMissingMacosValidationDir,
    allUnsupportedMacosConversionClaimDir,
    preparedBundleDir,
    preparedOutputDir,
    preparedDmgDir,
    preparedBadNotesDir,
    signingDir,
  ]) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

console.log("Release asset tests passed.");

function writeWindowsAssets(dir, releaseNotes = windowsNotes, options = {}) {
  const installerBytes = Buffer.from("fake installer\n", "utf8");
  const installerPath = path.join(dir, versionedInstaller);
  const signaturePath = path.join(dir, `${versionedInstaller}.sig`);
  fs.writeFileSync(installerPath, installerBytes);
  fs.writeFileSync(path.join(dir, stableInstaller), installerBytes);
  signUpdaterFixture(installerPath, signaturePath);
  const signature = fs.readFileSync(signaturePath, "utf8").trim();
  const platforms = {
    "windows-x86_64": {
      signature,
      url: `https://github.com/Amix29/Multi-Converter/releases/download/${tag}/${versionedInstaller}`,
    },
    "windows-x86_64-nsis": {
      signature,
      url: `https://github.com/Amix29/Multi-Converter/releases/download/${tag}/${versionedInstaller}`,
    },
  };
  if (options.includeDarwinUpdater) {
    platforms["darwin-universal"] = {
      signature,
      url: `https://github.com/Amix29/Multi-Converter/releases/download/${tag}/Multi-Converter_${version}_macos-universal.dmg`,
    };
  }
  fs.writeFileSync(path.join(dir, `${versionedInstaller}.sha256`), `${sha256(installerBytes)}  ${versionedInstaller}`);
  fs.writeFileSync(
    path.join(dir, "latest.json"),
    `${JSON.stringify(
      {
        version,
        notes: releaseNotes,
        pub_date: "2026-06-11T00:00:00.000Z",
        platforms,
      },
      null,
      2,
    )}\n`,
  );
}

function runValidator(dir, platform) {
  const result = spawnSync(process.execPath, [
    "scripts/validate-release-assets.mjs",
    "--version",
    version,
    "--dir",
    dir,
    "--platform",
    platform,
    "--updater-public-key",
    updaterPublicKeyPath,
    "--updater-signature-verifier",
    updaterSignatureVerifierPath,
    ...(platform === "all" || platform === "macos" ? ["--macos-dmg-sha256", sha256(fs.readFileSync(path.join(dir, `Multi-Converter_${version}_macos-universal.dmg`)))] : []),
  ], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

function runValidatorFails(dir, platform, expectedMessage) {
  const args = [
    "scripts/validate-release-assets.mjs",
    "--version",
    version,
    "--dir",
    dir,
    "--platform",
    platform,
    "--updater-public-key",
    updaterPublicKeyPath,
    "--updater-signature-verifier",
    updaterSignatureVerifierPath,
  ];
  const dmgPath = path.join(dir, `Multi-Converter_${version}_macos-universal.dmg`);
  if (fs.existsSync(dmgPath)) {
    args.push("--macos-dmg-sha256", sha256(fs.readFileSync(dmgPath)));
  }
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  assert.notEqual(result.status, 0, "validator unexpectedly passed");
  const output = `${result.stderr}\n${result.stdout}`;
  assert.match(output, new RegExp(expectedMessage.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), output);
}

function runReleaseNotesValidator(notesPath, includeMacos) {
  const result = spawnSync(
    process.execPath,
    [
      "scripts/validate-release-notes.mjs",
      "--version",
      version,
      "--notes-file",
      notesPath,
      "--include-macos",
      String(includeMacos),
      "--min-length",
      "200",
    ],
    {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

function runReleaseNotesValidatorFails(notesPath, includeMacos, expectedMessage) {
  const result = spawnSync(
    process.execPath,
    [
      "scripts/validate-release-notes.mjs",
      "--version",
      version,
      "--notes-file",
      notesPath,
      "--include-macos",
      String(includeMacos),
      "--min-length",
      "200",
    ],
    {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    },
  );
  assert.notEqual(result.status, 0, "release notes validator unexpectedly passed");
  const output = `${result.stderr}\n${result.stdout}`;
  assert.match(output, new RegExp(expectedMessage.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), output);
}

function writeBundleFixture(dir) {
  const installerBytes = Buffer.from("fake installer\n", "utf8");
  const installerPath = path.join(dir, versionedInstaller);
  fs.writeFileSync(installerPath, installerBytes);
  signUpdaterFixture(installerPath, path.join(dir, `${versionedInstaller}.sig`));
}

function runPrepare(bundleDir, outDir, releaseNotes, macosDmg) {
  const result = runPrepareProcess(bundleDir, outDir, releaseNotes, macosDmg);
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

function runPrepareFails(bundleDir, outDir, releaseNotes, macosDmg, expectedMessage) {
  const result = runPrepareProcess(bundleDir, outDir, releaseNotes, macosDmg);
  assert.notEqual(result.status, 0, "prepare-release-assets unexpectedly passed");
  const output = `${result.stderr}\n${result.stdout}`;
  assert.match(output, new RegExp(expectedMessage.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), output);
}

function runPrepareProcess(bundleDir, outDir, releaseNotes, macosDmg) {
  const args = [
    "scripts/prepare-release-assets.mjs",
    "--version",
    version,
    "--bundle-dir",
    bundleDir,
    "--dir",
    outDir,
    "--notes-env",
    "MC_TEST_RELEASE_NOTES",
  ];
  if (macosDmg) {
    args.push("--macos-dmg", macosDmg);
  }
  return spawnSync(process.execPath, args, {
    cwd: root,
    env: { ...process.env, MC_TEST_RELEASE_NOTES: releaseNotes },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function generateUpdaterSigningKey(dir) {
  const keyPath = path.join(dir, "updater-test-key");
  const result = spawnSync(process.execPath, [tauriCliPath(), "signer", "generate", "--ci", "-w", keyPath, "-p", ""], {
    cwd: root,
    env: signerEnv(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const encodedPublicKey = fs.readFileSync(`${keyPath}.pub`, "utf8").trim();
  const publicKey = Buffer.from(encodedPublicKey, "base64").toString("utf8");
  const decodedPublicKeyPath = path.join(dir, "updater-test-key.decoded.pub");
  fs.writeFileSync(decodedPublicKeyPath, publicKey, "utf8");
  return decodedPublicKeyPath;
}

function buildUpdaterSignatureVerifier(dir) {
  const manifestPath = path.join("tools", "updater-signature-verifier", "Cargo.toml");
  const result = spawnSync("cargo", ["build", "--manifest-path", manifestPath], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const binary = path.join(root, "tools", "updater-signature-verifier", "target", "debug", process.platform === "win32" ? "mc-release-sigcheck.exe" : "mc-release-sigcheck");
  assert.ok(fs.existsSync(binary), `Missing updater signature verifier: ${binary}`);
  return binary;
}

function signUpdaterFixture(filePath, signaturePath) {
  fs.rmSync(signaturePath, { force: true });
  const result = spawnSync(process.execPath, [tauriCliPath(), "signer", "sign", "-f", path.join(signingDir, "updater-test-key"), "-p", "", filePath], {
    cwd: root,
    env: signerEnv(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.ok(fs.existsSync(signaturePath), `Missing generated signature: ${signaturePath}`);
}

function signerEnv() {
  const env = { ...process.env };
  delete env.TAURI_SIGNING_PRIVATE_KEY;
  delete env.TAURI_SIGNING_PRIVATE_KEY_PATH;
  delete env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD;
  return env;
}

function tauriCliPath() {
  return path.join(root, "node_modules", "@tauri-apps", "cli", "tauri.js");
}
