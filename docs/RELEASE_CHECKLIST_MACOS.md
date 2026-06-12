# macOS Universal DMG Release Checklist

This checklist is for the planned macOS v1.0.5 work. A macOS release is not ready until these checks pass on a real Mac.

## Required Build Shape

- Build on macOS, not Windows.
- Produce one user-facing DMG only: `Multi-Converter_X.Y.Z_macos-universal.dmg`.
- Build the Tauri target as `universal-apple-darwin`.
- Use `src-tauri/tauri.macos.conf.json`.
- `npm run tauri:build:macos` intentionally refuses Windows/Linux hosts. Treat that refusal as a guardrail, not a product failure.
- Use ad-hoc signing (`signingIdentity: "-"`) unless Apple Developer ID signing and notarization credentials are intentionally added.
- macOS updater artifacts are disabled for this initial DMG workflow. Do not add Darwin entries to `latest.json` until macOS updater artifacts are generated and tested end to end.
- Do not hand-edit the generated `.app`; change source/config/staged engines and rebuild.

## Required Local Inputs

- `src-tauri/binaries/ffmpeg-aarch64-apple-darwin`
- `src-tauri/binaries/ffmpeg-x86_64-apple-darwin`
- `src-tauri/binaries/ffmpeg-universal-apple-darwin`
- `src-tauri/binaries/ffprobe-aarch64-apple-darwin`
- `src-tauri/binaries/ffprobe-x86_64-apple-darwin`
- `src-tauri/binaries/ffprobe-universal-apple-darwin`
- Any advanced macOS engines declared in `src-tauri/engines-manifest.json` for `macos-universal`.

All executable files must keep executable permissions. `npm run prepare:bundled-engines` creates the `*-universal-apple-darwin` sidecars with `lipo` on macOS from the Apple Silicon and Intel inputs. Do not create or edit these inside the generated `.app`.

Current V1.0.5 preparation state: advanced bundled engines are still declared for `windows-x64` only. Do not claim PDFium, LibreOffice, Pandoc or libvips support on macOS until reviewed `macos-universal` manifest entries and engine archives exist and pass validation.

`npm run prepare:macos-upstream-engines` can stage the reviewed upstream macOS candidates for PDFium, LibreOffice and Pandoc on a real Mac. It does not prepare FFmpeg/ffprobe or libvips. Those inputs still need maintainer-approved portable sources before the strict conversion matrix can pass.

`npm run prepare:bundled-engines` must prune stale `src-tauri/bundled-engines` entries that do not match the current platform before packaging. `npm run validate:bundled-engines`, `npm run test:macos:host` and `npm run verify:macos-dmg` must fail if Windows-only bundled engines would be carried into a macOS build or final DMG.

Before saying "all macOS conversions pass", run the manual GitHub `macOS Conversion Matrix` workflow or run `npm run test:macos:conversions` on a real Mac with the same staged inputs. This strict gate must not use `scripts/prepare-tauri-ci-sidecars.mjs`; it requires real macOS FFmpeg/ffprobe sidecars and `macos-universal` PDFium, LibreOffice, Pandoc and libvips engine archives.

## Suggested Commands

```bash
npm ci
rustup target add aarch64-apple-darwin x86_64-apple-darwin
npm run test:github-workflows
npm run prepare:macos-upstream-engines
npm run prepare:bundled-engines
npm run validate:bundled-engines
npm run test:macos:host
npm run check
npm run fmt:rust:check
npm run clippy:rust
node scripts/cargo-test-temp.mjs clippy --manifest-path src-tauri/Cargo.toml --target aarch64-apple-darwin --all-targets -- -D warnings
node scripts/cargo-test-temp.mjs clippy --manifest-path src-tauri/Cargo.toml --target x86_64-apple-darwin --all-targets -- -D warnings
npm run test:rust
npm run test:pdfium-wrapper:compile
npm run test:macos:conversions
npm run build
npm run tauri:build:macos
npm run verify:macos-dmg -- --version X.Y.Z --dmg path/to/Multi-Converter_X.Y.Z_macos-universal.dmg
```

## GitHub Actions Conversion Matrix

Use the manual `macOS Conversion Matrix` workflow when the goal is to prove conversion behavior on macOS, not only build readiness.

- Provide `sidecar_release_tag` when the real macOS FFmpeg/ffprobe sidecars live on a test release.
- The workflow runs `npm run test:macos:conversions` on `macos-latest`.
- The workflow is expected to fail until all required `macos-universal` advanced engine entries exist in `src-tauri/engines-manifest.json` and their archives download, validate and run.
- A passing `macOS Conversion Matrix` run is required before release notes or status updates can say that all macOS conversions were tested.

## GitHub Actions DMG Build

Use the manual `macOS DMG Build` workflow when a Mac runner should build and verify the DMG.

- If the repository already contains staged macOS sidecars, run the workflow with the default empty `sidecar_release_tag`.
- If sidecars are stored on a private test release, set `sidecar_release_tag` to the release tag that contains `ffmpeg-aarch64-apple-darwin`, `ffmpeg-x86_64-apple-darwin`, `ffprobe-aarch64-apple-darwin` and `ffprobe-x86_64-apple-darwin`.
- The workflow prepares `macos-universal` engines, runs `npm run test:macos:host`, builds `npm run tauri:build:macos`, renames the output to `Multi-Converter_X.Y.Z_macos-universal.dmg`, verifies it with `npm run verify:macos-dmg`, then uploads the verified DMG as a workflow artifact.
- A failed workflow is not a release blocker by itself until the failure is reviewed. Common expected failures are missing staged sidecars, missing executable bits or a DMG that still contains Windows-only bundled engines.

`npm run verify:macos-dmg` mounts the final DMG and inspects the app bundle. It must reject a DMG that contains Windows-only engine files such as `.exe` or `.dll`, missing engine metadata, or `engine.json` entries whose platform is not `macos-universal`.

If a combined Windows+macOS release folder is prepared, validate it with:

```bash
npm run validate:release-assets -- --version X.Y.Z --dir "$TMPDIR/mc-release-assets/vX.Y.Z" --platform all
```

## GitHub Release Handoff

- Create or edit the GitHub release body in English before running the release workflow.
- Upload the verified DMG asset to that release first: `Multi-Converter_X.Y.Z_macos-universal.dmg`.
- Run the `Release` workflow manually with `include_macos=true`.
- The workflow downloads that pre-uploaded DMG, verifies it on `macos-latest`, copies it into a clean release folder, validates `--platform all`, then republishes the exact final asset list.
- If the macOS DMG verification job fails, the publication job must not run.
- Do not use `include_macos=true` for a DMG that has not passed the manual smoke test below.

## Manual DMG Smoke Test

- Mount the final downloaded DMG.
- Drag Multi-Converter to Applications.
- Launch once and confirm the expected unsigned/not-notarized Gatekeeper warning.
- Open through `System Settings > Privacy & Security > Open Anyway`, then confirm `Open`.
- Quit and launch a second time; the same downloaded app copy should open normally.
- Verify file selection and at least one audio/video conversion using FFmpeg.
- Verify document/PDF/image advanced conversions only if their macOS engines are included and validated.

## Release Notes Requirement

In `## Download And Installation`, name `Multi-Converter_X.Y.Z_macos-universal.dmg` exactly.

If the build is not Apple-signed and not notarized, say that plainly and include:

> After the first launch warning, open `System Settings > Privacy & Security`, choose `Open Anyway`, then confirm `Open`.

Also state that automatic updates for macOS are not enabled in this first DMG workflow if `latest.json` still contains only Windows updater platforms.

In `## Validation`, mention that the macOS DMG was verified on macOS, either manually or through the `macOS DMG verification` workflow job.

Do not ask users to disable Gatekeeper globally. Do not present `xattr -dr com.apple.quarantine` as the normal install path.
