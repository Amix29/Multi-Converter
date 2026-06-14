# Multi-Converter v1.0.5 Validation Evidence

This file records validation evidence for the in-progress v1.0.5 release. It is not a public release approval by itself.

## macOS Automated Evidence

- macOS libvips Runtime: run `27459737669`, success. Produced `libvips-macos-aarch64` and `libvips-macos-x86_64` artifacts.
- macOS Engine Staging: run `27470308504`, success. Produced the corrected `macos-engine-assets` artifact with FFmpeg, ffprobe, PDFium, LibreOffice, Pandoc and libvips staged for `macos-universal`.
- macOS Conversion Matrix (single macOS runner): run `27464257789`, success. This was the first strict macOS conversion baseline with the staged engine set before the workflow was hardened into a two-architecture Apple Silicon + Intel matrix.
- macOS Conversion Matrix (Apple Silicon): run `27470863548`, success. The `Real macOS conversion matrix (Apple Silicon)` job passed strict macOS conversion validation with the final staged sidecars and engine archives.
- macOS Conversion Matrix (Intel): run `27470863548`, success. The `Real macOS conversion matrix (Intel)` job passed strict macOS conversion validation with the final staged sidecars and engine archives.
- macOS DMG Build (Apple Silicon): run `27471124370`, success. Built, mounted and verified `Multi-Converter_1.0.5_macos-universal.dmg` on Apple Silicon, then uploaded the release-named artifact.
- macOS DMG Verification (Intel): run `27471124370`, success. Downloaded the same `Multi-Converter_1.0.5_macos-universal.dmg` workflow artifact and verified it on Intel.

## Linux Automated Evidence

Record these lines only after the real Linux workflow runs with real Linux sidecars and release-named artifacts.

- Linux x64 Code Check: run `27498691393`, success. GitHub Actions Ubuntu 22.04 passed `npm run test:linux:ci` with Linux Tauri system dependencies, Linux packaging contracts, compile-only sidecar staging and Rust `check`/`clippy` for `x86_64-unknown-linux-gnu`. This is CI code validation only; it is not AppImage, real sidecar or full conversion evidence.
- Linux Sidecar Staging: run `27499910083`, success. GitHub Actions Ubuntu 22.04 staged real Linux x64 `ffmpeg-x86_64-unknown-linux-gnu`, `ffmpeg-x86_64-unknown-linux-gnu.sha256`, `ffprobe-x86_64-unknown-linux-gnu` and `ffprobe-x86_64-unknown-linux-gnu.sha256` from the reviewed BtbN FFmpeg `n8.1.1` Linux x64 archive `ffmpeg-n8.1.1-13-g83e8541aa6-linux64-gpl-8.1.tar.xz` with source SHA-256 `6e776e69d415f7c021af65cbb42cd423804ca653fc8190a32d5878411be6cbfd`. Downloaded artifact checks confirmed matching generated SHA-256 files and x86_64 ELF headers for both sidecars (`ffmpeg` SHA-256 `8f80c016b81c7c871a86986575c9143156563edd53e3b2765dcc47b609f602f7`, `ffprobe` SHA-256 `57b72cc5f09d8b7a210da5fd359f47433350b3bac2f7a35c535ddb92dc7c6667`).
- Linux Engine Staging: run `27501141759`, success. GitHub Actions Ubuntu 22.04 prepared and revalidated the full advanced Linux x64 engine set from pinned inputs, then uploaded the `linux-engine-assets` artifact containing `engines-manifest.json`, `pdfium-compatible-linux-x64.zip`, `libreoffice-compatible-linux-x64.zip`, `pandoc-compatible-linux-x64.zip` and `libvips-compatible-linux-x64.zip`. Inputs were upstream PDFium SHA-256 `1470e21b8b4a3b4ad7f85684e2da11d94f3b69a86d81dee11b9b6709d927ac1d`, LibreOffice Linux x86-64 deb archive SHA-256 `18838cb9d028b664a9d0e966cd4c8ca47ca3ea363c393b41d1b5124740b121a5`, Pandoc Linux amd64 SHA-256 `e0f8af62d0f267d22baa5bcefe6d5dda3a097ccc60de794b759fe03159923244` and Ubuntu libvips runtime preparation.
- Linux AppImage Build: run `27505795092`, success. GitHub Actions Ubuntu 22.04 built and signed `Multi-Converter_1.0.5_linux-x64.AppImage` from staged real Linux FFmpeg/ffprobe sidecars and the verified advanced Linux engine artifact set. The workflow uploaded `linux-release-artifacts` artifact `7623271665` containing exactly `Multi-Converter_1.0.5_linux-x64.AppImage`, `Multi-Converter_linux-x64.AppImage`, `Multi-Converter_1.0.5_linux-x64.AppImage.sig` and `Multi-Converter_1.0.5_linux-x64.AppImage.sha256`; the artifact ZIP digest reported by GitHub Actions was `caee75033d3e4f11fd2a87efa409f9bece27673f4e16522654de946770f28123`.
- Linux Conversion Matrix: run `27505795092`, success. The `Build verified Linux x64 AppImage` job ran `npm run test:linux:conversions` on Linux x64 with real Linux FFmpeg/ffprobe sidecars and the staged PDFium, LibreOffice, Pandoc and libvips Linux engine archives before packaging.
- Linux AppImage Verification: run `27505795092`, success. The workflow verified the release-named `Multi-Converter_1.0.5_linux-x64.AppImage` on Linux with `npm run verify:linux-appimage`, including AppDir extraction, bundled x86_64 ELF sidecar checks, advanced engine set checks, foreign-platform file rejection and cryptographic updater signature verification.
- Linux WSL Native Checkout Preflight: partial on June 14, 2026. A native WSL checkout was prepared under `~/Multi-Converter-linux`, Node.js v24.16.0 and npm 11.13.0 were installed from Linux binaries, and `npm ci` completed with Linux node_modules. `npm run test:linux:environment` still fails because required Ubuntu system packages are missing (`pkg-config`, `dbus-1`, `gtk+-3.0`, `webkit2gtk-4.1`, `ayatana-appindicator3-0.1`, `librsvg-2.0`, `xdo`, `openssl`) and this WSL session cannot install them without an interactive sudo password. This is not release evidence.

## Remaining Release Evidence

- Automated macOS release evidence is now recorded for engine staging, the two-architecture `macOS Conversion Matrix`, and Apple Silicon + Intel verification of the universal DMG workflow artifact.
- Linux AppImage support is wired into configuration, release asset preparation/validation, README download links, updater metadata contracts and GitHub Actions. The final Linux AppImage build, Linux conversion matrix and Linux AppImage verification now have successful GitHub Actions Ubuntu 22.04 evidence for run `27505795092`; the remaining Linux release blocker is the manual final downloaded AppImage smoke test on a clean Linux x64 desktop.
- Manual clean-Mac smoke testing is still required before a public macOS release claim: mount DMG, drag to Applications, approve the unsigned/not-notarized first launch through `System Settings > Privacy & Security > Open Anyway`, confirm second launch, file selection, one FFmpeg media conversion, and one document/PDF/image path when those engines are included.
- A pre-final Codex Security scan is recorded below for the repository state before the latest Linux release hardening, and the final post-Linux Codex Security scan is now recorded below. Manual clean-Mac smoke testing and manual Linux AppImage smoke testing are still required before marking the full v1.0.5 release goal complete.
- The public release body still needs to state whether the macOS build is Apple-signed and notarized, that macOS automatic updates are enabled when updater artifacts are included, and how to open the app through `Open Anyway` when the build is not Apple-signed or not notarized. If Linux is included, it must also name `Multi-Converter_1.0.5_linux-x64.AppImage`, state that Linux automatic updates are enabled, and mention the passed Linux AppImage verification and Linux Conversion Matrix evidence.

## Manual Clean-Mac Smoke Test Receipt

Record this receipt only after testing the final downloaded DMG on a clean macOS environment. Leave the result as `pending` until every required line below is true for the exact release DMG.

- Manual clean-Mac smoke testing: pending
- Date: pending
- Tester: pending
- macOS version: pending
- Mac model: pending
- Architecture tested: pending
- DMG: Multi-Converter_1.0.5_macos-universal.dmg
- DMG source: pending
- Mounted final downloaded DMG: no
- Dragged app to Applications: no
- Unsigned/not-notarized first launch warning verified: no
- Opened through System Settings > Privacy & Security > Open Anyway: no
- Confirmed Open prompt: no
- Second launch verified: no
- File selection verified: no
- FFmpeg media conversion verified: no
- Document/PDF/image advanced conversion verified: no
- Updater metadata behavior checked: no
- Notes: pending

## Manual Linux AppImage Smoke Test Receipt

Record this receipt only after testing the final downloaded AppImage on a clean Linux x64 desktop. Leave the result as `pending` until every required line below is true for the exact release AppImage.

- Manual Linux AppImage smoke testing: pending
- Date: pending
- Tester: pending
- Linux distribution: pending
- Architecture tested: pending
- AppImage: Multi-Converter_1.0.5_linux-x64.AppImage
- AppImage source: pending
- Marked AppImage executable: no
- Launched AppImage: no
- File selection verified: no
- FFmpeg media conversion verified: no
- Document/PDF/image advanced conversion verified: no
- Updater metadata behavior checked: no
- Notes: pending

## Security And Confidentiality Evidence

- `npm run test:secret-leaks`: passed on June 13, 2026.
- The tracked-file secret scan now includes GitHub workflow files, tracked credential/signing file paths, private test repository references, maintainer-local Windows paths, Apple signing key/certificate/profile filenames and accidental Apple/Tauri signing secret values.
- `npm run test:production-config`: passed on June 13, 2026.
- `npm audit --audit-level=moderate`: passed on June 13, 2026 with 0 reported npm vulnerabilities.
- `cargo audit --file src-tauri/Cargo.lock`: completed on June 13, 2026. It reported the expected allowed warnings already documented for the current Tauri/Linux GTK-related dependency stack, plus unmaintained transitive crates; no new secret exposure was found by this command.
- Extra tracked-file confidentiality search: passed on June 13, 2026. No private test repository reference, local maintainer path, signing-key value, Apple signing credential file name, npm token assignment or private-key block was found in tracked project files outside ignored/generated folders.
- Local Git configuration was checked and the obsolete private test remote was removed from this machine. This was not a tracked repository change.
- Linux release diff confidentiality pass: passed on June 14, 2026. Reviewed the changed release workflows, Linux AppImage config, release asset scripts, testing scripts and documentation for secret values, private repository references, maintainer-local paths, signing credential filenames, private-key blocks and token/password assignments. Only expected GitHub Actions secret references and public documentation warnings were present.
- `npm run test:secret-leaks`: passed again on June 14, 2026 after the Linux release changes.
- Linux WSL validation pass: environment rejected on June 14, 2026. WSL Ubuntu was detected, but the checkout was under `/mnt/c`, `npm` resolved through the Windows Node installation and native Linux build dependencies such as `pkg-config` were missing. This environment is not accepted as Linux build or conversion evidence. Linux packaging, release artifact, repository metadata and GitHub workflow contract tests were validated from the normal local gate, while real Linux AppImage and conversion proof must come from GitHub Actions Ubuntu or a clean Linux/WSL checkout with Linux-installed tooling.
- Linux native WSL preparation: partial on June 14, 2026. The project was synchronized to `~/Multi-Converter-linux` without generated release outputs, Linux Node.js v24.16.0/npm 11.13.0 were installed under `~/.local/node-v24`, and `npm ci` completed there. The Linux environment preflight still failed on missing Ubuntu native development packages, and `sudo -n true` confirmed package installation is not available non-interactively in this session. This remains setup progress only, not AppImage or conversion evidence.
- Linux AppImage updater artifact contract checked against the official Tauri v2 updater behavior on June 14, 2026: with `createUpdaterArtifacts: true`, Linux uses the AppImage itself as the updater bundle and emits `AppImage.sig`.
- Linux release-note gate hardening: passed on June 14, 2026. `scripts/validate-release-notes.mjs`, release asset preparation, release asset validation and the GitHub `Release` workflow now pass `include_linux` through the shared release-note validator. Linux releases must name the versioned Linux x64 AppImage, state Linux automatic updates are enabled, mention Linux AppImage verification on Linux and avoid unproven full Linux conversion claims unless the Linux Conversion Matrix is named.
- Linux sidecar staging gate: added on June 14, 2026. `npm run prepare:linux-sidecar-release-assets` and the manual `Linux Sidecar Staging` workflow normalize maintainer-approved Linux x64 FFmpeg/ffprobe binaries into the exact four assets expected by `Linux AppImage Build`, after SHA-256, placeholder, x86_64 ELF and smoke-test checks. This is a staging gate only; it is not final proof that the public Linux AppImage was built or tested.
- Linux AppImage verification gate: added on June 14, 2026. `npm run verify:linux-appimage` extracts the release-named AppImage on Linux, validates AppDir structure, verifies bundled FFmpeg/ffprobe sidecars as x86_64 ELF executables, rejects obvious Windows/macOS-only bundled files, rejects foreign-platform FFmpeg/ffprobe sidecars without relying on filename extensions and cryptographically verifies the updater signature against the configured Tauri updater public key. The Linux AppImage build workflow and the GitHub Release Linux verification job now run this gate.
- Linux host-sidecar ELF hardening: passed on June 14, 2026. `npm run test:linux:host`, `npm run prepare:linux-sidecars`, release asset preparation, release asset validation and AppImage verification all reject non-ELF or non-x86_64 Linux sidecars/AppImages before release claims.
- Linux engine binary selection hardening: passed on June 14, 2026. Runtime engine selection and bundled-engine validation now prefer native Linux architecture paths, so a future Linux engine package containing multiple architecture subtrees will not accidentally pick an ARM binary on Linux x64.
- Linux staged-engine manifest and source-tree hardening: passed on June 14, 2026. `npm run test:linux-engine-release-assets` now verifies that Linux staged advanced-engine manifests reject Windows/macOS binary path segments such as `.app`, `.dmg`, `.exe`, `.dll`, `.ps1`, and reject absolute or traversing binary paths before writing the embedded manifest. `npm run test:linux-packaging` also verifies the Linux source-tree helper rejects the same non-Linux path segments inside extracted archives.
- FFmpeg version contract hardening: passed on June 14, 2026. Linux and macOS sidecar staging, host validation, AppImage/DMG verification and bundled-engine validation now read the expected FFmpeg version from `FFMPEG_REQUIRED_VERSION` in `src-tauri/src/engines.rs`, avoiding drift between runtime checks and release validators.
- FFmpeg version workflow trigger hardening: passed on June 14, 2026. Linux AppImage, Linux sidecar staging, macOS engine staging, macOS DMG and macOS conversion workflows now include `scripts/lib/ffmpeg-version.mjs` in their `codex/test` push paths, so updates to the shared FFmpeg version contract retrigger the affected platform validation workflows.
- Linux staging artifact handoff hardening: passed on June 14, 2026. `Linux AppImage Build` now accepts either release tags or successful `Linux Sidecar Staging` / `Linux Engine Staging` workflow run IDs for real Linux sidecars and advanced engines, rejects ambiguous mixed inputs, verifies workflow run provenance before using artifacts, and stages workflow artifacts through the same checksum, ELF and manifest validators used for release assets.
- Linux release-asset negative coverage hardening: passed on June 14, 2026. `npm run test:release-assets` now explicitly covers Linux AppImage stable-alias hash mismatches, Linux `.sha256` content mismatches and `latest.json` Linux updater signature mismatches, in addition to non-ELF AppImage rejection.
- Linux local engine artifact strictness: passed on June 14, 2026. `npm run prepare:linux-engine-release-assets -- --from-local-assets` now rejects unexpected files in the `linux-engine-assets` workflow artifact directory, so AppImage builds cannot silently consume or carry unreviewed extra local staging files alongside the manifest and required advanced-engine ZIPs.
- Linux sidecar artifact strictness: passed on June 14, 2026. `npm run prepare:linux-sidecars -- --asset-dir ...` now rejects unexpected files in the `linux-sidecar-assets` workflow artifact directory, so AppImage builds can only stage the exact Linux x64 FFmpeg/ffprobe sidecars and matching `.sha256` files.
- Linux conversion manifest path hardening: passed on June 14, 2026. `npm run test:linux:conversions` now rejects absolute, traversing or non-Linux advanced-engine binary paths before preparing engines or running conversion tests, matching the stricter staging helper rules.
- Linux AppImage engine-set strictness: passed on June 14, 2026. `npm run verify:linux-appimage` now rejects duplicate advanced bundled engines, unexpected advanced engines and non-advanced Linux bundled engine metadata, so the final AppImage gate enforces the same reviewed advanced-engine set as staging.
- Linux AppImage metadata path hardening: passed on June 14, 2026. `npm run verify:linux-appimage` now rejects absolute, traversing and Windows/macOS-style advanced-engine `binaryPaths` inside extracted AppImage metadata, matching the staged-engine and conversion manifest rules.
- Linux sidecar archive-source staging hardening: passed on June 14, 2026. `npm run prepare:linux-sidecar-release-assets` now accepts SHA-256 pinned raw executables or ZIP/TAR archives containing `ffmpeg`/`ffprobe`, extracts archives before ELF/version checks and continues to reject AppImages.
- Linux `.tar.xz` staging compatibility: passed on June 14, 2026. Linux sidecar staging and Linux advanced-engine source preparation now accept SHA-256 pinned `.tar.xz` archives in addition to `.zip`, `.tar.gz` and `.tgz`, matching common Linux FFmpeg/static-build distribution formats while preserving extraction and ELF/source-tree validation.
- Linux `.tar.xz` extraction dependency hardening: passed on June 14, 2026. Linux sidecar and engine staging workflows now install `xz-utils`, and the staging helpers explicitly use `tar -xJf` for `.tar.xz` archives instead of relying on tar auto-detection.
- Linux upstream PDFium/Pandoc preparation helpers: added on June 14, 2026. `npm run prepare:pdfium-engine:linux` and `npm run prepare:pandoc-engine:linux` now prepare reviewed Linux x64 source trees from SHA-256 pinned upstream PDFium/Pandoc archives and smoke-test them on Linux x64. This does not complete Linux advanced-engine staging by itself because the full four-engine staging workflow still has to pass and be recorded.
- Linux engine staging upstream handoff: added on June 14, 2026. `Linux Engine Staging` can now prepare PDFium, LibreOffice, Pandoc and libvips from pinned upstream/runtime inputs, revalidate those generated source trees with `npm run prepare:linux-engine-sources -- --allow-existing`, and package the full advanced Linux engine set for AppImage builds.
- Linux upstream LibreOffice/libvips preparation helpers: added on June 14, 2026. `npm run prepare:libreoffice-engine:linux` prepares LibreOffice from the official SHA-256 pinned Linux x86-64 Debian archive without installing it into the runner, and `npm run prepare:libvips-engine:linux` stages a portable Ubuntu libvips runtime with copied dynamic libraries, module paths and a real image smoke test. `Linux Engine Staging` can now use these runtime-preparation modes instead of source-tree archive inputs.
- `npm run check`: passed on June 14, 2026 after the Linux release-note, Linux ELF, Linux staged-engine manifest/source-tree, FFmpeg version-contract, workflow-trigger, Linux staging artifact handoff, Linux release-asset negative coverage, Linux local engine artifact strictness, Linux sidecar artifact strictness, Linux conversion manifest path hardening, Linux AppImage engine-set strictness, Linux AppImage metadata path hardening, Linux sidecar archive-source staging hardening, Linux `.tar.xz` staging compatibility, Linux `.tar.xz` extraction dependency hardening, Linux upstream PDFium/Pandoc preparation helper coverage, Linux engine staging upstream handoff and Linux upstream LibreOffice/libvips preparation helper coverage.

- Pre-final Codex Security subagent scan: passed on June 13, 2026. Scope: full repository scan split into 27 read-only discovery shards, excluding `AGENTS.md` per maintainer instruction. Outcome: all discovered release-integrity and confidentiality candidates were fixed or suppressed with counterevidence; no surviving reportable finding remained. The report was kept in a local Codex Security scan artifact directory outside the repository.
- Final Codex Security scan after Linux AppImage/release asset changes: passed
- Final security date: June 14, 2026
- Final security reviewer: Codex Security final diff/confidentiality pass
- Final security scope: `origin/main...HEAD` plus the local validation/status working-tree patch, covering changed release workflows, Linux AppImage and engine/sidecar packaging scripts, updater signature/release asset validators, runtime engine selection/logging changes, documentation/status files and tracked-file confidentiality checks.
- Final confidential information exposure: no tracked secret, signing key value, private repository reference, maintainer-local path, token assignment or private-key block exposure found. GitHub Actions secret references are limited to expected `${{ secrets.* }}` contexts, and release/staging tag inputs are validated before use.
- Final security outcome: no surviving reportable finding remains. Final Markdown and HTML reports were written to a local Codex Security scan artifact directory outside the repository, and the report format validator passed. `npm run check`, `npm audit --audit-level=moderate` and `cargo audit --file src-tauri/Cargo.lock` were included in the final evidence, with Cargo Audit returning only the already documented allowed RustSec warning categories.

Do not mark the full v1.0.5 release goal complete until the manual clean-Mac smoke test receipt above is completed for the final downloaded DMG and the manual Linux AppImage smoke test receipt is completed for the final downloaded AppImage.
