import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const buildWorkflow = fs.readFileSync(path.join(root, ".github", "workflows", "build.yml"), "utf8");
const releaseWorkflow = fs.readFileSync(path.join(root, ".github", "workflows", "release.yml"), "utf8");
const macosDmgWorkflow = fs.readFileSync(path.join(root, ".github", "workflows", "macos-dmg.yml"), "utf8");
const macosConversionsWorkflow = fs.readFileSync(path.join(root, ".github", "workflows", "macos-conversions.yml"), "utf8");
const macosEngineReleaseScript = fs.readFileSync(path.join(root, "scripts", "prepare-macos-engine-release-assets.mjs"), "utf8");
const windowsBuildJob = workflowJob(buildWorkflow, "quality-gate");
const macosBuildJob = workflowJob(buildWorkflow, "macos-code-check");
const macosHostTestsJob = workflowJob(buildWorkflow, "macos-host-tests");
const macosDmgBuildJob = workflowJob(macosDmgWorkflow, "build");
const macosConversionsJob = workflowJob(macosConversionsWorkflow, "macos-conversions");

assert.match(buildWorkflow, /quality-gate:\s*\n\s+name:\s+Windows x64 quality gate/, "build workflow must keep the Windows job clearly named");
assert.match(windowsBuildJob, /timeout-minutes:\s+120/, "Windows quality gate must allow enough time for conversion tests and the full Tauri build");
assert.match(windowsBuildJob, /id:\s+cargo-audit-cache/, "Windows CI must cache the cargo-audit binary");
assert.match(windowsBuildJob, /~\/\.cargo\/bin\/cargo-audit\.exe/, "Windows CI cargo-audit cache must target the installed binary");
assert.match(windowsBuildJob, /cargo install cargo-audit --locked\s*\n\s+if:\s+steps\.cargo-audit-cache\.outputs\.cache-hit != 'true'/, "Windows CI must skip cargo-audit installation on cache hits");
assert.match(windowsBuildJob, /npm run test:pdfium-wrapper/, "Windows CI must run the PDFium wrapper runtime tests with a native PDFium DLL");
assert.match(buildWorkflow, /macos-code-check:/, "build workflow must include a macOS code-check job");
assert.match(macosBuildJob, /runs-on:\s+macos-latest/, "macOS CI must run on macOS");
assert.match(macosBuildJob, /aarch64-apple-darwin/, "macOS CI must check Apple Silicon target compilation");
assert.match(macosBuildJob, /x86_64-apple-darwin/, "macOS CI must check Intel target compilation");
assert.match(macosBuildJob, /components:\s+rustfmt, clippy/, "macOS CI must install Rust formatting and Clippy components explicitly");
assert.match(macosBuildJob, /npm run validate:embedded-manifest/, "macOS CI must validate the embedded engine manifest");
assert.match(macosBuildJob, /npm run validate:i18n/, "macOS CI must validate translations");
assert.match(macosBuildJob, /npm run test:macos-packaging/, "macOS CI must run the macOS packaging contract test");
assert.match(macosBuildJob, /npm run test:bundled-engines-platform/, "macOS CI must run bundled-engine platform contract tests");
assert.match(macosBuildJob, /npm run test:repository-metadata/, "macOS CI must run repository metadata checks");
assert.match(macosBuildJob, /npm run test:run-tauri/, "macOS CI must run Tauri wrapper safety checks");
assert.match(macosBuildJob, /npm run fmt:rust:check/, "macOS CI must run Rust formatting checks");
assert.match(macosBuildJob, /node scripts\/prepare-tauri-ci-sidecars\.mjs --target \$\{\{ matrix\.rust-target \}\}/, "macOS CI must stage compile-only Tauri sidecar placeholders for target checks");
assert.match(macosBuildJob, /node scripts\/cargo-test-temp\.mjs check --manifest-path src-tauri\/Cargo\.toml --target \$\{\{ matrix\.rust-target \}\}/, "macOS CI must cargo-check each target");
assert.match(macosBuildJob, /node scripts\/cargo-test-temp\.mjs clippy --manifest-path src-tauri\/Cargo\.toml --target \$\{\{ matrix\.rust-target \}\} --all-targets -- -D warnings/, "macOS CI must run Clippy for each target");
assert.doesNotMatch(macosBuildJob, /npm run test:macos:host/, "macOS code checks must not pretend to run host-only sidecar validation before macOS sidecars are staged");

assert.match(buildWorkflow, /macos-host-tests:/, "build workflow must include a macOS host unit-test job");
assert.match(macosHostTestsJob, /runs-on:\s+macos-latest/, "macOS host tests must run on macOS");
assert.match(macosHostTestsJob, /node scripts\/prepare-tauri-ci-sidecars\.mjs --target host/, "macOS host tests must stage compile-only Tauri sidecar placeholders");
assert.match(macosHostTestsJob, /npm run test:rust/, "macOS host tests must run native Rust unit tests");
assert.match(macosHostTestsJob, /npm run test:pdfium-wrapper:compile/, "macOS host tests must compile PDFium wrapper tests without pretending runtime PDFium is staged");
assert.doesNotMatch(macosHostTestsJob, /npm run test:pdfium-wrapper\s*$/m, "macOS host tests must not run PDFium runtime tests until a macOS PDFium library is staged");
assert.match(macosHostTestsJob, /npm run clippy:pdfium-wrapper/, "macOS host tests must lint the PDFium wrapper");
assert.doesNotMatch(macosHostTestsJob, /npm run test:macos:host/, "macOS host unit tests must not claim full staged-sidecar validation");

assert.match(releaseWorkflow, /include_macos:/, "release workflow must expose the manual include_macos switch");
assert.match(releaseWorkflow, /macos-dmg-verify:/, "release workflow must include a macOS DMG verification job");
assert.match(releaseWorkflow, /runs-on:\s+macos-latest/, "macOS DMG verification must run on a macOS runner");
assert.match(releaseWorkflow, /npm run verify:macos-dmg -- --version "\$\{\{ steps\.version\.outputs\.version \}\}" --dmg "\$MACOS_DMG_PATH"/, "release workflow must verify the downloaded DMG on macOS");
assert.match(releaseWorkflow, /needs:\s+macos-dmg-verify/, "Windows release publication must wait for macOS DMG verification when enabled");
assert.match(releaseWorkflow, /needs\.macos-dmg-verify\.result == 'success' \|\| needs\.macos-dmg-verify\.result == 'skipped'/, "Windows release job must not run after a failed macOS DMG verification");
assert.match(releaseWorkflow, /id:\s+cargo-audit-cache/, "release workflow must cache the cargo-audit binary");
assert.match(releaseWorkflow, /cargo install cargo-audit --locked\s*\n\s+if:\s+steps\.cargo-audit-cache\.outputs\.cache-hit != 'true'/, "release workflow must skip cargo-audit installation on cache hits");
assert.match(releaseWorkflow, /INCLUDE_MACOS:/, "release workflow must pass the include_macos switch to release steps");
assert.match(releaseWorkflow, /gh release download \$tag --repo \$env:GITHUB_REPOSITORY --pattern \$macosDmgName --dir \$macosDmgDir/, "release workflow must download the pre-uploaded macOS DMG for validation");
assert.match(releaseWorkflow, /--macos-dmg \$macosDmgPath/, "release workflow must prepare clean assets from the downloaded macOS DMG");
assert.match(releaseWorkflow, /--platform \$platform/, "release workflow must validate the selected release platform set");
assert.match(releaseWorkflow, /\$expectedAssets \+= "Multi-Converter_\$\{version\}_macos-universal\.dmg"/, "release workflow must preserve exactly one macOS universal DMG when enabled");
assert.match(releaseWorkflow, /not\\s\+Apple-signed/, "release workflow must validate unsigned macOS release wording");
assert.match(releaseWorkflow, /macOS\\s\+automatic\\s\+updates\\s\+are\\s\+not\\s\+enabled/, "release workflow must validate macOS updater limitation wording");
assert.match(releaseWorkflow, /macOS\\s\+DMG\\s\+verification/, "release workflow must validate macOS DMG verification wording");
assert.match(releaseWorkflow, /this workflow run was not started with include_macos=true/, "release workflow must reject accidental macOS notes in Windows-only runs");

assert.match(macosDmgWorkflow, /name:\s+macOS DMG Build/, "macOS DMG workflow must be clearly named");
assert.match(macosDmgWorkflow, /workflow_dispatch:/, "macOS DMG workflow must be manually runnable");
assert.match(macosDmgWorkflow, /sidecar_release_tag:/, "macOS DMG workflow must allow staged sidecars from a release tag");
assert.match(macosDmgWorkflow, /engine_release_tag:/, "macOS DMG workflow must allow staged engine archives from a release tag");
assert.match(macosDmgBuildJob, /runs-on:\s+macos-latest/, "macOS DMG build must run on macOS");
assert.match(macosDmgBuildJob, /MULTI_CONVERTER_ENGINE_PLATFORM:\s+macos-universal/, "macOS DMG build must prepare macos-universal engines");
assert.doesNotMatch(macosDmgBuildJob, /CARGO_TARGET_DIR:\s+\$\{\{\s*runner\.temp/, "macOS DMG job env must not use runner context before it is available");
assert.match(macosDmgBuildJob, /CARGO_TARGET_DIR=\$RUNNER_TEMP\/mc-cargo-target-macos-dmg/, "macOS DMG build must configure Cargo target dir through GITHUB_ENV");
assert.match(macosDmgBuildJob, /targets:\s+aarch64-apple-darwin,x86_64-apple-darwin/, "macOS DMG build must install both Darwin Rust targets");
assert.match(macosDmgBuildJob, /Download staged macOS engine archives from a release/, "macOS DMG build must support staged macOS engine release assets");
assert.match(macosDmgBuildJob, /prepare-macos-engine-release-assets\.mjs/, "macOS DMG build must use the staged engine release helper");
assert.match(macosDmgBuildJob, /npm run prepare:bundled-engines/, "macOS DMG build must prepare staged sidecars and engines");
assert.doesNotMatch(macosDmgBuildJob, /prepare-tauri-ci-sidecars/, "macOS DMG build must use real staged sidecars, not CI placeholders");
assert.match(macosDmgBuildJob, /npm run test:macos:host/, "macOS DMG build must verify staged sidecars before packaging");
assert.match(macosDmgBuildJob, /npm run tauri:build:macos/, "macOS DMG build must produce the universal DMG");
assert.match(macosDmgBuildJob, /npm run prepare:macos-dmg-artifact/, "macOS DMG build must normalize the DMG release asset name");
assert.match(macosDmgBuildJob, /npm run verify:macos-dmg/, "macOS DMG build must verify the final DMG on macOS");
assert.match(macosDmgBuildJob, /actions\/upload-artifact@v4/, "macOS DMG build must upload the verified DMG artifact");

assert.match(macosConversionsWorkflow, /name:\s+macOS Conversion Matrix/, "macOS conversion workflow must be clearly named");
assert.match(macosConversionsWorkflow, /workflow_dispatch:/, "macOS conversion workflow must be manually runnable");
assert.match(macosConversionsWorkflow, /sidecar_release_tag:/, "macOS conversion workflow must allow staged real sidecars from a release tag");
assert.match(macosConversionsWorkflow, /engine_release_tag:/, "macOS conversion workflow must allow staged engine archives from a release tag");
assert.match(macosConversionsJob, /runs-on:\s+macos-latest/, "macOS conversion matrix must run on a macOS runner");
assert.match(macosConversionsJob, /timeout-minutes:\s+180/, "macOS conversion matrix must allow enough time for real engine downloads and conversions");
assert.match(macosConversionsJob, /MULTI_CONVERTER_ENGINE_PLATFORM:\s+macos-universal/, "macOS conversion matrix must validate macos-universal engines");
assert.doesNotMatch(macosConversionsJob, /prepare-tauri-ci-sidecars/, "macOS conversion matrix must never use compile-only placeholder sidecars");
assert.match(macosConversionsJob, /targets:\s+aarch64-apple-darwin,x86_64-apple-darwin/, "macOS conversion matrix must install both Darwin Rust targets");
assert.match(macosConversionsJob, /Download staged macOS engine archives from a release/, "macOS conversion matrix must support staged macOS engine release assets");
assert.match(macosConversionsJob, /prepare-macos-engine-release-assets\.mjs/, "macOS conversion matrix must use the staged engine release helper");
assert.match(macosConversionsJob, /npm run test:macos:conversions/, "macOS conversion matrix must run the strict real conversion gate");

assert.equal(packageJson.scripts["prepare:macos-engine-release-assets"], "node scripts/prepare-macos-engine-release-assets.mjs", "macOS staged engine release helper must be exposed through npm");
assert.match(macosEngineReleaseScript, /gh.*release.*download/s, "macOS staged engine helper must download private release assets through gh");
assert.match(macosEngineReleaseScript, /engines-manifest\.json/, "macOS staged engine helper must download the staged engine manifest");
assert.match(macosEngineReleaseScript, /engine-sources", "\.bundled-engine-cache"/, "macOS staged engine helper must seed the bundled-engine cache");
assert.match(macosEngineReleaseScript, /verifySha256/, "macOS staged engine helper must verify downloaded engine checksums");

console.log("GitHub workflow contract tests passed.");

function workflowJob(workflow, jobName) {
  const match = workflow.match(new RegExp(`^  ${jobName}:\\r?\\n([\\s\\S]*?)(?=^  [A-Za-z0-9_-]+:\\r?\\n|(?![\\s\\S]))`, "m"));
  assert.ok(match, `workflow job is missing: ${jobName}`);
  return match[0];
}
