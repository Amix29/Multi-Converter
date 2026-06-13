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

## Mac Handoff Readiness

Before moving to a real Mac, the non-macOS side should already have passing local contract checks:

```powershell
npm run check
npm run validate:release-assets -- --version X.Y.Z --dir "$env:LOCALAPPDATA\Temp\mc-release-assets\vX.Y.Z" --platform windows
```

At that point, the only expected remaining work should be macOS-only work:

- create or provide real Apple Silicon and Intel FFmpeg/ffprobe inputs, then build/verify the universal sidecars with `lipo`;
- prepare PDFium, LibreOffice, Pandoc and libvips as reviewed `macos-universal` engine archives;
- run `npm run test:macos:host` and `npm run test:macos:conversions` on macOS;
- build `npm run tauri:build:macos`, prepare `Multi-Converter_X.Y.Z_macos-universal.dmg`, and run `npm run verify:macos-dmg`;
- perform the manual clean-Mac smoke test before any public macOS release claim.

If another task remains possible from Windows/Linux, finish it before treating the project as ready for Mac handoff.

## Required Local Inputs

- `src-tauri/binaries/ffmpeg-aarch64-apple-darwin`
- `src-tauri/binaries/ffmpeg-x86_64-apple-darwin`
- `src-tauri/binaries/ffmpeg-universal-apple-darwin`
- `src-tauri/binaries/ffprobe-aarch64-apple-darwin`
- `src-tauri/binaries/ffprobe-x86_64-apple-darwin`
- `src-tauri/binaries/ffprobe-universal-apple-darwin`
- Any advanced macOS engines declared in `src-tauri/engines-manifest.json` for `macos-universal`.

All executable files must keep executable permissions. `npm run prepare:bundled-engines` creates the `*-universal-apple-darwin` sidecars with `lipo` on macOS from the Apple Silicon and Intel inputs. Do not create or edit these inside the generated `.app`.

Current V1.0.5 preparation state: advanced bundled engines are still declared for `windows-x64` only in the committed embedded manifest, while the release workflows stage reviewed `macos-universal` entries for macOS validation. Those staged FFmpeg/ffprobe, PDFium, LibreOffice, Pandoc and libvips assets have passed `macOS Engine Staging`, the two-architecture `macOS Conversion Matrix`, and the universal DMG verification workflow on `codex/test`. Do not treat that as public release approval until the manual clean-Mac smoke test and final security evidence are recorded.

`npm run prepare:macos-upstream-engines` can stage the reviewed upstream macOS candidates for PDFium, LibreOffice and Pandoc on a real Mac. It does not prepare FFmpeg/ffprobe or libvips.

For FFmpeg/ffprobe, set maintainer-approved Apple Silicon and Intel archive inputs plus SHA-256 checksums, then run:

```bash
npm run prepare:ffmpeg-engine:macos
```

Each architecture may use either one combined archive that contains both `ffmpeg` and `ffprobe`, or separate `FFMPEG_MACOS_*` and `FFPROBE_MACOS_*` archive URLs/files with separate checksums. The FFmpeg script intentionally refuses to choose a third-party binary provider automatically. It must create and verify `ffmpeg-universal-apple-darwin` and `ffprobe-universal-apple-darwin` before a DMG build can be considered.

For libvips, prepare two portable runtime trees first, set `LIBVIPS_MACOS_AARCH64_SOURCE_DIR` and `LIBVIPS_MACOS_X86_64_SOURCE_DIR`, then run:

```bash
npm run prepare:libvips-engine:macos
```

The libvips script rejects Homebrew/MacPorts/Fink-style absolute links and any other non-system absolute dynamic dependency. Fix those install names and bundle the dependencies before packaging.

The manual `macOS libvips Runtime` workflow can build those two portable input archives from Homebrew on native macOS runners:

- Apple Silicon runs on `macos-latest`.
- Intel runs on `macos-15-intel`.
- The workflow installs `vips`, copies the runtime, rewrites non-system dynamic links with `install_name_tool`, rejects remaining absolute package-manager links, smoke-tests `vips copy`, then uploads `libvips-macos-aarch64.tar.gz` and `libvips-macos-x86_64.tar.gz`.
- On `codex/test`, pushes that touch the workflow or runtime builder run this workflow only when `MC_ENABLE_MACOS_LIBVIPS_RUNTIME=1` is configured as a repository variable. Leave it disabled for normal docs/status/script work to conserve GitHub Actions minutes.
- Prefer passing the successful workflow run ID as `libvips_runtime_run_id` for `macOS Engine Staging`.
- Use `output_release_tag` only when a maintainer intentionally wants a publicly visible prerelease tag. In that case, use the same tag as the `libvips_release_tag` input for `macOS Engine Staging`.
- Treat the generated notices as staging evidence first. Review copied dependency licenses before a public release.
- The workflow has an `arch` input for targeted retries. A public macOS release still requires successful `aarch64` and `x86_64` runtime archives.

`npm run prepare:bundled-engines` must prune stale `src-tauri/bundled-engines` entries that do not match the current platform before packaging. `npm run validate:bundled-engines`, `npm run test:macos:host` and `npm run verify:macos-dmg` must fail if Windows-only bundled engines would be carried into a macOS build or final DMG.

Before saying "all macOS conversions pass", run the manual GitHub `macOS Conversion Matrix` workflow on both Apple Silicon and Intel, or run `npm run test:macos:conversions` on real Macs for both architectures with the same staged inputs. This strict gate must not use `scripts/prepare-tauri-ci-sidecars.mjs`; it requires real macOS FFmpeg/ffprobe sidecars and `macos-universal` PDFium, LibreOffice, Pandoc and libvips engine archives.

The current staged macOS FFmpeg build does not include the OpenCORE AMR encoder. AMR output must stay hidden on macOS and must be documented as a macOS limitation until a reviewed FFmpeg build with `libopencore_amrnb` passes `macOS Conversion Matrix`.

## Suggested Commands

```bash
npm ci
rustup target add aarch64-apple-darwin x86_64-apple-darwin
npm run prepare:ffmpeg-engine:macos
npm run test:github-workflows
npm run prepare:macos-upstream-engines
npm run prepare:libvips-engine:macos
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

When GitHub Actions minutes are unavailable, prefer the local staging wrapper instead of the manual engine packaging sequence:

```bash
npm run prepare:macos-local-engines -- \
  --libvips-aarch64-archive /path/to/libvips-macos-aarch64.tar.gz \
  --libvips-x86_64-archive /path/to/libvips-macos-x86_64.tar.gz \
  --host-check
```

Add `--conversions` on a real Mac when it is time to prove the full conversion matrix. The wrapper still requires the `FFMPEG_MACOS_*` archive/checksum variables. It stages an embedded manifest containing only advanced `macos-universal` engines while local validation runs, seeds `engine-sources/.bundled-engine-cache` with every generated macOS engine archive, then restores the committed `src-tauri/engines-manifest.json` by default. Use `--keep-generated-manifest` only when a maintainer explicitly wants to review and commit the exact advanced engine set.

## GitHub Actions Conversion Matrix

Use the manual `macOS Conversion Matrix` workflow when the goal is to prove conversion behavior on macOS, not only build readiness.

- Provide `sidecar_release_tag` when the real macOS FFmpeg/ffprobe sidecars live on a test release.
- Provide `engine_release_tag` when the macOS `engines-manifest.json` and engine ZIP archives live on a test release.
- Prefer `engine_staging_run_id` from a successful `macOS Engine Staging` run when testing from `codex/test`. This downloads the private workflow artifact and avoids publishing temporary engine assets as a GitHub prerelease.
- On `codex/test`, push runs require `MC_ENABLE_MACOS_CONVERSIONS=1` and read the staging artifact run from `MC_MACOS_ENGINE_STAGING_RUN_ID`.
- Do not combine `engine_staging_run_id` with `sidecar_release_tag` or `engine_release_tag` in the same run.
- The workflow runs `npm run test:macos:conversions` on Apple Silicon (`macos-latest`) and Intel (`macos-15-intel`).
- The workflow must fail if any required `macos-universal` advanced engine entry is missing from `src-tauri/engines-manifest.json`, or if any referenced archive cannot download, validate or run.
- Passing `macOS Conversion Matrix` jobs for both Apple Silicon and Intel are required before release notes or status updates can say that all macOS conversions were tested.

## GitHub Actions Engine Staging

Use the `macOS Engine Staging` workflow to create the test assets consumed by the conversion and DMG workflows.

- Provide maintainer-approved FFmpeg/ffprobe Apple Silicon and Intel archive URLs plus SHA-256 checksums. If `ffmpeg` and `ffprobe` are published as separate archives, provide the optional `ffprobe_*` URL/checksum inputs too.
- The workflow downloads the official FFmpeg `n8.1.1` license texts from the source tag, verifies their SHA-256 checksums and passes the generated temporary license bundle to `npm run prepare:ffmpeg-engine:macos`.
- Provide either `libvips_runtime_run_id` from a successful `macOS libvips Runtime` run, or a `libvips_release_tag` that contains portable Apple Silicon and Intel libvips runtime archives. Those archives must contain a `bin/vips` runtime root and bundled non-system dependencies.
- The workflow prepares FFmpeg/ffprobe, PDFium, LibreOffice, Pandoc and libvips on `macos-latest`, packages `tools/engine-packages.macos.config.json`, uploads a `macos-engine-assets` workflow artifact, and optionally uploads the same assets to `output_release_tag`.
- macOS `.app` bundles may contain internal symbolic links, especially inside frameworks. Packaging must preserve relative links and may normalize absolute links found inside `.framework` or `.app` directories to same-bundle relative links when the normalized target remains inside the same engine source tree. Same-directory `.dylib` aliases may also be normalized from absolute package-manager paths to local relative links when the target file exists in that directory. It may omit broken framework `Headers` or `PrivateHeaders` links, and it may preserve other same-tree framework symlinks for the framework layout to resolve after extraction, but it must still reject other absolute links, broken non-framework links and links that escape the engine source tree.
- On `codex/test`, the workflow is push-runnable when `MC_ENABLE_MACOS_ENGINE_STAGING=1` is configured as a repository variable. Push runs read the FFmpeg/ffprobe URLs, checksums and libvips input from the `MC_*` repository variables, so staging can be validated before this workflow exists on `main`.
- On the public main repository, any `output_release_tag` creates publicly visible prerelease assets. Leave it empty unless a maintainer intentionally wants that public test tag.
- If `output_release_tag` is set, use that same tag as both `sidecar_release_tag` and `engine_release_tag` for `macOS Conversion Matrix` and `macOS DMG Build`.

## GitHub Actions DMG Build

Use the manual `macOS DMG Build` workflow when a Mac runner should build and verify the DMG.

- If the repository already contains staged macOS sidecars, run the workflow with the default empty `sidecar_release_tag`.
- If sidecars are stored on a test release, set `sidecar_release_tag` to the release tag that contains `ffmpeg-aarch64-apple-darwin`, `ffmpeg-x86_64-apple-darwin`, `ffprobe-aarch64-apple-darwin` and `ffprobe-x86_64-apple-darwin`.
- If macOS engine archives are stored on a test release, set `engine_release_tag` to the release tag that contains `engines-manifest.json` plus every ZIP referenced by that manifest. The workflow downloads and verifies every referenced macOS ZIP, but writes only advanced engines into `src-tauri/engines-manifest.json`; FFmpeg and ffprobe stay Tauri sidecars.
- Prefer `engine_staging_run_id` from a successful `macOS Engine Staging` run for private `codex/test` DMG validation. The workflow will download the staged sidecars, engine manifest and engine archives from the `macos-engine-assets` workflow artifact.
- On `codex/test`, push runs require `MC_ENABLE_MACOS_DMG=1` and read the staging artifact run from `MC_MACOS_ENGINE_STAGING_RUN_ID`.
- Do not combine `engine_staging_run_id` with release-tag inputs in the same run.
- The workflow prepares `macos-universal` engines, runs `npm run test:macos:host`, builds `npm run tauri:build:macos` on Apple Silicon, renames the output to `Multi-Converter_X.Y.Z_macos-universal.dmg`, verifies it with `npm run verify:macos-dmg`, uploads the verified DMG as a workflow artifact, then downloads and verifies that same DMG on Intel.
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
- The workflow downloads that pre-uploaded DMG, verifies it on Apple Silicon and Intel macOS runners, copies it into a clean release folder, validates `--platform all`, then republishes the exact final asset list.
- Before allocating release runners, the workflow validates the GitHub release notes with `scripts/validate-release-notes.mjs`, the same shared rules used by release asset validation. Before allocating a macOS runner, it also runs `npm run status:v1.0.5 -- --require-ready` and validates the macOS-specific wording; it must fail until the clean-Mac smoke-test receipt, final security approval, final README macOS availability row and required public macOS installation notes are recorded.
- If either macOS DMG verification job fails, the publication job must not run.
- Do not use `include_macos=true` for a DMG that has not passed the manual smoke test below.

## Manual DMG Smoke Test

- Mount the final downloaded DMG.
- Drag Multi-Converter to Applications.
- Launch once and confirm the expected unsigned/not-notarized Gatekeeper warning.
- Open through `System Settings > Privacy & Security > Open Anyway`, then confirm `Open`.
- Quit and launch a second time; the same downloaded app copy should open normally.
- Verify file selection and at least one audio/video conversion using FFmpeg.
- Verify document/PDF/image advanced conversions only if their macOS engines are included and validated.

After the test passes, record the result in `docs/V1_0_5_VALIDATION.md` under `## Manual Clean-Mac Smoke Test Receipt`. Do not change `Manual clean-Mac smoke testing` to `success` unless every required smoke-test line is `yes` for the final downloaded DMG:

- `Architecture tested` must name Apple Silicon or Intel
- `DMG source` must identify the final downloaded GitHub release DMG
- `Mounted final downloaded DMG`
- `Dragged app to Applications`
- `Unsigned/not-notarized first launch warning verified`
- `Opened through System Settings > Privacy & Security > Open Anyway`
- `Confirmed Open prompt`
- `Second launch verified`
- `File selection verified`
- `FFmpeg media conversion verified`
- `Document/PDF/image advanced conversion verified`
- `Updater metadata behavior checked`

`npm run status:v1.0.5` keeps the release blocked if this receipt is missing, still marked `pending`, or incomplete.

## Release Notes Requirement

In `## Download And Installation`, name `Multi-Converter_X.Y.Z_macos-universal.dmg` exactly.

If the build is not Apple-signed and not notarized, say that plainly and include:

> After the first launch warning, open `System Settings > Privacy & Security`, choose `Open Anyway`, then confirm `Open`.

Also state that automatic updates for macOS are not enabled in this first DMG workflow if `latest.json` still contains only Windows updater platforms.

In `## Validation`, mention that the macOS DMG was verified on Apple Silicon and Intel, either manually or through the `macOS DMG verification` workflow jobs.

Do not claim that all macOS conversions pass unless the same release also passed `npm run test:macos:conversions` on both Apple Silicon and Intel, or the manual `macOS Conversion Matrix` workflow with the final staged sidecars and engine archives. If release notes make that full-coverage claim, they must mention the `macOS Conversion Matrix`, Apple Silicon and Intel.

Do not ask users to disable Gatekeeper globally. Do not present `xattr -dr com.apple.quarantine` as the normal install path.
