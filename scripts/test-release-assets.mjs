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
const macosDmg = `Multi-Converter_${version}_macos-universal.dmg`;
const stableMacosDmg = "Multi-Converter_macos-universal.dmg";
const macosUpdaterArchive = `Multi-Converter_${version}_macos-universal.app.tar.gz`;
const macosUpdaterSignature = `${macosUpdaterArchive}.sig`;
const linuxAppImage = `Multi-Converter_${version}_linux-x64.AppImage`;
const stableLinuxAppImage = "Multi-Converter_linux-x64.AppImage";
const linuxAppImageSignature = `${linuxAppImage}.sig`;
const agentsGuide = fs.readFileSync(path.join(root, "AGENTS.md"), "utf8");
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
  `- macOS uses Multi-Converter_${version}_macos-universal.dmg. This macOS build is not Apple-signed and not notarized. After the first launch warning, open System Settings > Privacy & Security, choose Open Anyway, then confirm Open. macOS automatic updates are enabled.`,
  "",
  "## Validation",
  "",
  "- Release asset validation, updater metadata validation, naming checks and macOS DMG verification passed on Apple Silicon and Intel in this test fixture.",
].join("\n");
const linuxNotes = [
  `# Multi-Converter v${version}`,
  "",
  "A focused validation release for Linux installer asset tests.",
  "",
  "## Highlights",
  "",
  "- Validates the Linux x64 AppImage release asset contract for automated checks.",
  "",
  "## Download And Installation",
  "",
  `- Linux x64 uses ${linuxAppImage}. Linux automatic updates are enabled.`,
  "",
  "## Validation",
  "",
  "- Release asset validation, updater metadata validation, naming checks and Linux AppImage verification passed on Linux in this test fixture.",
].join("\n");
const windowsLinuxNotes = [
  `# Multi-Converter v${version}`,
  "",
  "A focused validation release for Windows and Linux installer asset tests.",
  "",
  "## Highlights",
  "",
  "- Validates the Windows installer and Linux x64 AppImage release asset contracts.",
  "",
  "## Download And Installation",
  "",
  `- Windows uses ${versionedInstaller}.`,
  `- Linux x64 uses ${linuxAppImage}. Linux automatic updates are enabled.`,
  "",
  "## Validation",
  "",
  "- Release asset validation, updater metadata validation, naming checks and Linux AppImage verification passed on Linux in this test fixture.",
].join("\n");
const desktopNotes = [
  `# Multi-Converter v${version}`,
  "",
  "A focused validation release for desktop installer asset tests.",
  "",
  "## Highlights",
  "",
  "- Validates the Windows, macOS and Linux release asset contract for automated checks.",
  "",
  "## Download And Installation",
  "",
  `- Windows uses ${versionedInstaller}.`,
  `- macOS uses ${macosDmg}. This macOS build is not Apple-signed and not notarized. After the first launch warning, open System Settings > Privacy & Security, choose Open Anyway, then confirm Open. macOS automatic updates are enabled.`,
  `- Linux x64 uses ${linuxAppImage}. Linux automatic updates are enabled.`,
  "",
  "## Validation",
  "",
  "- Release asset validation, updater metadata validation, naming checks, macOS DMG verification passed on Apple Silicon and Intel, and Linux AppImage verification passed on Linux in this test fixture.",
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
const notesWithPendingMacosDmgVerification = notes.replace(
  "macOS DMG verification passed",
  "macOS DMG verification pending",
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
  `- macOS uses Multi-Converter_${version}_macos-universal.dmg. This macOS build is not Apple-signed and not notarized. After the first launch warning, open System Settings > Privacy & Security, choose Open Anyway, then confirm Open. macOS automatic updates are enabled.`,
  "",
  "## Validation",
  "",
  "- Release asset validation, updater metadata validation, naming checks and macOS DMG verification passed on Apple Silicon and Intel in this test fixture.",
].join("\n");
const notesWithUnsupportedMacosConversionArchitectureClaim = notesWithUnsupportedMacosConversionClaim.replace(
  "- Release asset validation, updater metadata validation, naming checks and macOS DMG verification passed on Apple Silicon and Intel in this test fixture.",
  "- Release asset validation, updater metadata validation, naming checks, macOS Conversion Matrix and macOS DMG verification passed in this test fixture.",
);
const notesWithUnsupportedLinuxConversionClaim = linuxNotes.replace(
  "- Validates the Linux x64 AppImage release asset contract for automated checks.",
  "- All Linux conversions pass.",
);
const notesWithFailedLinuxAppImageVerification = linuxNotes.replace(
  "Linux AppImage verification passed",
  "Linux AppImage verification failed",
);
const notesWithPendingLinuxAppImageVerification = linuxNotes.replace(
  "Linux AppImage verification passed",
  "Linux AppImage verification pending",
);
const notesWithDraftWarning = `${linuxNotes}\n\nDraft only. Do not publish.`;
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
const desktopDir = fs.mkdtempSync(path.join(os.tmpdir(), "mc-assets-desktop-"));
const windowsLinuxDir = fs.mkdtempSync(path.join(os.tmpdir(), "mc-assets-windows-linux-"));
const macosOnlyDir = fs.mkdtempSync(path.join(os.tmpdir(), "mc-assets-macos-"));
const linuxOnlyDir = fs.mkdtempSync(path.join(os.tmpdir(), "mc-assets-linux-"));
const windowsWithDmgDir = fs.mkdtempSync(path.join(os.tmpdir(), "mc-assets-windows-extra-dmg-"));
const windowsWithMacosNotesDir = fs.mkdtempSync(path.join(os.tmpdir(), "mc-assets-windows-macos-notes-"));
const allBadNotesDir = fs.mkdtempSync(path.join(os.tmpdir(), "mc-assets-all-bad-notes-"));
const allDarwinUpdaterDir = fs.mkdtempSync(path.join(os.tmpdir(), "mc-assets-all-darwin-updater-"));
const allMissingDmgDir = fs.mkdtempSync(path.join(os.tmpdir(), "mc-assets-all-missing-dmg-"));
const allMissingMacosValidationDir = fs.mkdtempSync(path.join(os.tmpdir(), "mc-assets-all-missing-macos-validation-"));
const allUnsupportedMacosConversionClaimDir = fs.mkdtempSync(path.join(os.tmpdir(), "mc-assets-all-unsupported-macos-conversion-claim-"));
const allUnsupportedMacosConversionArchitectureClaimDir = fs.mkdtempSync(path.join(os.tmpdir(), "mc-assets-all-unsupported-macos-conversion-architecture-claim-"));
const linuxBadNotesDir = fs.mkdtempSync(path.join(os.tmpdir(), "mc-assets-linux-bad-notes-"));
const linuxUnsupportedConversionClaimDir = fs.mkdtempSync(path.join(os.tmpdir(), "mc-assets-linux-unsupported-conversion-claim-"));
const linuxPendingAppImageVerificationDir = fs.mkdtempSync(path.join(os.tmpdir(), "mc-assets-linux-pending-appimage-verification-"));
const linuxDraftWarningDir = fs.mkdtempSync(path.join(os.tmpdir(), "mc-assets-linux-draft-warning-"));
const linuxNonElfDir = fs.mkdtempSync(path.join(os.tmpdir(), "mc-assets-linux-non-elf-"));
const linuxStableAliasMismatchDir = fs.mkdtempSync(path.join(os.tmpdir(), "mc-assets-linux-alias-mismatch-"));
const linuxChecksumMismatchDir = fs.mkdtempSync(path.join(os.tmpdir(), "mc-assets-linux-checksum-mismatch-"));
const linuxLatestSignatureMismatchDir = fs.mkdtempSync(path.join(os.tmpdir(), "mc-assets-linux-signature-mismatch-"));
const preparedBundleDir = fs.mkdtempSync(path.join(os.tmpdir(), "mc-assets-prepare-bundle-"));
const preparedOutputDir = fs.mkdtempSync(path.join(os.tmpdir(), "mc-assets-prepare-output-"));
const preparedDmgDir = fs.mkdtempSync(path.join(os.tmpdir(), "mc-assets-prepare-dmg-"));
const preparedBadNotesDir = fs.mkdtempSync(path.join(os.tmpdir(), "mc-assets-prepare-bad-notes-"));
const preparedStaleLinuxDir = fs.mkdtempSync(path.join(os.tmpdir(), "mc-assets-prepare-stale-linux-"));
const preparedUnversionedLinuxDir = fs.mkdtempSync(path.join(os.tmpdir(), "mc-assets-prepare-unversioned-linux-"));
const preparedNonElfLinuxDir = fs.mkdtempSync(path.join(os.tmpdir(), "mc-assets-prepare-non-elf-linux-"));
const signingDir = fs.mkdtempSync(path.join(os.tmpdir(), "mc-assets-signing-"));

try {
  assert.match(agentsGuide, /--platform all[^\n]+Windows \+ macOS|Windows \+ macOS[^\n]+--platform all/s, "AGENTS.md must document the Windows + macOS release asset mode");
  assert.match(agentsGuide, /--platform windows-linux/, "AGENTS.md must document the Windows + Linux release asset mode");
  assert.match(agentsGuide, /--platform desktop/, "AGENTS.md must document the Windows + macOS + Linux release asset mode");
  assert.match(agentsGuide, /exactly these thirteen application assets/, "AGENTS.md must list the complete desktop release asset count");

  updaterSignatureVerifierPath = buildUpdaterSignatureVerifier(signingDir);
  updaterPublicKeyPath = generateUpdaterSigningKey(signingDir);
  writeWindowsAssets(windowsDir);
  runValidator(windowsDir, "windows");

  const windowsNotesPath = path.join(preparedDmgDir, "windows-notes.md");
  fs.writeFileSync(windowsNotesPath, windowsNotes);
  runReleaseNotesValidator(windowsNotesPath, false, false);

  const macosNotesPath = path.join(preparedDmgDir, "macos-notes.md");
  fs.writeFileSync(macosNotesPath, notes);
  runReleaseNotesValidator(macosNotesPath, true, false);
  runReleaseNotesValidatorFails(macosNotesPath, false, false, "include_macos=true");

  const linuxNotesPath = path.join(preparedDmgDir, "linux-notes.md");
  fs.writeFileSync(linuxNotesPath, linuxNotes);
  runReleaseNotesValidator(linuxNotesPath, false, true);
  runReleaseNotesValidatorFails(linuxNotesPath, false, false, "include_linux=true");

  const macosNotesWithMarkerBypassTextPath = path.join(preparedDmgDir, "macos-notes-with-marker-bypass-text.md");
  fs.writeFileSync(macosNotesWithMarkerBypassTextPath, notesWithMarkerBypassText);
  runReleaseNotesValidatorFails(macosNotesWithMarkerBypassTextPath, true, false, "visible text outside");

  const macosNotesWithoutSystemSettingsPath = path.join(preparedDmgDir, "macos-notes-without-system-settings.md");
  fs.writeFileSync(macosNotesWithoutSystemSettingsPath, notesWithoutSystemSettings);
  runReleaseNotesValidatorFails(macosNotesWithoutSystemSettingsPath, true, false, "System Settings");

  const macosNotesWithFailedDmgVerificationPath = path.join(preparedDmgDir, "macos-notes-with-failed-dmg-verification.md");
  fs.writeFileSync(macosNotesWithFailedDmgVerificationPath, notesWithFailedMacosDmgVerification);
  runReleaseNotesValidatorFails(macosNotesWithFailedDmgVerificationPath, true, false, "verified on macOS");

  const macosNotesWithPendingDmgVerificationPath = path.join(preparedDmgDir, "macos-notes-with-pending-dmg-verification.md");
  fs.writeFileSync(macosNotesWithPendingDmgVerificationPath, notesWithPendingMacosDmgVerification);
  runReleaseNotesValidatorFails(macosNotesWithPendingDmgVerificationPath, true, false, "verified on macOS");

  const macosNotesWithoutDmgArchitecturesPath = path.join(preparedDmgDir, "macos-notes-without-dmg-architectures.md");
  fs.writeFileSync(macosNotesWithoutDmgArchitecturesPath, notesWithoutMacosDmgArchitectures);
  runReleaseNotesValidatorFails(macosNotesWithoutDmgArchitecturesPath, true, false, "Apple Silicon and Intel");

  const linuxNotesWithFailedAppImageVerificationPath = path.join(preparedDmgDir, "linux-notes-with-failed-appimage-verification.md");
  fs.writeFileSync(linuxNotesWithFailedAppImageVerificationPath, notesWithFailedLinuxAppImageVerification);
  runReleaseNotesValidatorFails(linuxNotesWithFailedAppImageVerificationPath, false, true, "verified on Linux");

  const linuxNotesWithPendingAppImageVerificationPath = path.join(preparedDmgDir, "linux-notes-with-pending-appimage-verification.md");
  fs.writeFileSync(linuxNotesWithPendingAppImageVerificationPath, notesWithPendingLinuxAppImageVerification);
  runReleaseNotesValidatorFails(linuxNotesWithPendingAppImageVerificationPath, false, true, "verified on Linux");

  const linuxNotesWithDraftWarningPath = path.join(preparedDmgDir, "linux-notes-with-draft-warning.md");
  fs.writeFileSync(linuxNotesWithDraftWarningPath, notesWithDraftWarning);
  runReleaseNotesValidatorFails(linuxNotesWithDraftWarningPath, false, true, "draft-only");

  writeMacosAssets(allDir);
  writeWindowsAssets(allDir, notes, { includeMacosUpdater: true });
  runValidator(allDir, "all");

  writeMacosAssets(desktopDir);
  writeLinuxAssets(desktopDir);
  writeWindowsAssets(desktopDir, desktopNotes, { includeMacosUpdater: true, includeLinuxUpdater: true });
  runValidator(desktopDir, "desktop");

  writeLinuxAssets(windowsLinuxDir);
  writeWindowsAssets(windowsLinuxDir, windowsLinuxNotes, { includeLinuxUpdater: true });
  runValidator(windowsLinuxDir, "windows-linux");

  writeMacosAssets(macosOnlyDir);
  runValidator(macosOnlyDir, "macos");

  writeLinuxAssets(linuxOnlyDir);
  writeLinuxLatest(linuxOnlyDir, linuxNotes);
  runValidator(linuxOnlyDir, "linux");

  writeMacosAssets(windowsWithDmgDir);
  writeWindowsAssets(windowsWithDmgDir, windowsNotes, { includeMacosUpdater: true });
  runValidatorFails(windowsWithDmgDir, "windows", "Release asset set");

  writeWindowsAssets(windowsWithMacosNotesDir, notes);
  runValidatorFails(windowsWithMacosNotesDir, "windows", "include_macos=true");

  writeLinuxAssets(linuxBadNotesDir);
  writeLinuxLatest(linuxBadNotesDir, windowsNotes);
  runValidatorFails(linuxBadNotesDir, "linux", "Linux release notes must name");

  writeMacosAssets(allBadNotesDir);
  writeWindowsAssets(allBadNotesDir, notesWithoutMacosWarning, { includeMacosUpdater: true });
  runValidatorFails(allBadNotesDir, "all", "Apple-signed");

  writeWindowsAssets(allDarwinUpdaterDir, notes, { includeDarwinUpdater: true });
  writeMacosAssets(allDarwinUpdaterDir);
  runValidatorFails(allDarwinUpdaterDir, "all", "expected updater platforms");

  writeWindowsAssets(allMissingDmgDir);
  runValidatorFails(allMissingDmgDir, "all", "Release asset set");

  writeMacosAssets(allMissingMacosValidationDir);
  writeWindowsAssets(allMissingMacosValidationDir, notes.replace(" and macOS DMG verification", ""), { includeMacosUpdater: true });
  runValidatorFails(allMissingMacosValidationDir, "all", "verified on macOS");

  writeMacosAssets(allUnsupportedMacosConversionClaimDir);
  writeWindowsAssets(allUnsupportedMacosConversionClaimDir, notesWithUnsupportedMacosConversionClaim, { includeMacosUpdater: true });
  runValidatorFails(allUnsupportedMacosConversionClaimDir, "all", "macOS Conversion Matrix");

  writeMacosAssets(allUnsupportedMacosConversionArchitectureClaimDir);
  writeWindowsAssets(allUnsupportedMacosConversionArchitectureClaimDir, notesWithUnsupportedMacosConversionArchitectureClaim, { includeMacosUpdater: true });
  runValidatorFails(allUnsupportedMacosConversionArchitectureClaimDir, "all", "Apple Silicon and Intel");

  writeLinuxAssets(linuxUnsupportedConversionClaimDir);
  writeLinuxLatest(linuxUnsupportedConversionClaimDir, notesWithUnsupportedLinuxConversionClaim);
  runValidatorFails(linuxUnsupportedConversionClaimDir, "linux", "Linux Conversion Matrix");

  writeLinuxAssets(linuxPendingAppImageVerificationDir);
  writeLinuxLatest(linuxPendingAppImageVerificationDir, notesWithPendingLinuxAppImageVerification);
  runValidatorFails(linuxPendingAppImageVerificationDir, "linux", "verified on Linux");

  writeLinuxAssets(linuxDraftWarningDir);
  writeLinuxLatest(linuxDraftWarningDir, notesWithDraftWarning);
  runValidatorFails(linuxDraftWarningDir, "linux", "draft-only");

  writeLinuxAssets(linuxNonElfDir);
  writeLinuxLatest(linuxNonElfDir, linuxNotes);
  fs.writeFileSync(path.join(linuxNonElfDir, linuxAppImage), "not an elf appimage\n");
  fs.writeFileSync(path.join(linuxNonElfDir, stableLinuxAppImage), "not an elf appimage\n");
  runValidatorFails(linuxNonElfDir, "linux", "not an x86_64 ELF executable");

  writeLinuxAssets(linuxStableAliasMismatchDir);
  writeLinuxLatest(linuxStableAliasMismatchDir, linuxNotes);
  fs.writeFileSync(path.join(linuxStableAliasMismatchDir, stableLinuxAppImage), fakeX86_64Elf("different linux appimage alias\n"));
  runValidatorFails(linuxStableAliasMismatchDir, "linux", "Stable Linux AppImage alias hash does not match");

  writeLinuxAssets(linuxChecksumMismatchDir);
  writeLinuxLatest(linuxChecksumMismatchDir, linuxNotes);
  fs.writeFileSync(path.join(linuxChecksumMismatchDir, `${linuxAppImage}.sha256`), `${"0".repeat(64)}  ${linuxAppImage}`);
  runValidatorFails(linuxChecksumMismatchDir, "linux", "Linux checksum file must be");

  writeLinuxAssets(linuxLatestSignatureMismatchDir);
  writeLinuxLatest(linuxLatestSignatureMismatchDir, linuxNotes, { signature: "wrong-linux-updater-signature" });
  runValidatorFails(linuxLatestSignatureMismatchDir, "linux", `latest.json linux-x86_64 signature does not match ${linuxAppImageSignature}`);

  writeBundleFixture(preparedBundleDir);
  fs.writeFileSync(path.join(preparedDmgDir, "source.dmg"), "fake dmg\n");
  fs.writeFileSync(path.join(preparedDmgDir, "source.app.tar.gz"), "fake macos updater archive\n");
  signUpdaterFixture(path.join(preparedDmgDir, "source.app.tar.gz"), path.join(preparedDmgDir, "source.app.tar.gz.sig"));
  fs.writeFileSync(path.join(preparedOutputDir, "stale.log"), "stale output\n");
  runPrepare(
    preparedBundleDir,
    preparedOutputDir,
    notes,
    path.join(preparedDmgDir, "source.dmg"),
    path.join(preparedDmgDir, "source.app.tar.gz"),
    path.join(preparedDmgDir, "source.app.tar.gz.sig"),
  );
  assert.ok(!fs.existsSync(path.join(preparedOutputDir, "stale.log")), "prepare-release-assets must clean stale files from the output directory");
  runValidator(preparedOutputDir, "all");

  runPrepareFails(
    preparedBundleDir,
    preparedBadNotesDir,
    notesWithoutMacosWarning,
    path.join(preparedDmgDir, "source.dmg"),
    path.join(preparedDmgDir, "source.app.tar.gz"),
    path.join(preparedDmgDir, "source.app.tar.gz.sig"),
    "Apple-signed",
  );

  const staleLinuxAppImagePath = path.join(preparedDmgDir, "Multi-Converter_1.0.4_linux-x64.AppImage");
  fs.writeFileSync(staleLinuxAppImagePath, "stale linux appimage\n");
  signUpdaterFixture(staleLinuxAppImagePath, `${staleLinuxAppImagePath}.sig`);
  runPrepareFails(
    preparedBundleDir,
    preparedStaleLinuxDir,
    windowsLinuxNotes,
    null,
    null,
    null,
    "appears to be version 1.0.4",
    staleLinuxAppImagePath,
    `${staleLinuxAppImagePath}.sig`,
  );

  const unversionedLinuxAppImagePath = path.join(preparedDmgDir, "Multi-Converter_linux-x64.AppImage");
  fs.writeFileSync(unversionedLinuxAppImagePath, "unversioned linux appimage\n");
  signUpdaterFixture(unversionedLinuxAppImagePath, `${unversionedLinuxAppImagePath}.sig`);
  runPrepareFails(
    preparedBundleDir,
    preparedUnversionedLinuxDir,
    windowsLinuxNotes,
    null,
    null,
    null,
    "filename must include version 9.8.7",
    unversionedLinuxAppImagePath,
    `${unversionedLinuxAppImagePath}.sig`,
  );

  const nonElfLinuxAppImagePath = path.join(preparedDmgDir, `Multi-Converter_${version}_linux-x64.AppImage`);
  fs.writeFileSync(nonElfLinuxAppImagePath, "versioned but not elf\n");
  signUpdaterFixture(nonElfLinuxAppImagePath, `${nonElfLinuxAppImagePath}.sig`);
  runPrepareFails(
    preparedBundleDir,
    preparedNonElfLinuxDir,
    windowsLinuxNotes,
    null,
    null,
    null,
    "not an x86_64 ELF executable",
    nonElfLinuxAppImagePath,
    `${nonElfLinuxAppImagePath}.sig`,
  );
} finally {
  for (const dir of [
    windowsDir,
    allDir,
    desktopDir,
    windowsLinuxDir,
    macosOnlyDir,
    linuxOnlyDir,
    windowsWithDmgDir,
    windowsWithMacosNotesDir,
    allBadNotesDir,
    allDarwinUpdaterDir,
    allMissingDmgDir,
    allMissingMacosValidationDir,
    allUnsupportedMacosConversionClaimDir,
    allUnsupportedMacosConversionArchitectureClaimDir,
    linuxBadNotesDir,
    linuxUnsupportedConversionClaimDir,
    linuxPendingAppImageVerificationDir,
    linuxDraftWarningDir,
    linuxNonElfDir,
    linuxStableAliasMismatchDir,
    linuxChecksumMismatchDir,
    linuxLatestSignatureMismatchDir,
    preparedBundleDir,
    preparedOutputDir,
    preparedDmgDir,
    preparedBadNotesDir,
    preparedStaleLinuxDir,
    preparedUnversionedLinuxDir,
    preparedNonElfLinuxDir,
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
  if (options.includeMacosUpdater) {
    const macosSignature = fs.readFileSync(path.join(dir, macosUpdaterSignature), "utf8").trim();
    const macosUrl = `https://github.com/Amix29/Multi-Converter/releases/download/${tag}/${macosUpdaterArchive}`;
    platforms["darwin-aarch64"] = {
      signature: macosSignature,
      url: macosUrl,
    };
    platforms["darwin-x86_64"] = {
      signature: macosSignature,
      url: macosUrl,
    };
  }
  if (options.includeLinuxUpdater) {
    const linuxSignature = fs.readFileSync(path.join(dir, linuxAppImageSignature), "utf8").trim();
    platforms["linux-x86_64"] = {
      signature: linuxSignature,
      url: `https://github.com/Amix29/Multi-Converter/releases/download/${tag}/${linuxAppImage}`,
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

function writeMacosAssets(dir) {
  const dmgBytes = Buffer.from("fake dmg\n", "utf8");
  const updaterBytes = Buffer.from("fake macos updater archive\n", "utf8");
  fs.writeFileSync(path.join(dir, macosDmg), dmgBytes);
  fs.writeFileSync(path.join(dir, stableMacosDmg), dmgBytes);
  const updaterPath = path.join(dir, macosUpdaterArchive);
  fs.writeFileSync(updaterPath, updaterBytes);
  signUpdaterFixture(updaterPath, path.join(dir, macosUpdaterSignature));
}

function writeLinuxAssets(dir) {
  const appImageBytes = fakeX86_64Elf("fake linux appimage\n");
  const appImagePath = path.join(dir, linuxAppImage);
  fs.writeFileSync(appImagePath, appImageBytes);
  fs.writeFileSync(path.join(dir, stableLinuxAppImage), appImageBytes);
  signUpdaterFixture(appImagePath, path.join(dir, linuxAppImageSignature));
  fs.writeFileSync(path.join(dir, `${linuxAppImage}.sha256`), `${sha256(appImageBytes)}  ${linuxAppImage}`);
}

function writeLinuxLatest(dir, releaseNotes, options = {}) {
  const signature = options.signature ?? fs.readFileSync(path.join(dir, linuxAppImageSignature), "utf8").trim();
  fs.writeFileSync(
    path.join(dir, "latest.json"),
    `${JSON.stringify(
      {
        version,
        notes: releaseNotes,
        pub_date: "2026-06-11T00:00:00.000Z",
        platforms: {
          "linux-x86_64": {
            signature,
            url: `https://github.com/Amix29/Multi-Converter/releases/download/${tag}/${linuxAppImage}`,
          },
        },
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
    ...(platform === "all" || platform === "macos" || platform === "desktop" ? [
      "--macos-dmg-sha256",
      sha256(fs.readFileSync(path.join(dir, macosDmg))),
      "--macos-updater-sha256",
      sha256(fs.readFileSync(path.join(dir, macosUpdaterArchive))),
    ] : []),
    ...(platform === "linux" || platform === "windows-linux" || platform === "desktop" ? [
      "--linux-appimage-sha256",
      sha256(fs.readFileSync(path.join(dir, linuxAppImage))),
    ] : []),
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
  const dmgPath = path.join(dir, macosDmg);
  if (fs.existsSync(dmgPath)) {
    args.push("--macos-dmg-sha256", sha256(fs.readFileSync(dmgPath)));
  }
  const updaterPath = path.join(dir, macosUpdaterArchive);
  if (fs.existsSync(updaterPath)) {
    args.push("--macos-updater-sha256", sha256(fs.readFileSync(updaterPath)));
  }
  const linuxAppImagePath = path.join(dir, linuxAppImage);
  if (fs.existsSync(linuxAppImagePath)) {
    args.push("--linux-appimage-sha256", sha256(fs.readFileSync(linuxAppImagePath)));
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

function runReleaseNotesValidator(notesPath, includeMacos, includeLinux) {
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
      "--include-linux",
      String(includeLinux),
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

function runReleaseNotesValidatorFails(notesPath, includeMacos, includeLinux, expectedMessage) {
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
      "--include-linux",
      String(includeLinux),
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

function runPrepare(bundleDir, outDir, releaseNotes, macosDmg, macosUpdaterArchivePath, macosUpdaterSignaturePath) {
  const result = runPrepareProcess(bundleDir, outDir, releaseNotes, macosDmg, macosUpdaterArchivePath, macosUpdaterSignaturePath);
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

function runPrepareFails(
  bundleDir,
  outDir,
  releaseNotes,
  macosDmg,
  macosUpdaterArchivePath,
  macosUpdaterSignaturePath,
  expectedMessage,
  linuxAppImagePath = null,
  linuxAppImageSignaturePath = null,
) {
  const result = runPrepareProcess(
    bundleDir,
    outDir,
    releaseNotes,
    macosDmg,
    macosUpdaterArchivePath,
    macosUpdaterSignaturePath,
    linuxAppImagePath,
    linuxAppImageSignaturePath,
  );
  assert.notEqual(result.status, 0, "prepare-release-assets unexpectedly passed");
  const output = `${result.stderr}\n${result.stdout}`;
  assert.match(output, new RegExp(expectedMessage.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), output);
}

function runPrepareProcess(
  bundleDir,
  outDir,
  releaseNotes,
  macosDmg,
  macosUpdaterArchivePath,
  macosUpdaterSignaturePath,
  linuxAppImagePath = null,
  linuxAppImageSignaturePath = null,
) {
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
  if (macosUpdaterArchivePath) {
    args.push("--macos-updater-archive", macosUpdaterArchivePath);
  }
  if (macosUpdaterSignaturePath) {
    args.push("--macos-updater-signature", macosUpdaterSignaturePath);
  }
  if (linuxAppImagePath) {
    args.push("--linux-appimage", linuxAppImagePath);
  }
  if (linuxAppImageSignaturePath) {
    args.push("--linux-appimage-signature", linuxAppImageSignaturePath);
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

function fakeX86_64Elf(text) {
  const header = Buffer.alloc(20);
  header[0] = 0x7f;
  header[1] = 0x45;
  header[2] = 0x4c;
  header[3] = 0x46;
  header[4] = 0x02;
  header[5] = 0x01;
  header[18] = 0x3e;
  header[19] = 0x00;
  return Buffer.concat([header, Buffer.from(text, "utf8")]);
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
