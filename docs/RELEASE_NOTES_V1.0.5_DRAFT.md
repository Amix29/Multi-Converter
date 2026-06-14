<!-- Draft only. Do not publish until docs/V1_0_5_VALIDATION.md records the final downloaded macOS DMG smoke test, Linux AppImage build/conversion/verification evidence, final downloaded Linux AppImage smoke test and final Codex Security approval. -->

# Multi-Converter v1.0.5

Multi-Converter v1.0.5 expands desktop release preparation to macOS and Linux while keeping the Windows installer path stable.

## Highlights

- Adds one universal macOS DMG path for Apple Silicon and Intel Macs.
- Adds one Linux x64 AppImage path with stable latest download naming and updater metadata.
- Adds strict Linux release gates for real FFmpeg/ffprobe sidecars, advanced engine archives, AppImage verification and release asset validation.
- Improves the floating update reminder and feedback button layout so they do not overlap.
- Keeps the Windows x64 installer and updater asset contract unchanged.

## Download And Installation

- Windows: download `Multi-Converter_1.0.5_x64-setup.exe` or use the stable alias `Multi-Converter_windows-x64_setup.exe`.
- macOS: download `Multi-Converter_1.0.5_macos-universal.dmg` or use the stable alias `Multi-Converter_macos-universal.dmg`.
- Linux x64: download `Multi-Converter_1.0.5_linux-x64.AppImage` or use the stable alias `Multi-Converter_linux-x64.AppImage`.
- The macOS build is not Apple-signed and not notarized. After the first launch warning, open `System Settings > Privacy & Security`, choose `Open Anyway`, then confirm `Open`.
- macOS automatic updates are enabled when the release includes the signed Tauri updater archive.
- Linux automatic updates are enabled when the release includes the signed Tauri AppImage updater artifact.

## Validation

- Windows checks remain required before publication: TypeScript/i18n checks, Rust tests, conversion tests, PDFium wrapper checks, Clippy, production config checks, secret leak checks, release asset validation and Windows x64 build validation.
- macOS automation passed for engine staging, the two-architecture `macOS Conversion Matrix` on Apple Silicon and Intel, and universal DMG build/verification on Apple Silicon plus Intel verification of the same DMG artifact.
- Linux publication still requires the final `Linux AppImage Build`, `Linux Conversion Matrix` and `Linux AppImage Verification` evidence for `Multi-Converter_1.0.5_linux-x64.AppImage`; replace this bullet with the recorded passed run IDs before publishing.
- Final publication still requires the clean-Mac smoke test, final downloaded Linux AppImage smoke test and final Codex Security approval recorded in `docs/V1_0_5_VALIDATION.md`.

## What's New

- Linux release preparation now uses a dedicated Tauri config that produces one x64 AppImage.
- Linux release assets include a versioned AppImage, a stable latest AppImage alias, an updater signature and a SHA-256 checksum.
- Linux advanced engine staging now requires PDFium, LibreOffice, Pandoc and libvips as reviewed Linux x64 archives before a full Linux conversion claim is allowed.

## Formats And Conversions

- The `macOS Conversion Matrix` passed on Apple Silicon and Intel for the conversion targets exposed on macOS with the staged universal engine set. Do not expand macOS conversion claims beyond that matrix without rerunning it.
- Linux document, PDF and advanced image conversion coverage must be described only after the `Linux Conversion Matrix` passes with real Linux sidecars and the reviewed Linux advanced engine set.
- AMR audio output stays unavailable on macOS in this version because the staged FFmpeg build does not include the OpenCORE AMR encoder. Windows support is unchanged.

## Interface And Usability

- The update reminder, feedback launcher, page notice and import toast now keep separate positions so important notices remain clickable and readable, even when import progress and a page notice appear together.

## Performance And Reliability

- Linux staging rejects placeholder sidecars, partial advanced-engine manifests, duplicate engine entries, unexpected engine entries and checksum mismatches before release packaging.
- Linux AppImage verification extracts the AppImage, checks FFmpeg/ffprobe sidecars, rejects obvious Windows/macOS-only bundled files, verifies the updater signature cryptographically and requires every advanced Linux engine before publication.

## Security And Privacy

- Conversions still run locally on the user's machine.
- The configured secret leak and production configuration checks passed during release preparation.
- Final Codex Security approval must be recorded after the final Linux AppImage and release asset changes are complete.

## Compatibility

- macOS support uses one universal DMG instead of separate Apple Silicon and Intel installers.
- Linux support uses one x64 AppImage instead of separate distribution-specific packages.
- The macOS app uses ad-hoc signing for the unsigned build. This is not Apple Developer ID signing and does not make the app notarized.

## Known Limitations

- This draft must not be published until the Linux AppImage build, Linux conversion matrix, Linux AppImage verification and final Linux smoke test have passed for the exact release artifact.
- The macOS build is unsigned/not-notarized, so users must approve the first launch through `System Settings > Privacy & Security > Open Anyway`.

## Developer And Build Notes

- Do not upload separate Apple Silicon and Intel DMG installers for this release.
- Do not upload `.deb`, `.rpm`, portable Linux folders or extra Linux aliases for this release.
- Add macOS updater entries to `latest.json` only from the generated and signed Tauri macOS updater archive.
- Add the Linux updater entry to `latest.json` only from the verified versioned AppImage and exact `Multi-Converter_1.0.5_linux-x64.AppImage.sig` content.
