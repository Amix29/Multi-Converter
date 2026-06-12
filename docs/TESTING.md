# Testing Matrix

This document describes the V1.0.5 test split by platform. Use it to avoid false confidence from Windows-only checks when macOS behavior is involved.

## Windows x64

Windows is the current stable public platform and keeps the full validation gate:

```powershell
npm run check
npm run fmt:rust:check
npm run clippy:rust
npm run test:rust
npm run test:conversions
npm run test:pdfium-wrapper
npm run clippy:pdfium-wrapper
npm run build
npm run tauri:build
```

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

## macOS Code Checks

macOS Rust checks and host validation must run on macOS. Do not treat a failed Windows cross-check as a product failure when it fails before Multi-Converter code on a Darwin-only C/Objective-C dependency.

`npm run test:macos-packaging` is a static contract test and may run on any OS. `npm run test:macos:host` is different: it must run on a real macOS host or a GitHub Actions `macos-latest` runner, and it intentionally fails on Windows and Linux.

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
node scripts/cargo-test-temp.mjs check --manifest-path src-tauri/Cargo.toml --target <darwin-target>
node scripts/cargo-test-temp.mjs clippy --manifest-path src-tauri/Cargo.toml --target <darwin-target> --all-targets -- -D warnings
```

The same workflow also runs a separate `macOS host unit tests` job on `macos-latest`:

```bash
npm run test:rust
npm run test:pdfium-wrapper:compile
npm run clippy:pdfium-wrapper
```

This job proves the Rust unit tests run on a real macOS runner and that the PDFium wrapper compiles and lints there. It intentionally does not run the PDFium wrapper runtime tests until a macOS PDFium library is staged.

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
