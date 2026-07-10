# Multi-Converter v1.0.6 Release Handoff

This handoff records the final v1.0.6 release state after native platform validation and maintainer smoke testing.

## Current Status

- Release commit: `33ba006bf60d7ae91c44b91da19626a75fa3d106`
- Prepared version: `1.0.6`
- Release mode: Windows x64 + macOS universal + Linux x64
- Clean desktop asset folder: `%LOCALAPPDATA%\Temp\mc-release-assets\v1.0.6-final-desktop`
- GitHub release notes source: `docs/RELEASE_NOTES_V1.0.6_DESKTOP.md`
- GitHub draft: `v1.0.6`, targeting `main`, with exactly 13 application assets

## Validated Desktop Assets

1. `latest.json`
2. `Multi-Converter_1.0.6_x64-setup.exe`
3. `Multi-Converter_1.0.6_x64-setup.exe.sig`
4. `Multi-Converter_1.0.6_x64-setup.exe.sha256`
5. `Multi-Converter_windows-x64_setup.exe`
6. `Multi-Converter_1.0.6_macos-universal.dmg`
7. `Multi-Converter_macos-universal.dmg`
8. `Multi-Converter_1.0.6_macos-universal.app.tar.gz`
9. `Multi-Converter_1.0.6_macos-universal.app.tar.gz.sig`
10. `Multi-Converter_1.0.6_linux-x64.AppImage`
11. `Multi-Converter_linux-x64.AppImage`
12. `Multi-Converter_1.0.6_linux-x64.AppImage.sig`
13. `Multi-Converter_1.0.6_linux-x64.AppImage.sha256`

## Final Hashes

- Windows installer SHA-256: `4d33813ea175cf66f15202dfc204328d841b2b8829ba4eab57ba2c8ca406d73a`
- macOS DMG SHA-256: `f6978d93278a142c98c23a655059b77b5ed68fdc6b2408296f2df1ae8cd3421f`
- macOS updater archive SHA-256: `0b0e95fd7cefe5885a587dac6e7a0a4069b7c36b59331518cf18184a0111abdc`
- Linux AppImage SHA-256: `aa743940ed29e7426877f82b54e951681697906a5c1750dca8aee5b973093fce`

## Validation Passed

- Windows CI gate: all 13 ordered steps passed, including audits, checks, Rust tests, conversion matrix, PDFium wrapper and signed NSIS packaging.
- macOS Conversion Matrix: passed for Apple Silicon and Intel in GitHub Actions run `29052945332`.
- macOS DMG Build and native verification: passed in GitHub Actions run `29052946761`; artifact `macos-release-artifacts`, ID `8213016442`.
- Linux conversion matrix, AppImage build and native verification: passed in GitHub Actions run `29052948091`; artifact `linux-release-artifacts`, ID `8212865700`.
- Maintainer clean-Mac smoke test: passed for the final downloaded draft DMG, including the expected Gatekeeper `Open Anyway` path and conversion checks.
- Maintainer Linux desktop smoke test: passed for the final downloaded draft AppImage.
- Full desktop asset validation: passed with:

```powershell
npm run validate:release-assets -- --version 1.0.6 --dir "$env:LOCALAPPDATA\Temp\mc-release-assets\v1.0.6-final-desktop" --platform desktop --macos-dmg-sha256 f6978d93278a142c98c23a655059b77b5ed68fdc6b2408296f2df1ae8cd3421f --macos-updater-sha256 0b0e95fd7cefe5885a587dac6e7a0a4069b7c36b59331518cf18184a0111abdc --linux-appimage-sha256 aa743940ed29e7426877f82b54e951681697906a5c1750dca8aee5b973093fce
```

## Publication

- Publish GitHub release `v1.0.6` from the existing draft.
- Keep the release body from `docs/RELEASE_NOTES_V1.0.6_DESKTOP.md`.
- Mark the release as the latest stable release.
- Verify the published tag points to the final `main` commit and the public release still contains exactly the 13 assets above.

## Do Not Upload

Do not add `.deb`, `.rpm`, tarballs, portable folders, `.dmg.sig`, `.app.tar.gz.sha256`, duplicate updater aliases, logs or engine archives. GitHub-generated source links are separate from the 13 application assets.
