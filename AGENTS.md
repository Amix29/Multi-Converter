# AGENTS.md

Guidance for AI agents working on Multi-Converter.

## Project Context

Multi-Converter is a local-first desktop app built with Tauri 2, React, TypeScript, Rust and Vite. The current stable public build is Windows x64; V1.0.5 release work is adding one universal macOS build for Apple Silicon and Intel Macs plus one Linux x64 AppImage. Real conversions, file-system access, bundled sidecars and updater behavior must be tested through the Tauri app or Rust tests, not only through the Vite preview.

## Core Rules

- Read `README.md` and `docs/RELEASE_CHECKLIST_WINDOWS.md` before Windows release work. Also read `docs/RELEASE_CHECKLIST_MACOS.md` before any macOS build, packaging or release work, and `docs/RELEASE_CHECKLIST_LINUX.md` before any Linux build, packaging or release work.
- Read `docs/TESTING.md` before changing test commands, GitHub Actions jobs, release validation, macOS/Linux packaging checks or conversion test coverage.
- Do not revert user changes in the working tree unless explicitly asked.
- Keep generated folders and release outputs out of commits unless a maintainer explicitly approves them.
- Do not commit local engine sources, generated engine archives, release checksums or third-party engine version changes without maintainer approval.
- Preserve the local/privacy promise: conversions must run on the user's machine and must not upload files.
- Keep this `AGENTS.md` file up to date. If project workflows, release requirements, validation commands, engine behavior or AI instructions change, update this file so future agents receive true, current and reliable guidance.

## Communication Style

- Use a warm, helpful and approachable tone when writing user-facing content.
- Emojis are very encouraged and recommended in release notes and short product messages when they make the content easier to scan, friendlier and more understandable. Prefer a small number of clear, useful emojis over decorative overload.
- Keep explanations clear and concise. Prefer simple words, short sentences and concrete examples over technical phrasing.
- Write for a broad public first. Technical readers should still find accurate details, but non-technical users must understand what changed and what they need to do.
- When technical details are necessary, explain their user impact before naming internal tooling, dependencies or implementation details.

## Validation Before Release

Run these checks after meaningful changes:

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
npm run validate:release-assets -- --version X.Y.Z --dir "$env:LOCALAPPDATA\Temp\mc-release-assets\vX.Y.Z"
```

`npm run test:rust` intentionally skips the heavy conversion matrix. Run `npm run test:conversions` before claiming conversion coverage is complete.

## GitHub Actions And Test Branches

- Publish normal, stable GitHub Actions workflows for the public project in the main repository: `Amix29/Multi-Converter`.
- Development-version validation, experimental workflows, risky CI experiments, temporary release tests and unreleased platform tests should run in the main repository on the single persistent test branch `codex/test`, not in a separate private test repository.
- Do not create a new test branch for each validation round. Reuse `codex/test` for test runs, reset or update it intentionally when needed, and keep `main` out of in-progress experiments.
- Do not use `main` as the playground for tests of an in-progress version. Merge back only the stable, reviewed workflow or test changes that are ready for the public repository.
- Before publishing, pushing release assets, opening `codex/test` publicly for review, or merging test work, verify that no sensitive information will be exposed. Run the configured secret/confidentiality checks, review the diff and release assets, and make sure no local paths, credentials, signing keys, tokens, private engine URLs or private repository references are present.
- Public release gates, final release validation and normal GitHub Actions that protect the main project still belong in `Amix29/Multi-Converter`.

## Build And Signing

- Local unsigned builds are allowed when `TAURI_SIGNING_PRIVATE_KEY` is unavailable.
- On this maintainer machine, `TAURI_SIGNING_PRIVATE_KEY` is defined in the user environment. Do not write or expose the private key value in repository files, logs or user-facing messages.
- CI/release builds should provide `TAURI_SIGNING_PRIVATE_KEY` so Tauri can generate signed updater artifacts.
- Tauri updater signing is not the same as Apple code signing. Do not describe a macOS app as Apple-signed or notarized just because updater artifacts have `.sig` files.
- If the release version changes, keep these files in sync:
  - `package.json`
  - `package-lock.json`
  - `src-tauri/Cargo.toml`
  - `src-tauri/Cargo.lock`
  - `src-tauri/tauri.conf.json`

## macOS Development

- Build and package macOS releases on macOS. Do not claim macOS release readiness from Windows-only builds, Vite preview, or source inspection alone.
- Real macOS host validation must run on macOS. `npm run test:macos-packaging` is only a static contract test; `npm run test:macos:host` must run on a real Mac or GitHub Actions `macos-latest` and intentionally fails on Windows/Linux.
- The project ships a single macOS installer: one universal `.dmg` that supports Apple Silicon and Intel Macs. Do not publish separate `arm64` and `x64` DMG installers unless this file is intentionally updated first.
- The macOS app bundle, sidecars and bundled engines must all be compatible with the universal macOS target. Verify that required executables keep their executable bit and are available for both Apple Silicon and Intel, either as universal binaries or correctly packaged architecture-specific binaries.
- For Tauri `externalBin` sidecars in a `universal-apple-darwin` release build, stage the Apple Silicon and Intel inputs, then create and validate `*-universal-apple-darwin` sidecars before bundling. Do not rely on only `*-aarch64-apple-darwin` and `*-x86_64-apple-darwin` files for the final universal build.
- Prefer a normal Tauri macOS bundle/DMG workflow. Do not hand-edit files inside the generated `.app` after packaging. If the app bundle, `Info.plist`, sidecars, resources or icons need changes, update source/config and rebuild.
- Use Tauri ad-hoc signing for unsigned macOS builds when no Apple Developer ID certificate is available. Ad-hoc signing is free and can reduce technical launch problems, especially on Apple Silicon, but it does not make the app Apple-signed or notarized.
- Unless Apple signing credentials are explicitly added, macOS release builds are not Apple-signed and not notarized. Treat this as an intentional distribution limitation, not as a build failure.
- Do not ask users to disable Gatekeeper globally. Avoid `sudo spctl --master-disable` in public instructions.
- Do not present `xattr -dr com.apple.quarantine` as the normal install path. Reserve quarantine-removal commands for advanced troubleshooting only.
- The normal user-facing opening instructions for an unsigned/not-notarized macOS build are: open the app once, go to `System Settings > Privacy & Security`, choose `Open Anyway`, then confirm `Open`. Mention that this approval is normally needed only on first launch for that downloaded app copy or after installing a new version.
- Test the final downloaded DMG on a clean macOS environment before release. At minimum verify: mount DMG, drag the app to Applications, first launch warning/approval path, second launch behavior, file selection, one base media conversion, one document/PDF path if those engines are included, and updater metadata behavior if macOS updates are enabled.

## Linux Development

- Build and package Linux releases on Linux x64. Do not claim Linux release readiness from Windows/macOS builds, Vite preview or source inspection alone.
- The public Linux installer is one x64 AppImage: `Multi-Converter_X.Y.Z_linux-x64.AppImage`, plus the stable latest alias `Multi-Converter_linux-x64.AppImage`.
- Linux automatic updates use the Tauri updater platform key `linux-x86_64`, pointing to the versioned AppImage and using the exact content of `Multi-Converter_X.Y.Z_linux-x64.AppImage.sig`.
- `npm run test:linux:environment` is the Linux toolchain preflight. It checks Linux Node/npm/Rust tooling, Rust format/lint components, required `pkg-config` modules and the Linux Tauri CLI native binding before slower Linux checks.
- In WSL, Linux validation must use Linux-installed Node/npm/Rust tooling. `npm run test:linux:environment` rejects Windows-mounted tools from `/mnt/c` to avoid hybrid builds.
- `npm run test:linux:ci` is a compile/unit/contract gate and uses compile-only sidecar placeholders. It includes Linux packaging contracts and staged Linux engine release asset tests, but do not present it as proof of real Linux conversions.
- Use `npm run prepare:linux-sidecars -- --asset-dir "<folder>"` to stage downloaded real Linux FFmpeg/ffprobe sidecars with matching `.sha256` files. This verifies checksums, rejects placeholders, rejects non-ELF or non-x86_64 sidecars and smoke-tests the sidecars on Linux x64.
- Use `npm run prepare:linux-sidecar-release-assets` or the manual `Linux Sidecar Staging` workflow to normalize maintainer-approved Linux FFmpeg/ffprobe binaries into the four release assets expected by `Linux AppImage Build`: `ffmpeg-x86_64-unknown-linux-gnu`, `ffprobe-x86_64-unknown-linux-gnu` and their `.sha256` files.
- `npm run test:linux:host` must run on Linux x64 with real `ffmpeg-x86_64-unknown-linux-gnu` and `ffprobe-x86_64-unknown-linux-gnu` sidecars. It rejects CI placeholder sidecars, rejects non-ELF or non-x86_64 sidecars and validates bundled engines with `MULTI_CONVERTER_REQUIRE_ADVANCED_ENGINES=1`.
- `npm run test:linux:conversions` is the full Linux conversion gate. It must run on Linux x64 with real Linux sidecars, Linux `pdfium`, `libreoffice`, `pandoc` and `libvips` advanced engine entries, and then run the complete conversion matrix.
- `npm run verify:linux-appimage` must verify the exact release-named AppImage on Linux before upload or publication. It extracts the AppImage, checks AppDir structure, verifies FFmpeg/ffprobe sidecars as x86_64 ELF executables, rejects Windows-only/macOS-only files and cryptographically checks the updater signature file.
- Use `npm run tauri:build:linux` only on Linux with real Linux sidecars staged. Do not publish an AppImage that was not built and verified on Linux.
- Use `npm run prepare:linux-engine-sources` only with maintainer-approved Linux x64 source-tree archives and SHA-256 values for PDFium, LibreOffice, Pandoc and libvips, then `npm run package:linux-engines` to produce the Linux engine ZIPs and manifest.
- Prefer the manual GitHub Actions `Linux AppImage Build` workflow for release handoff. It accepts either a staged `sidecar_release_tag` or a successful `sidecar_staging_run_id` with real Linux FFmpeg/ffprobe sidecars plus `.sha256` files, and either an `engine_release_tag` or a successful `engine_staging_run_id` with `engines-manifest.json` plus verified Linux advanced engine ZIPs. Do not provide both source types for the same asset class. It uploads the `linux-release-artifacts` artifact.

## Release Assets

Release asset lists are strict. The application release must contain exactly the files required for the selected release mode, no more and no less. GitHub's automatic "Source code (zip)" and "Source code (tar.gz)" links are generated by GitHub and do not count as uploaded application assets.

### Windows-Only Release Assets

Each public Windows-only application release must upload exactly these five application assets:

1. `latest.json`
2. `Multi-Converter_X.Y.Z_x64-setup.exe`
3. `Multi-Converter_X.Y.Z_x64-setup.exe.sig`
4. `Multi-Converter_X.Y.Z_x64-setup.exe.sha256`
5. `Multi-Converter_windows-x64_setup.exe`

Use the exact release version without the leading `v` in versioned asset names. For example, release `v1.0.1` uses `Multi-Converter_1.0.1_x64-setup.exe`, `Multi-Converter_1.0.1_x64-setup.exe.sig` and `Multi-Converter_1.0.1_x64-setup.exe.sha256`.

Validate the final clean folder with:

```powershell
npm run validate:release-assets -- --version X.Y.Z --dir "<folder>" --platform windows
```

### Windows And macOS Release Assets

When a public release includes macOS support, it must upload exactly these nine application assets:

1. `latest.json`
2. `Multi-Converter_X.Y.Z_x64-setup.exe`
3. `Multi-Converter_X.Y.Z_x64-setup.exe.sig`
4. `Multi-Converter_X.Y.Z_x64-setup.exe.sha256`
5. `Multi-Converter_windows-x64_setup.exe`
6. `Multi-Converter_X.Y.Z_macos-universal.dmg`
7. `Multi-Converter_macos-universal.dmg`
8. `Multi-Converter_X.Y.Z_macos-universal.app.tar.gz`
9. `Multi-Converter_X.Y.Z_macos-universal.app.tar.gz.sig`

Keep the Windows assets unless the release is intentionally macOS-only and this section is intentionally updated first. `--platform all` is the historical Windows + macOS asset set. Use `--platform desktop` instead when the same release also includes Linux.

Validate the final clean folder with the SHA-256 produced by the verified macOS DMG job:

```powershell
npm run validate:release-assets -- --version X.Y.Z --dir "<folder>" --platform all --macos-dmg-sha256 "<verified-dmg-sha256>"
```

Current macOS updater status:

- macOS automatic updates are enabled when a release includes macOS.
- `latest.json` must contain exactly the Windows updater platforms plus `darwin-aarch64` and `darwin-x86_64` when macOS is included.
- Both Darwin entries must point to the same verified universal updater archive: `Multi-Converter_X.Y.Z_macos-universal.app.tar.gz`.
- Both Darwin entries must use the exact signature content from `Multi-Converter_X.Y.Z_macos-universal.app.tar.gz.sig`.
- Do not upload `.dmg.sig`, `.app.tar.gz.sha256`, invented Darwin updater aliases or separate architecture-specific macOS updater archives unless this section and `scripts/validate-release-assets.mjs` are intentionally updated together.

Asset rules:

- `latest.json` is required by the automatic updater and must describe the exact version being published.
- `Multi-Converter_X.Y.Z_x64-setup.exe` is the versioned Windows x64 NSIS installer generated by Tauri.
- `Multi-Converter_X.Y.Z_x64-setup.exe.sig` is the updater signature for the versioned installer.
- `Multi-Converter_X.Y.Z_x64-setup.exe.sha256` is the manual integrity check for the versioned installer. It must contain the SHA-256 hash computed from `Multi-Converter_X.Y.Z_x64-setup.exe`, preferably in the format `<SHA256>  Multi-Converter_X.Y.Z_x64-setup.exe`.
- `Multi-Converter_windows-x64_setup.exe` is the stable download alias used by README download links and must be copied from the exact same versioned installer.
- `Multi-Converter_X.Y.Z_macos-universal.dmg` is the only user-facing macOS installer when macOS support is included. It must be generated from a clean macOS build and verified on macOS before publication.
- `Multi-Converter_macos-universal.dmg` is the stable macOS download alias used by README download links and must be copied from the exact same verified versioned DMG.
- `Multi-Converter_X.Y.Z_macos-universal.app.tar.gz` is the Tauri macOS updater archive generated from the universal `.app` bundle.
- `Multi-Converter_X.Y.Z_macos-universal.app.tar.gz.sig` is the Tauri updater signature for the macOS updater archive.
- Do not upload MSI files, ZIP archives, logs, extra checksum files, engine archives, source archives, portable folders, direct `.exe` app binaries or extra installer aliases as application release assets unless this section is intentionally updated first.
- Do not create a separate SHA-256 asset for `Multi-Converter_windows-x64_setup.exe`; it is an alias of the versioned installer and must have the same hash.
- Do not create a separate SHA-256 asset for `Multi-Converter_macos-universal.dmg`; it is an alias of the versioned DMG and must have the same hash.
- Do not upload a separate `.sha256` file for the macOS DMG unless `scripts/validate-release-assets.mjs`, the release workflow and this section are intentionally updated to require it.
- Do not upload source code archives manually; instead make sure the tag points to the exact commit being released.
- Before publication, copy or generate the final required release assets into a clean folder such as `%LOCALAPPDATA%\Temp\mc-release-assets\vX.Y.Z` and run the matching `npm run validate:release-assets` command above.
- Do not publish directly from a dirty Tauri bundle directory if it still contains old-version installers or signatures.

When a public release includes macOS support:

- Do not upload separate Apple Silicon and Intel DMG installers.
- Do not upload a macOS DMG unless it was generated from a clean macOS build and verified on macOS.
- Include only the exact macOS updater artifacts generated by Tauri and make sure `latest.json` contains the matching macOS updater metadata. Do not invent updater signatures or platform entries by hand.
- The release body, `latest.json` notes when relevant, README download instructions and any visible installation notes must always say whether the macOS build is Apple-signed and whether it is notarized.
- If the macOS DMG is not Apple-signed or not notarized, the release body, `latest.json` notes when relevant, README download instructions and any visible installation notes must say so plainly and include the normal `System Settings > Privacy & Security > Open Anyway` opening path.
- The GitHub `Release` workflow includes macOS assets only when run manually with `include_macos=true` after the verified DMG, updater archive and updater signature have already been uploaded to the GitHub release. Windows-only release runs must not mention or preserve macOS assets.

### Linux Release Assets

When a public release includes Linux support, it must add exactly these Linux application assets to the selected Windows/macOS release mode:

1. `Multi-Converter_X.Y.Z_linux-x64.AppImage`
2. `Multi-Converter_linux-x64.AppImage`
3. `Multi-Converter_X.Y.Z_linux-x64.AppImage.sig`
4. `Multi-Converter_X.Y.Z_linux-x64.AppImage.sha256`

Linux automatic updates are enabled when a release includes Linux. `latest.json` must contain `linux-x86_64`, point to `Multi-Converter_X.Y.Z_linux-x64.AppImage` and use the exact signature content from `Multi-Converter_X.Y.Z_linux-x64.AppImage.sig`.

For a Linux-only public application release, upload exactly these five application assets:

1. `latest.json`
2. `Multi-Converter_X.Y.Z_linux-x64.AppImage`
3. `Multi-Converter_linux-x64.AppImage`
4. `Multi-Converter_X.Y.Z_linux-x64.AppImage.sig`
5. `Multi-Converter_X.Y.Z_linux-x64.AppImage.sha256`

Linux asset rules:

- `Multi-Converter_X.Y.Z_linux-x64.AppImage` is the versioned Linux x64 AppImage generated by the verified Linux release build.
- `Multi-Converter_linux-x64.AppImage` is the stable Linux download alias used by README download links and must be copied from the exact same verified versioned AppImage.
- `Multi-Converter_X.Y.Z_linux-x64.AppImage.sig` is the Tauri updater signature for the versioned AppImage.
- `Multi-Converter_X.Y.Z_linux-x64.AppImage.sha256` is the manual integrity check for the versioned AppImage. It must contain the SHA-256 hash computed from `Multi-Converter_X.Y.Z_linux-x64.AppImage`, preferably in the format `<SHA256>  Multi-Converter_X.Y.Z_linux-x64.AppImage`.
- Do not create a separate SHA-256 asset for `Multi-Converter_linux-x64.AppImage`; it is an alias of the versioned AppImage and must have the same hash.
- Do not upload Linux release assets unless the exact release-named AppImage has passed `npm run verify:linux-appimage` on Linux x64.
- Do not upload Linux updater aliases, invented signatures, `.deb`, `.rpm`, tarballs, portable folders or extra Linux aliases unless this section and `scripts/validate-release-assets.mjs` are intentionally updated together.

Validate Linux-only assets, including their Linux-only `latest.json`, with:

```bash
npm run validate:release-assets -- --version X.Y.Z --dir "<folder>" --platform linux --linux-appimage-sha256 "<verified-appimage-sha256>"
```

Validate Windows + Linux assets with:

```bash
npm run validate:release-assets -- --version X.Y.Z --dir "<folder>" --platform windows-linux --linux-appimage-sha256 "<verified-appimage-sha256>"
```

When a public release includes Windows, macOS and Linux together, it must upload exactly these thirteen application assets:

1. `latest.json`
2. `Multi-Converter_X.Y.Z_x64-setup.exe`
3. `Multi-Converter_X.Y.Z_x64-setup.exe.sig`
4. `Multi-Converter_X.Y.Z_x64-setup.exe.sha256`
5. `Multi-Converter_windows-x64_setup.exe`
6. `Multi-Converter_X.Y.Z_macos-universal.dmg`
7. `Multi-Converter_macos-universal.dmg`
8. `Multi-Converter_X.Y.Z_macos-universal.app.tar.gz`
9. `Multi-Converter_X.Y.Z_macos-universal.app.tar.gz.sig`
10. `Multi-Converter_X.Y.Z_linux-x64.AppImage`
11. `Multi-Converter_linux-x64.AppImage`
12. `Multi-Converter_X.Y.Z_linux-x64.AppImage.sig`
13. `Multi-Converter_X.Y.Z_linux-x64.AppImage.sha256`

Validate Windows + macOS + Linux assets with:

```bash
npm run validate:release-assets -- --version X.Y.Z --dir "<folder>" --platform desktop --macos-dmg-sha256 "<verified-dmg-sha256>" --macos-updater-sha256 "<verified-updater-sha256>" --linux-appimage-sha256 "<verified-appimage-sha256>"
```

Do not upload `.deb`, `.rpm`, tarballs, portable folders or extra Linux aliases unless this section and `scripts/validate-release-assets.mjs` are intentionally updated together.

## Conversion Quality

- GIF handling must distinguish static GIFs from animated GIFs: static GIFs use image targets, animated GIFs use video targets.
- Integrated image conversions must decode and validate output files, including ICO compatibility.
- PDF text conversions must preserve readable text and accented characters.
- Base media conversions rely on bundled `ffmpeg` and `ffprobe`; advanced document/PDF/image conversions rely on bundled PDFium, LibreOffice, Pandoc and libvips resources. Use `npm run prepare:bundled-engines` and `npm run validate:bundled-engines` when restoring or validating bundled engines manually.

## Frontend QA

After UI changes, verify the rendered app, not just TypeScript. At minimum check:

- first screen is not blank;
- no Vite/framework overlay;
- browser console has no relevant errors or warnings;
- primary interactions work;
- dialogs and floating notices do not overlap;
- mobile viewport has no horizontal overflow.

Use `npm run dev -- --host 127.0.0.1` for UI preview. Use `npm start` or `npm run tauri:dev` when testing real conversions, sidecars, updater runtime or file-system behavior.

## Release Notes

Release notes must be structured, warm, public-facing and consistent across versions. Write for end users first, then maintainers. Avoid internal implementation jargon unless it directly affects installation, compatibility or user-visible behavior.

Release notes should feel clear, useful and easy to read for someone who only wants to know what changed, whether the update is worth installing and how to install it. Keep them concise, but explain each important change well enough that a non-technical user understands the benefit.

Order the content by importance: the most useful or risky user-visible changes should appear before smaller improvements, minor fixes and maintainer details. Technical changes belong near the end of the notes unless they directly affect installation, compatibility, privacy, security or a visible feature.

The automatic updater must display the real release notes for the exact published version. Do not add fake, test or placeholder update notes to production code. The release body, updater metadata and visible release notes should describe the same version and the same user-visible changes.

Public GitHub release bodies and updater `latest.json` notes must be published in English only. Do not publish localized release-note blocks such as `fr`, `es`, `de`, `pt` or `it` in GitHub release bodies or updater metadata.

The app may translate fetched English release notes at display time through its configured online translation endpoint. If translation is unavailable or the user is offline, show the original English notes rather than attempting an offline translation.

Use at most one optional English Markdown marker block:

```markdown
<!-- mc-release-notes:en -->
English release notes here.
<!-- /mc-release-notes -->
```

### Required Sections

Every release note must include these main sections, in this order. These required sections must always appear before conditional sections:

1. Title: `# Multi-Converter vX.Y.Z`, matching the exact version being published.
2. Opening sentence: one short, friendly sentence explaining the release in plain language.
3. `## Highlights`: the most important user-visible changes, sorted by impact, even if the release is mostly fixes.
4. `## Download And Installation`: supported platform, installer asset and any updater/signing note users must know.
5. `## Validation`: concise proof that the release was checked, including tests and build status.

For releases that include macOS, `## Download And Installation` must name the universal DMG exactly and state whether the macOS build is Apple-signed/notarized. If it is not Apple-signed and not notarized, include short, user-facing instructions to open it through `System Settings > Privacy & Security > Open Anyway` after the first launch warning.

### Conditional Sections

Add these sections only when they are relevant. Omit empty sections. Conditional sections must come after the required sections, in the order below unless a small adjustment clearly improves readability.

1. `## What's New`: new features, new settings, new workflows or new visible capabilities.
2. `## Formats And Conversions`: added/removed formats, changed conversion behavior, engine changes, quality changes or compatibility changes for formats such as GIF, DOC, PDF, ICO, WebP, audio or video.
3. `## Interface And Usability`: UI changes, dialogs, onboarding, settings, notifications, accessibility, responsive layout or wording.
4. `## Performance And Reliability`: speed, memory use, cancellation, error handling, crash prevention, large-file behavior or stability improvements.
5. `## Fixes`: bugs, regressions, confusing behavior or broken workflows that were corrected.
6. `## Security And Privacy`: security fixes, privacy-relevant behavior, dependency risk notes or changes that affect local-only guarantees.
7. `## Compatibility`: OS support, architecture support, installer compatibility, updater compatibility or behavior that changes for existing users.
8. `## Known Limitations`: remaining limitations, unavailable platforms, disabled formats or follow-up work users should know.
9. `## Developer And Build Notes`: only for release-critical maintainer details such as signing requirements, CI changes, release asset naming or build workflow changes. This section should normally be near the end because it is technical.

### Style Rules

- Do not use a copy-paste release note template. Create the release notes from these instructions and the verified changes for the exact version being published.
- Keep section order stable: required sections first, then conditional sections in the order above, unless readability clearly benefits from a small adjustment.
- Prefer bullets over long paragraphs; one bullet should usually fit on one or two lines.
- Sort sections and bullets by user impact, not by commit order or implementation order.
- Describe changes compared only with the previous published version. If a feature was added and then a bug, wording issue or internal behavior in that same unreleased feature was fixed before publication, mention only the final feature users receive. Do not list fixes, improvements or regressions for work that users could never experience in a published version.
- Use simple, public-facing wording: explain what changed, why it matters and what the user should do if action is needed.
- Keep notes well explained but concise. Do not write vague bullets such as "various improvements"; name the area and the visible result.
- Do not paste raw commit messages or a raw changelog. Rewrite changes for end users.
- Emojis or small visual markers are very encouraged and recommended when they improve readability, make changes easier to scan or help non-technical users understand the release faster. Use them intentionally as scan aids, especially in Highlights, Download And Installation, Validation and user-facing limitation notes.
- Be specific: name exact formats, platforms, installer assets, engines or workflows when they changed.
- Do not claim a conversion works unless tests or manual verification proved it.
- Do not invent features, supported formats, release assets, tests, signatures, updater artifacts or installer names. Verify them from the current files, command output or release workflow.
- In `## Validation`, mention categories of checks that passed, not full logs. Good examples are TypeScript/i18n checks, Rust tests, conversion matrix, PDFium wrapper tests, Clippy and the Windows x64 build.
- Do not overpromise quality. If a conversion is basic, fallback-based or text-only, say so clearly.
- Do not include noisy internal details such as dependency trees, temporary paths, compile logs or implementation experiments.
- Include maintainer-only details only when they affect release correctness, signing, downloads or updater behavior, and place them near the end.
- Keep release notes accurate for the exact version being published; do not reuse notes from another version without checking every item.
- If a change is purely internal and has no user impact, omit it unless it belongs in `Developer And Build Notes`.
