# Testing Matrix

This document describes the V1.0.5 test split by platform. Use it to avoid false confidence from Windows-only checks when macOS behavior is involved.

## Windows x64

Windows is the current stable public platform and keeps the full validation gate. Use the grouped command when you want the same Windows validation sequence as the GitHub `Build` workflow:

```powershell
npm run test:windows:ci
```

That command intentionally refuses non-Windows hosts and runs:

```powershell
npm audit --omit=dev
npm run prepare:bundled-engines
npm run check
npm run fmt:rust:check
npm run clippy:rust
npm run audit:rust
npm run validate:engines
npm run test:rust
npm run test:conversions
npm run test:pdfium-wrapper
npm run clippy:pdfium-wrapper
npm run test:production-config
npm run test:secret-leaks
npm run build
npm run tauri:build
```

During a long local run, the wrapper writes progress to `tmp/windows-ci-gate-status.json`. If a terminal session times out while `tauri:build` or NSIS is still running, inspect that file and the running processes before starting another full gate.

Before publishing Windows assets, prepare a clean release folder and run:

```powershell
npm run validate:release-assets -- --version X.Y.Z --dir "$env:LOCALAPPDATA\Temp\mc-release-assets\vX.Y.Z" --platform windows
```

## Dependency Audits

Run package and Rust dependency audits before release:

```powershell
npm audit --omit=dev
npm run audit:rust
```

`npm audit --omit=dev` should finish with no production vulnerabilities.

`npm run audit:rust` currently uses `cargo audit --file src-tauri/Cargo.lock`. This fails on denied vulnerabilities, but Cargo Audit does not fail on warning categories unless `--deny warnings`, `--deny unmaintained`, `--deny unsound` or `--deny yanked` is added. Do not report this as "no RustSec warnings" unless that stricter command also passes.

For V1.0.5, the expected Rust audit state is:

- 0 reported vulnerabilities;
- allowed warnings from transitive Tauri/Linux GTK-related crates and a few unmaintained utility crates;
- follow-up review needed when Tauri, Wry or Linux support dependencies are upgraded.

## Secret Leak Scan

Run this before commits, release notes, release assets or the final Codex Security pass:

```bash
npm run test:secret-leaks
```

The scan checks tracked text files for private key blocks, common service tokens and accidental long secret assignments. It reports only the file, line and pattern name; it does not print the matched secret value.

## Production Config Check

Run this before publishing code or building release assets:

```bash
npm run test:production-config
```

This check keeps frontend environment exposure narrow. In particular, Vite must expose only `VITE_` variables to client code; broad prefixes such as `TAURI_` are not allowed because maintainer machines and CI can carry signing or release secrets in `TAURI_*` variables.

## macOS Code Checks

macOS Rust checks and host validation must run on macOS. Do not treat a failed Windows cross-check as a product failure when it fails before Multi-Converter code on a Darwin-only C/Objective-C dependency.

`npm run test:macos-packaging` is a static contract test and may run on any OS. `npm run test:macos:host` is different: it must run on a real macOS host or a GitHub Actions `macos-latest` runner, and it intentionally fails on Windows and Linux.

When GitHub Actions minutes are unavailable and no real Mac is connected, keep using the static contract checks only:

```bash
npm run test:macos-packaging
npm run test:github-workflows
```

Those checks prove the gates are still strict. They do not prove that macOS conversions work.

The GitHub `Build` workflow runs a `macOS code check` job on `macos-latest` for both:

- `aarch64-apple-darwin`
- `x86_64-apple-darwin`

That job intentionally runs code and contract checks that do not require unreleased local engine binaries:

```bash
npm run validate:embedded-manifest
npm run validate:i18n
npm run typecheck
npm run test:release-notes
npm run test:macos-packaging
npm run test:github-workflows
npm run test:release-assets
npm run test:bundled-engines-platform
npm run test:ui-layout
npm run test:repository-metadata
npm run test:run-tauri
npm run fmt:rust:check
node scripts/prepare-tauri-ci-sidecars.mjs --target <darwin-target>
node scripts/cargo-test-temp.mjs check --manifest-path src-tauri/Cargo.toml --target <darwin-target>
node scripts/cargo-test-temp.mjs clippy --manifest-path src-tauri/Cargo.toml --target <darwin-target> --all-targets -- -D warnings
```

`prepare-tauri-ci-sidecars.mjs` is compile-only CI scaffolding. It creates small placeholder sidecar files and an empty bundled-engine resource directory so the Tauri build script can evaluate `externalBin` and resources during `cargo check`, `cargo clippy` and native unit tests. It must not be used for DMG packaging or conversion validation.

The same workflow also runs a separate `macOS host unit tests` job on `macos-latest`:

```bash
node scripts/prepare-tauri-ci-sidecars.mjs --target host
npm run test:rust
npm run test:pdfium-wrapper:compile
npm run clippy:pdfium-wrapper
```

This job proves the Rust unit tests run on a real macOS runner and that the PDFium wrapper compiles and lints there. It intentionally does not run the PDFium wrapper runtime tests until a macOS PDFium library is staged.

## macOS Conversion Matrix

Do not claim that all macOS conversions work from the `macOS code check` or `macOS host unit tests` jobs. Those jobs are compile/unit gates only.

Full macOS conversion validation is the manual `macOS Conversion Matrix` workflow. It runs on `macos-latest`, refuses CI placeholder sidecars, requires real Apple Silicon and Intel FFmpeg/ffprobe sidecars, requires `macos-universal` manifest entries for PDFium, LibreOffice, Pandoc and libvips, prepares the bundled engines, runs real macOS host validation, runs the PDFium wrapper runtime tests with a macOS PDFium library, and then runs:

```bash
npm run test:macos:conversions
```

That script ultimately runs:

```bash
npm run prepare:bundled-engines
npm run test:macos:host
npm run test:pdfium-wrapper
npm run test:conversions
```

At the current V1.0.5 preparation stage this strict gate is expected to fail until real macOS sidecars and all `macos-universal` advanced engine archives are staged and declared in `src-tauri/engines-manifest.json`. That failure is intentional. It prevents release notes or status updates from saying "all macOS conversions pass" before the real conversion stack exists on macOS.

Use `npm run prepare:ffmpeg-engine:macos` only with maintainer-approved Apple Silicon and Intel archives plus SHA-256 checksums. A source may be one combined archive containing both `ffmpeg` and `ffprobe`, or separate `FFMPEG_MACOS_*` and `FFPROBE_MACOS_*` archives with separate SHA-256 values. Use `npm run prepare:libvips-engine:macos` only with two already-portable libvips runtime trees. These scripts are strict packaging gates; they are not CI placeholders and should fail when the inputs are missing, unpinned or still linked to machine-local package manager paths.

The `macOS libvips Runtime` workflow builds native Homebrew-derived libvips runtime archives on Apple Silicon and Intel runners, rewrites their dynamic links to portable `@rpath` links, smoke-tests the native `vips copy` path, and uploads the two archives as GitHub Actions artifacts. On the persistent `codex/test` branch it is also push-runnable when the workflow or runtime builder changes, so libvips portability can be tested before those workflow files are merged to `main`. Its `arch` input can retry one architecture, but complete macOS validation still requires both archives.

Do not set `output_release_tag` unless a maintainer intentionally wants a public prerelease tag to receive those runtime archives. Prefer passing the successful `macOS libvips Runtime` run ID as `libvips_runtime_run_id` to `macOS Engine Staging`; that keeps the handoff inside GitHub Actions artifacts. When a reviewed test release tag is used instead, pass it as `libvips_release_tag` for the engine staging workflow after reviewing dependency licenses.

When GitHub Actions minutes are unavailable, use a real Mac or self-hosted macOS runner instead. After collecting both libvips runtime archives and both FFmpeg archives/checksums, run local staging on macOS:

```bash
npm run prepare:macos-local-engines -- \
  --libvips-aarch64-archive /path/to/libvips-macos-aarch64.tar.gz \
  --libvips-x86_64-archive /path/to/libvips-macos-x86_64.tar.gz \
  --host-check
```

This command prepares FFmpeg/ffprobe from the configured `FFMPEG_MACOS_*` archive variables, prepares PDFium/LibreOffice/Pandoc from upstream sources, extracts the two local libvips archives, packages `macos-universal` engine ZIPs, temporarily stages an embedded manifest containing only advanced macOS engines for local validation, seeds `engine-sources/.bundled-engine-cache` with every generated macOS archive, runs `npm run prepare:bundled-engines`, then restores the committed `src-tauri/engines-manifest.json` by default. Add `--conversions` only on a real Mac that should run the full conversion matrix. Use `--keep-generated-manifest` only when a maintainer explicitly wants to review and commit the exact advanced engine set; do not commit generated engine archives or bundled engine outputs without approval.

For GitHub Actions validation with staged release inputs, upload real sidecars to the tag passed as `sidecar_release_tag`, and upload `engines-manifest.json` plus the referenced macOS engine ZIPs to the tag passed as `engine_release_tag`. The workflows download those assets with `gh release download`, verify their SHA-256 checksums, write only advanced macOS engines into the embedded manifest, then seed `engine-sources/.bundled-engine-cache` so release assets can be tested without relying on public unauthenticated download URLs.

The `macOS Engine Staging` workflow can produce those staged assets as a GitHub Actions artifact without creating a release. On `codex/test`, it is also push-runnable when the repository variable `MC_ENABLE_MACOS_ENGINE_STAGING` is set to `1`; push runs read the explicit FFmpeg/ffprobe URLs, SHA-256 values and libvips source from `MC_*` repository variables. The manual workflow can still publish to a public test release when `output_release_tag` is intentionally provided. It always requires explicit FFmpeg archive URLs/checksums and either a libvips runtime run ID or a libvips release tag; it does not select FFmpeg sources automatically.

Before building a DMG on macOS, also run:

```bash
npm run test:macos:host
```

That host-only check verifies Xcode Command Line Tools, `lipo`, both Darwin Rust targets, executable permissions, Apple Silicon/Intel/universal FFmpeg and ffprobe sidecar architectures, the universal sidecars' `-version` smoke tests, and bundled-engine validation for `macos-universal`.

`npm run tauri:build:macos` intentionally refuses Windows/Linux hosts before invoking Tauri. A universal DMG must be built on macOS, with staged macOS sidecars and engines.

After building the final DMG on macOS, run:

```bash
npm run verify:macos-dmg -- --version X.Y.Z --dmg path/to/Multi-Converter_X.Y.Z_macos-universal.dmg
```

That DMG verification also runs only on macOS. It mounts the DMG, checks `Multi-Converter.app`, verifies the app version, confirms the app executable and FFmpeg/ffprobe sidecars are universal `arm64 + x86_64` binaries, smoke-tests the bundled sidecars with `-version`, rejects stale Windows-only bundled engine resources, rejects bundled engine metadata that is not `macos-universal`, and runs `codesign --verify --deep --strict`.

## macOS DMG Validation

A macOS release is not ready from code checks alone. The release DMG must be built and tested on macOS using `docs/RELEASE_CHECKLIST_MACOS.md`.

For a local readiness snapshot that does not overclaim macOS support, run:

```bash
npm run status:v1.0.5
```

The command writes `tmp/v1.0.5-status.json`. In the current preparation state, `releaseReady` should remain false because the macOS automation evidence has passed, but the final clean-Mac Gatekeeper/install smoke test has not been recorded yet. When that final proof exists, the same audit can report `releaseReady: true` instead of blocking that state.

Current v1.0.5 macOS automation evidence is recorded in `docs/V1_0_5_VALIDATION.md`. It covers macOS engine staging, the macOS Conversion Matrix, and the verified universal DMG artifact. Do not convert that evidence into a public macOS release claim until the manual clean-Mac smoke test is complete.

The manual GitHub `macOS DMG Build` workflow can build and verify the universal DMG on `macos-latest`. Use it for test-repository validation before copying the verified artifact into a public release.

When the GitHub `Release` workflow is started with `include_macos=true`, it runs a `macOS DMG verification` job on `macos-latest` before the Windows release job republishes the final asset set. If that macOS DMG verification fails, the release publication job does not run.

The minimum manual DMG smoke test is:

- mount the final downloaded DMG;
- drag the app to Applications;
- confirm the unsigned/not-notarized Gatekeeper warning;
- open through `System Settings > Privacy & Security > Open Anyway`;
- launch a second time;
- verify file selection;
- verify at least one FFmpeg audio/video conversion;
- verify document/PDF/image paths only when the matching macOS engines are included.

## PDFium Wrapper Tests

`npm run test:pdfium-wrapper` runs real PDFium runtime tests and must have a native PDFium library available. The wrapper script auto-detects the bundled Windows `pdfium.dll` when it exists. On other platforms, set `MULTI_CONVERTER_TEST_PDFIUM_LIBRARY` to a native `libpdfium` file before using the runtime test.

Use `npm run test:pdfium-wrapper:compile` only when the goal is compile-only validation. Do not present that compile-only check as proof that PDF rendering works on the platform.

## Release Asset Tests

Use `scripts/test-release-assets.mjs` for fixture-based release asset checks. It covers:

- Windows-only release asset shape;
- combined Windows + one macOS universal DMG asset shape;
- Windows updater metadata remaining Windows-only when macOS updater artifacts are not enabled;
- macOS release-note requirements for unsigned/not-notarized builds and disabled macOS automatic updates.

Use `scripts/test-bundled-engines-platform.mjs` to verify that bundled engine validation rejects stale resources from the wrong platform, such as Windows-only advanced engines left in a macOS release build folder.

## UI Smoke Checks

After UI changes, run:

```bash
npm run test:ui-layout
npm run build
```

For visual QA in dev preview, use:

```text
http://127.0.0.1:1420/?mockUpdate=1&mockWelcomeSeen=1
```

This shows the update reminder and feedback launcher together without the welcome dialog, so the floating-corner layout can be inspected directly.
