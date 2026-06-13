<!-- Draft only. Do not publish until the clean-Mac smoke test and final security approval are recorded in docs/V1_0_5_VALIDATION.md. -->

# Multi-Converter v1.0.5

Multi-Converter v1.0.5 prepares the first macOS build while keeping the Windows release path stable.

## Highlights

- Adds a universal macOS DMG path for Apple Silicon and Intel Macs.
- Adds macOS validation for staged FFmpeg/ffprobe, PDFium, LibreOffice, Pandoc and libvips engines.
- Improves the floating update reminder and feedback button layout so they do not overlap.
- Keeps the Windows x64 installer and updater asset contract unchanged.

## Download And Installation

- Windows: download `Multi-Converter_1.0.5_x64-setup.exe` or use the stable alias `Multi-Converter_windows-x64_setup.exe`.
- macOS: download `Multi-Converter_1.0.5_macos-universal.dmg`.
- The macOS build is not Apple-signed and not notarized. After the first launch warning, open `System Settings > Privacy & Security`, choose `Open Anyway`, then confirm `Open`.
- This approval is normally needed only on the first launch for that downloaded app copy, or after installing a new version.
- macOS automatic updates are not enabled for this first DMG workflow. Download future macOS versions manually until macOS updater artifacts are enabled and tested.

## Validation

- Windows checks remain required before publication: TypeScript/i18n checks, Rust tests, conversion tests, PDFium wrapper checks, Clippy, production config checks, secret leak checks, release asset validation and Windows x64 build validation.
- macOS automation passed for engine staging, a single-run `macOS Conversion Matrix`, and the universal DMG build on Apple Silicon. The macOS DMG was built, mounted and verified on macOS by the `macOS DMG Build` workflow before the workflow was hardened with Intel verification.
- Final publication still requires the hardened two-architecture `macOS Conversion Matrix` on Apple Silicon and Intel, Apple Silicon + Intel verification of the final DMG, a clean-Mac smoke test of the downloaded DMG, and final security approval. Replace this bullet with the recorded result before publishing.

## Formats And Conversions

- Final macOS conversion testing must cover the conversion targets exposed on macOS with the staged universal engine set on both Apple Silicon and Intel before publication.
- AMR audio output stays unavailable on macOS in this version because the staged FFmpeg build does not include the OpenCORE AMR encoder. Windows support is unchanged.

## Interface And Usability

- The update reminder, feedback launcher, page notice and import toast now keep separate positions so important notices remain clickable and readable.

## Security And Privacy

- Conversions still run locally on the user's machine.
- The repository passed the configured secret leak and production configuration checks before this draft was prepared.

## Compatibility

- macOS support uses one universal DMG instead of separate Apple Silicon and Intel installers.
- The macOS app uses ad-hoc signing for the unsigned build. This is not Apple Developer ID signing and does not make the app notarized.

## Known Limitations

- macOS automatic updates are not enabled in the first DMG workflow.
- The macOS build is unsigned/not-notarized, so users must approve the first launch through `System Settings > Privacy & Security > Open Anyway`.

## Developer And Build Notes

- Do not upload separate Apple Silicon and Intel DMG installers for this release.
- Do not add macOS updater entries to `latest.json` until Tauri macOS updater artifacts are generated, signed and tested end to end.
