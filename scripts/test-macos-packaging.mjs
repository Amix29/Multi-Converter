import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const tauriConfig = JSON.parse(fs.readFileSync(path.join(root, "src-tauri", "tauri.conf.json"), "utf8"));
const macosConfig = JSON.parse(fs.readFileSync(path.join(root, "src-tauri", "tauri.macos.conf.json"), "utf8"));
const enginesManifest = JSON.parse(fs.readFileSync(path.join(root, "src-tauri", "engines-manifest.json"), "utf8"));
const tauriSchema = fs.readFileSync(path.join(root, "node_modules", "@tauri-apps", "cli", "config.schema.json"), "utf8");
const macosHostTest = fs.readFileSync(path.join(root, "scripts", "test-macos-host.mjs"), "utf8");
const macosDmgVerify = fs.readFileSync(path.join(root, "scripts", "verify-macos-dmg.mjs"), "utf8");
const prepareScript = fs.readFileSync(path.join(root, "scripts", "prepare-bundled-engines.mjs"), "utf8");
const validateScript = fs.readFileSync(path.join(root, "scripts", "validate-bundled-engines.mjs"), "utf8");
const packageScript = fs.readFileSync(path.join(root, "scripts", "package-engines.mjs"), "utf8");
const enginesRust = fs.readFileSync(path.join(root, "src-tauri", "src", "engines.rs"), "utf8");
const convertersRust = fs.readFileSync(path.join(root, "src-tauri", "src", "converters.rs"), "utf8");
const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
const macosChecklist = fs.readFileSync(path.join(root, "docs", "RELEASE_CHECKLIST_MACOS.md"), "utf8");
const thirdPartyEngines = fs.readFileSync(path.join(root, "docs", "THIRD_PARTY_ENGINES.md"), "utf8");

assert.deepEqual(tauriConfig.bundle.externalBin, ["binaries/ffmpeg", "binaries/ffprobe"], "Tauri sidecar stems changed unexpectedly");
assert.match(tauriSchema, /binary-name\{-target-triple\}/, "Tauri externalBin schema must keep target-triple sidecar naming");
assert.equal(packageJson.scripts["test:macos:host"], "node scripts/test-macos-host.mjs", "macOS host test script must be exposed through npm");
assert.equal(packageJson.scripts["verify:macos-dmg"], "node scripts/verify-macos-dmg.mjs", "macOS DMG verification script must be exposed through npm");
assert.match(packageJson.scripts["tauri:build:macos"], /--target universal-apple-darwin/, "macOS build must target universal-apple-darwin");
assert.match(
  fs.readFileSync(path.join(root, "scripts", "run-tauri.mjs"), "utf8"),
  /macOS universal DMG builds must run on macOS/,
  "Tauri wrapper must refuse universal macOS DMG builds on non-macOS hosts",
);
assert.match(macosHostTest, /process\.platform !== "darwin"/, "macOS host validation must refuse non-macOS hosts");
assert.match(macosHostTest, /lipo.*-verify_arch/s, "macOS host validation must verify binary architectures with lipo");
assert.match(macosHostTest, /verifySidecarVersion\(universal, stem\)/, "macOS host validation must smoke-test universal sidecars");
assert.match(macosHostTest, /MULTI_CONVERTER_ENGINE_PLATFORM:\s*"macos-universal"/, "macOS host validation must run bundled-engine validation as macos-universal");
assert.match(macosDmgVerify, /process\.platform !== "darwin"/, "macOS DMG verification must refuse non-macOS hosts");
assert.match(macosDmgVerify, /hdiutil.*attach/s, "macOS DMG verification must mount the DMG");
assert.match(macosDmgVerify, /CFBundleExecutable/, "macOS DMG verification must read the executable name from Info.plist");
assert.match(macosDmgVerify, /Mounted DMG contains multiple app bundles/, "macOS DMG verification must reject ambiguous DMGs with multiple app bundles");
assert.match(macosDmgVerify, /function sidecarSearchDirs\(appPath\)/, "macOS DMG verification must constrain sidecar lookup to runtime sidecar locations");
assert.match(macosDmgVerify, /Contents", "MacOS"/, "macOS DMG verification must check Contents/MacOS for sidecars");
assert.match(macosDmgVerify, /Contents", "Resources"/, "macOS DMG verification must check Contents/Resources for sidecars");
assert.match(macosDmgVerify, /codesign.*--verify/s, "macOS DMG verification must verify the app signature");
assert.match(macosDmgVerify, /lipo.*-verify_arch/s, "macOS DMG verification must verify universal binaries");
assert.match(macosDmgVerify, /verifySidecarVersion\(universal, stem\)/, "macOS DMG verification must smoke-test bundled universal sidecars");
assert.match(macosDmgVerify, /function verifyBundledEngines\(appPath\)/, "macOS DMG verification must inspect bundled engine resources");
assert.match(macosDmgVerify, /Windows-only bundled engine resource found in macOS app bundle/, "macOS DMG verification must reject Windows-only engine files");
assert.match(macosDmgVerify, /metadata\.platform !== "macos-universal"/, "macOS DMG verification must reject non-macOS engine metadata");
assert.deepEqual(macosConfig.bundle.targets, ["app", "dmg"], "macOS release must build app and dmg bundles");
assert.deepEqual(macosConfig.bundle.externalBin, tauriConfig.bundle.externalBin, "macOS release config must keep the same sidecar stems as the base config");
assert.deepEqual(macosConfig.bundle.resources, tauriConfig.bundle.resources, "macOS release config must keep bundled engine resources");
assert.equal(macosConfig.bundle.createUpdaterArtifacts, false, "macOS DMG releases must not create updater artifacts until Darwin updater metadata is enabled");
assert.equal(macosConfig.bundle.macOS.signingIdentity, "-", "unsigned macOS builds should use Tauri ad-hoc signing");
assert.equal(macosConfig.bundle.macOS.minimumSystemVersion, "11.0", "macOS minimum version must stay explicit");

for (const name of ["ffmpeg", "ffprobe"]) {
  for (const triple of ["aarch64-apple-darwin", "x86_64-apple-darwin", "universal-apple-darwin"]) {
    assert.ok(
      prepareScript.includes(`${name}-${triple}`) || prepareScript.includes(`${name}-\${targetTriple}`) || prepareScript.includes("${stem}-universal-apple-darwin"),
      `${name}-${triple} is missing from macOS preparation`,
    );
    assert.ok(
      validateScript.includes(`${name}-${triple}`) || validateScript.includes("${stem}-${targetTriple}") || validateScript.includes("${stem}-universal-apple-darwin"),
      `${name}-${triple} is missing from macOS validation`,
    );
    assert.match(macosChecklist, new RegExp(`${name}-${triple}`), `${name}-${triple} is missing from the macOS checklist`);
  }
}

assert.match(prepareScript, /spawnSync\("lipo", \["-create"/, "macOS preparation must create universal sidecars with lipo");
assert.match(prepareScript, /async function pruneBundledEngines\(expectedEngines\)/, "macOS preparation must prune stale bundled engines before packaging");
assert.match(prepareScript, /Refusing to remove path outside bundled engines/, "stale engine pruning must guard recursive removals");
assert.match(validateScript, /function validateNoStaleBundledEngines\(value\)/, "bundled engine validation must reject stale platform resources");
assert.match(enginesRust, /fn universal_binary_name\(stem: &str\) -> String/, "runtime must resolve universal macOS sidecar names");
assert.match(enginesRust, /resource_dir\.join\(&universal_binary_name\)/, "runtime must check bundled universal sidecars");
assert.match(enginesRust, /resource_dir\.join\("binaries"\)\.join\(&universal_binary_name\)/, "runtime must check resource-directory universal sidecars");
assert.match(enginesRust, /manifest_binaries_dir\.join\(&universal_binary_name\)/, "runtime must check source-tree universal sidecars for macOS dev and tests");
assert.match(convertersRust, /fn sidecar_test_names\(stem: &str\) -> Vec<String>/, "conversion tests must resolve sidecars by platform");
assert.match(convertersRust, /format!\("\{stem\}-universal-apple-darwin"\)/, "conversion tests must prefer universal macOS sidecars");
assert.match(packageScript, /platform !== "windows-x64" && engine\.binaryPaths\.includes\(relative\)/, "engine packaging must require executable bits for non-Windows binaries");
assert.match(packageScript, /canCheckExecutableBits\(\)/, "engine packaging must gate executable-bit checks by host capability");
assert.match(packageScript, /ffmpeg-8\.1\.1-macos-universal\.zip/, "engine packaging validation must include a macOS universal fixture");

const hasMacosAdvancedEngines = (enginesManifest.engines ?? []).some((engine) => engine.platform === "macos-universal" && engine.mode === "advanced");
if (!hasMacosAdvancedEngines) {
  assert.match(readme, /Advanced macOS engines must not be advertised until/, "README must warn that advanced macOS engines are not ready yet");
  assert.match(macosChecklist, /advanced bundled engines are still declared for `windows-x64` only/, "macOS checklist must warn that advanced engines are Windows-only right now");
  assert.match(thirdPartyEngines, /macOS release notes and user-facing docs must limit macOS conversion claims/, "third-party engine docs must prevent overclaiming macOS engine support");
}

console.log("macOS packaging contract tests passed.");
