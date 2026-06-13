import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const tauriConfig = JSON.parse(fs.readFileSync(path.join(root, "src-tauri", "tauri.conf.json"), "utf8"));
const macosConfig = JSON.parse(fs.readFileSync(path.join(root, "src-tauri", "tauri.macos.conf.json"), "utf8"));
const macosEngineConfig = JSON.parse(fs.readFileSync(path.join(root, "tools", "engine-packages.macos.config.json"), "utf8"));
const enginesManifest = JSON.parse(fs.readFileSync(path.join(root, "src-tauri", "engines-manifest.json"), "utf8"));
const tauriSchema = fs.readFileSync(path.join(root, "node_modules", "@tauri-apps", "cli", "config.schema.json"), "utf8");
const macosHostTest = fs.readFileSync(path.join(root, "scripts", "test-macos-host.mjs"), "utf8");
const macosConversionTest = fs.readFileSync(path.join(root, "scripts", "test-macos-conversions.mjs"), "utf8");
const macosDmgVerify = fs.readFileSync(path.join(root, "scripts", "verify-macos-dmg.mjs"), "utf8");
const macosFfmpegPrepare = fs.readFileSync(path.join(root, "scripts", "prepare-ffmpeg-engine-macos.mjs"), "utf8");
const macosPdfiumPrepare = fs.readFileSync(path.join(root, "scripts", "prepare-pdfium-engine-macos.mjs"), "utf8");
const macosLibreOfficePrepare = fs.readFileSync(path.join(root, "scripts", "prepare-libreoffice-engine-macos.mjs"), "utf8");
const macosPandocPrepare = fs.readFileSync(path.join(root, "scripts", "prepare-pandoc-engine-macos.mjs"), "utf8");
const macosLibvipsPrepare = fs.readFileSync(path.join(root, "scripts", "prepare-libvips-engine-macos.mjs"), "utf8");
const macosLibvipsRuntimeBuild = fs.readFileSync(path.join(root, "scripts", "build-libvips-macos-runtime.mjs"), "utf8");
const macosLocalEnginesPrepare = fs.readFileSync(path.join(root, "scripts", "prepare-macos-local-engines.mjs"), "utf8");
const macosLibvipsInputPrepare = fs.readFileSync(path.join(root, "scripts", "prepare-libvips-macos-release-inputs.mjs"), "utf8");
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
assert.equal(packageJson.scripts["test:macos:conversions"], "node scripts/test-macos-conversions.mjs", "macOS conversion test script must be exposed through npm");
assert.equal(packageJson.scripts["verify:macos-dmg"], "node scripts/verify-macos-dmg.mjs", "macOS DMG verification script must be exposed through npm");
assert.match(packageJson.scripts["tauri:build:macos"], /--target universal-apple-darwin/, "macOS build must target universal-apple-darwin");
assert.match(packageJson.scripts["package:macos-engines"], /engine-packages\.macos\.config\.json/, "macOS engine packaging script must use the macOS engine config");
assert.equal(packageJson.scripts["prepare:macos-local-engines"], "node scripts/prepare-macos-local-engines.mjs", "local macOS engine staging script must be exposed through npm");
assert.equal(packageJson.scripts["prepare:ffmpeg-engine:macos"], "node scripts/prepare-ffmpeg-engine-macos.mjs", "macOS FFmpeg preparation script must be exposed through npm");
assert.equal(packageJson.scripts["prepare:pdfium-engine:macos"], "node scripts/prepare-pdfium-engine-macos.mjs", "macOS PDFium preparation script must be exposed through npm");
assert.equal(packageJson.scripts["prepare:libreoffice-engine:macos"], "node scripts/prepare-libreoffice-engine-macos.mjs", "macOS LibreOffice preparation script must be exposed through npm");
assert.equal(packageJson.scripts["prepare:pandoc-engine:macos"], "node scripts/prepare-pandoc-engine-macos.mjs", "macOS Pandoc preparation script must be exposed through npm");
assert.equal(packageJson.scripts["prepare:libvips-engine:macos"], "node scripts/prepare-libvips-engine-macos.mjs", "macOS libvips preparation script must be exposed through npm");
assert.match(packageJson.scripts["prepare:macos-upstream-engines"], /prepare:pdfium-engine:macos/, "macOS upstream preparation must include PDFium");
assert.match(packageJson.scripts["prepare:macos-upstream-engines"], /prepare:libreoffice-engine:macos/, "macOS upstream preparation must include LibreOffice");
assert.match(packageJson.scripts["prepare:macos-upstream-engines"], /prepare:pandoc-engine:macos/, "macOS upstream preparation must include Pandoc");
assert.doesNotMatch(packageJson.scripts["prepare:macos-upstream-engines"], /prepare:ffmpeg-engine:macos/, "macOS upstream preparation must not silently choose an FFmpeg binary provider");
assert.doesNotMatch(packageJson.scripts["prepare:macos-upstream-engines"], /prepare:libvips-engine:macos/, "macOS upstream preparation must not silently copy Homebrew-style libvips trees");
assert.match(
  fs.readFileSync(path.join(root, "scripts", "run-tauri.mjs"), "utf8"),
  /macOS universal DMG builds must run on macOS/,
  "Tauri wrapper must refuse universal macOS DMG builds on non-macOS hosts",
);
assert.match(macosHostTest, /process\.platform !== "darwin"/, "macOS host validation must refuse non-macOS hosts");
assert.match(macosHostTest, /lipo.*-verify_arch/s, "macOS host validation must verify binary architectures with lipo");
for (const [scriptName, scriptText] of Object.entries({
  "build-libvips-macos-runtime.mjs": macosLibvipsRuntimeBuild,
  "prepare-ffmpeg-engine-macos.mjs": macosFfmpegPrepare,
  "prepare-pdfium-engine-macos.mjs": macosPdfiumPrepare,
  "prepare-pandoc-engine-macos.mjs": macosPandocPrepare,
  "prepare-libvips-engine-macos.mjs": macosLibvipsPrepare,
  "test-macos-host.mjs": macosHostTest,
  "test-macos-conversions.mjs": macosConversionTest,
  "verify-macos-dmg.mjs": macosDmgVerify,
})) {
  assert.doesNotMatch(scriptText, /\[\s*"-verify_arch"/, `${scriptName} must pass the input file before lipo -verify_arch`);
}
assert.match(macosHostTest, /verifySidecarVersion\(universal, stem\)/, "macOS host validation must smoke-test universal sidecars");
assert.match(macosHostTest, /MULTI_CONVERTER_ENGINE_PLATFORM:\s*"macos-universal"/, "macOS host validation must run bundled-engine validation as macos-universal");
assert.match(macosConversionTest, /process\.platform !== "darwin"/, "macOS conversion validation must refuse non-macOS hosts");
assert.match(macosConversionTest, /sidecarMarker = "Multi-Converter CI placeholder sidecar for Tauri compile checks only\."/,
  "macOS conversion validation must know the CI placeholder sidecar marker");
assert.match(macosConversionTest, /is a CI placeholder, not a real conversion sidecar/, "macOS conversion validation must reject placeholder sidecars");
assert.match(macosConversionTest, /const requiredAdvancedEngines = \["pdfium", "libreoffice", "pandoc", "libvips"\]/,
  "macOS conversion validation must require every advanced engine before claiming full coverage");
assert.match(macosConversionTest, /downloadUrl.*REPLACE_WITH_RELEASE_BASE_URL/, "macOS conversion validation must reject placeholder engine URLs");
assert.match(macosConversionTest, /sha256 is missing or placeholder/, "macOS conversion validation must reject placeholder engine checksums");
assert.match(macosConversionTest, /binaryPaths must not reference Windows files/, "macOS conversion validation must reject Windows binary paths");
assert.match(macosConversionTest, /runStep\("Preparing real macOS bundled engines", "npm", \["run", "prepare:bundled-engines"\]/,
  "macOS conversion validation must prepare bundled engines before testing");
assert.match(macosConversionTest, /runStep\("Validating macOS sidecars and bundled engines", "npm", \["run", "test:macos:host"\]/,
  "macOS conversion validation must include staged sidecar host validation");
assert.match(macosConversionTest, /runStep\("Running PDFium wrapper runtime tests with macOS PDFium", "npm", \["run", "test:pdfium-wrapper"\]/,
  "macOS conversion validation must include PDFium runtime tests");
assert.match(macosConversionTest, /runStep\("Running full conversion matrix on macOS", "npm", \["run", "test:conversions"\]/,
  "macOS conversion validation must run the full conversion matrix");
assert.doesNotMatch(macosConversionTest, /prepare-tauri-ci-sidecars/, "macOS conversion validation must never stage compile-only placeholder sidecars");
assert.match(macosConversionTest, /This gate is intentionally strict/, "macOS conversion validation failure must explain why strictness matters");
assert.match(macosFfmpegPrepare, /process\.platform !== "darwin"/, "macOS FFmpeg preparation must refuse non-macOS hosts");
assert.match(macosFfmpegPrepare, /FFMPEG_MACOS_AARCH64_ARCHIVE_URL/, "macOS FFmpeg preparation must accept an Apple Silicon source URL");
assert.match(macosFfmpegPrepare, /FFMPEG_MACOS_X86_64_ARCHIVE_URL/, "macOS FFmpeg preparation must accept an Intel source URL");
assert.match(macosFfmpegPrepare, /FFMPEG_MACOS_AARCH64_ARCHIVE_SHA256/, "macOS FFmpeg preparation must require a pinned Apple Silicon archive checksum");
assert.match(macosFfmpegPrepare, /FFMPEG_MACOS_X86_64_ARCHIVE_SHA256/, "macOS FFmpeg preparation must require a pinned Intel archive checksum");
assert.match(macosFfmpegPrepare, /does not choose a third-party FFmpeg binary provider automatically/, "macOS FFmpeg preparation must not pick a third-party binary provider silently");
assert.match(macosFfmpegPrepare, /expectedVersion.*"8\.1\.1"/, "macOS FFmpeg preparation must default to the configured FFmpeg version");
assert.match(macosFfmpegPrepare, /lipo.*-create/s, "macOS FFmpeg preparation must create universal sidecars with lipo");
assert.match(macosFfmpegPrepare, /ffmpeg-universal-apple-darwin/, "macOS FFmpeg preparation must stage the universal FFmpeg sidecar name used by Tauri");
assert.match(macosFfmpegPrepare, /ffprobe-universal-apple-darwin/, "macOS FFmpeg preparation must stage the universal ffprobe sidecar name used by Tauri");
assert.match(macosFfmpegPrepare, /smokeTestVersion\(.*"ffmpeg"/s, "macOS FFmpeg preparation must smoke-test FFmpeg");
assert.match(macosFfmpegPrepare, /smokeTestVersion\(.*"ffprobe"/s, "macOS FFmpeg preparation must smoke-test ffprobe");
assert.match(macosPdfiumPrepare, /process\.platform !== "darwin"/, "macOS PDFium preparation must refuse non-macOS hosts");
assert.match(macosPdfiumPrepare, /pdfium-mac-univ\.tgz/, "macOS PDFium preparation must use the upstream universal PDFium archive");
assert.match(macosPdfiumPrepare, /aarch64-apple-darwin/, "macOS PDFium wrapper must build for Apple Silicon");
assert.match(macosPdfiumPrepare, /x86_64-apple-darwin/, "macOS PDFium wrapper must build for Intel");
assert.match(macosPdfiumPrepare, /lipo.*-create/s, "macOS PDFium preparation must create a universal wrapper with lipo");
assert.match(macosPdfiumPrepare, /pdfium-render-universal-apple-darwin/, "macOS PDFium preparation must stage the universal wrapper name used by the engine config");
assert.match(macosLibreOfficePrepare, /process\.platform !== "darwin"/, "macOS LibreOffice preparation must refuse non-macOS hosts");
assert.match(macosLibreOfficePrepare, /LibreOffice_\$\{version\}_MacOS_aarch64\.dmg/, "macOS LibreOffice preparation must use the official Apple Silicon DMG name");
assert.match(macosLibreOfficePrepare, /LibreOffice_\$\{version\}_MacOS_x86-64\.dmg/, "macOS LibreOffice preparation must use the official Intel DMG name");
assert.match(macosLibreOfficePrepare, /hdiutil.*attach/s, "macOS LibreOffice preparation must mount official DMGs with hdiutil");
assert.match(macosLibreOfficePrepare, /arch:\s+"aarch64"/, "macOS LibreOffice preparation must stage Apple Silicon app bundle input");
assert.match(macosLibreOfficePrepare, /arch:\s+"x86_64"/, "macOS LibreOffice preparation must stage Intel app bundle input");
assert.match(macosLibreOfficePrepare, /path\.join\(sourceDir,\s+input\.arch,\s+"LibreOffice\.app"\)/, "macOS LibreOffice preparation must stage app bundles under the architecture directory");
assert.match(macosLibreOfficePrepare, /--terminate_after_init/, "macOS LibreOffice preparation must smoke-test headless startup");
assert.match(macosPandocPrepare, /process\.platform !== "darwin"/, "macOS Pandoc preparation must refuse non-macOS hosts");
assert.match(macosPandocPrepare, /arm64-macOS\\.zip/, "macOS Pandoc preparation must use the official Apple Silicon ZIP");
assert.match(macosPandocPrepare, /x86_64-macOS\\.zip/, "macOS Pandoc preparation must use the official Intel ZIP");
assert.match(macosPandocPrepare, /lipo.*-create/s, "macOS Pandoc preparation must create a universal binary with lipo");
assert.match(macosPandocPrepare, /pandoc-universal-apple-darwin/, "macOS Pandoc preparation must stage the universal binary name used by the engine config");
assert.match(macosLibvipsPrepare, /process\.platform !== "darwin"/, "macOS libvips preparation must refuse non-macOS hosts");
assert.match(macosLibvipsPrepare, /LIBVIPS_MACOS_AARCH64_SOURCE_DIR/, "macOS libvips preparation must require an Apple Silicon portable source tree");
assert.match(macosLibvipsPrepare, /LIBVIPS_MACOS_X86_64_SOURCE_DIR/, "macOS libvips preparation must require an Intel portable source tree");
assert.match(macosLibvipsPrepare, /otool.*-L/s, "macOS libvips preparation must inspect dynamic library links");
assert.match(macosLibvipsPrepare, /\/opt\/homebrew\//, "macOS libvips preparation must reject Homebrew absolute links");
assert.match(macosLibvipsPrepare, /if \(value\.startsWith\("\/"\)\) return false/, "macOS libvips preparation must reject non-system absolute dynamic links");
assert.match(macosLibvipsPrepare, /lipo.*-verify_arch/s, "macOS libvips preparation must verify the staged architecture");
assert.match(macosLibvipsPrepare, /smokeTestNative/, "macOS libvips preparation must smoke-test the native staged tree");
assert.match(macosLibvipsRuntimeBuild, /spawnSync\("file", \["-b", filePath\]/, "macOS libvips runtime builder must identify Mach-O files with file(1)");
assert.doesNotMatch(macosLibvipsRuntimeBuild, /spawnSync\("otool", \["-hv", filePath\]/, "macOS libvips runtime builder must not classify non-code library files through otool -hv");
assert.match(macosLibvipsInputPrepare, /--aarch64-archive/, "macOS libvips input preparation must accept local Apple Silicon archives");
assert.match(macosLibvipsInputPrepare, /--x86_64-archive/, "macOS libvips input preparation must accept local Intel archives");
assert.match(macosLocalEnginesPrepare, /process\.platform !== "darwin"/, "local macOS engine staging must refuse non-macOS hosts");
assert.match(macosLocalEnginesPrepare, /prepare:ffmpeg-engine:macos/, "local macOS engine staging must prepare real FFmpeg sidecars");
assert.match(macosLocalEnginesPrepare, /prepare:macos-upstream-engines/, "local macOS engine staging must prepare upstream advanced engines");
assert.match(macosLocalEnginesPrepare, /prepare-libvips-macos-release-inputs\.mjs/, "local macOS engine staging must accept local libvips runtime archives");
assert.match(macosLocalEnginesPrepare, /package:macos-engines/, "local macOS engine staging must package macOS engine archives");
assert.match(macosLocalEnginesPrepare, /src-tauri", "engines-manifest\.json"/, "local macOS engine staging must copy the generated manifest for local validation");
assert.match(macosLocalEnginesPrepare, /engine\.mode === "advanced"/, "local macOS engine staging must write only advanced engines into the embedded manifest");
assert.match(macosLocalEnginesPrepare, /Packaged manifest does not contain advanced macos-universal engine entries/, "local macOS engine staging must fail when no advanced macOS engines are present");
assert.match(macosLocalEnginesPrepare, /\.bundled-engine-cache/, "local macOS engine staging must seed the bundled engine cache");
assert.match(macosLocalEnginesPrepare, /Restored src-tauri\/engines-manifest\.json after local macOS validation/, "local macOS engine staging must restore the committed manifest by default");
assert.match(macosLocalEnginesPrepare, /--keep-generated-manifest/, "local macOS engine staging must require an explicit flag to keep the generated manifest");
assert.match(macosLocalEnginesPrepare, /finally/, "local macOS engine staging must restore the manifest even after failed validation steps");
assert.match(macosLocalEnginesPrepare, /Do not commit generated engine manifests or archives/, "local macOS engine staging must warn against committing generated engine output");
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
assert.match(macosChecklist, /## Mac Handoff Readiness/, "macOS checklist must include a clear handoff readiness section");
assert.match(macosChecklist, /the only expected remaining work should be macOS-only work/, "macOS checklist must make the handoff boundary explicit");
assert.match(macosChecklist, /npm run test:macos:conversions/, "macOS handoff must include the strict conversion matrix command");
assert.match(macosChecklist, /npm run verify:macos-dmg/, "macOS handoff must include final DMG verification");
assert.equal(macosEngineConfig.platform, "macos-universal", "macOS engine package config must target macos-universal");
assert.deepEqual(
  macosEngineConfig.engines.map((engine) => engine.engineId),
  ["ffmpeg", "ffprobe", "pdfium", "libreoffice", "pandoc", "libvips"],
  "macOS engine package config must cover every required engine",
);

for (const engine of macosEngineConfig.engines) {
  assert.equal(engine.platform, "macos-universal", `${engine.engineId} must be declared for macos-universal`);
  assert.match(engine.sourceDir, /^engine-sources\/macos-universal\//, `${engine.engineId} must use macOS staged engine sources`);
  for (const relative of engine.binaryPaths) {
    assert.doesNotMatch(relative, /\.(exe|dll)$/i, `${engine.engineId} macOS binary path must not point to Windows files`);
  }
}
assert.deepEqual(
  macosEngineConfig.engines.find((engine) => engine.engineId === "libreoffice").binaryPaths,
  [
    "aarch64/LibreOffice.app/Contents/MacOS/soffice",
    "x86_64/LibreOffice.app/Contents/MacOS/soffice",
  ],
  "LibreOffice macOS packaging must carry both architecture-specific app bundles in the universal engine pack",
);
assert.deepEqual(
  macosEngineConfig.engines.find((engine) => engine.engineId === "libvips").binaryPaths,
  ["aarch64/bin/vips", "x86_64/bin/vips"],
  "libvips macOS packaging must carry both architecture-specific binaries until a portable universal build is validated",
);

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
