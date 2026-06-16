# Multi-Converter v1.0.6 Release Handoff

This handoff summarizes the prepared v1.0.6 release state. It is not a publication approval by itself.

## Current Status

- Branch: `codex/test`
- Prepared version: `1.0.6`
- Release mode prepared locally: Windows x64 + macOS universal + Linux x64
- Clean desktop asset folder: `%LOCALAPPDATA%\Temp\mc-release-assets\v1.0.6-desktop`
- GitHub release notes source: `docs/RELEASE_NOTES_V1.0.6_DESKTOP.md`

## Validated Desktop Assets

The desktop asset folder contains exactly the 13 required application assets:

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

## Hashes

- Windows installer SHA-256: `63d1dab699e36c918cda3dcb1c07656a2e02fcfb74a871025cc80b7b9643c7a3`
- macOS DMG SHA-256: `d966bc73247b0ee77431443d30c19f9a2ca9b5a9aff7aa120f3288fcf8cf3c88`
- macOS updater archive SHA-256: `128aadef0348dcbecaa83c804d4aed37c096e42fbeb162dbdfbad11334abcd72`
- Linux AppImage SHA-256: `8d31bfa9850cc3f1ae4f92fe14c4b74eeb72f2b5e74111e05186a3c8654cea4e`

## Validation Passed

- Local Windows validation: `npm run check`, `npm run test:rust`, `npm run test:conversions`, Rust format, Clippy, PDFium wrapper tests, `npm run build`, and `npm run tauri:build`.
- Windows release assets: prepared and validated.
- macOS Conversion Matrix: passed for Apple Silicon and Intel in GitHub Actions run `27614880496`.
- macOS DMG Build: passed in GitHub Actions run `27615775974`; artifact `macos-release-artifacts`, ID `7666472580`.
- Linux AppImage Build: passed in GitHub Actions run `27615778303`; artifact `linux-release-artifacts`, ID `7666415187`.
- Additional Linux structural smoke check: passed under Ubuntu WSL2 x86_64. The final AppImage reported its AppImage runtime version, extracted successfully, and contained an executable `squashfs-root/AppRun`.
- Additional Linux launch smoke check: passed under Ubuntu WSL2 with WSLg, DBus and `APPIMAGE_EXTRACT_AND_RUN=1`. The final AppImage stayed running until a 20-second timeout without an immediate application crash; WSL reported graphics acceleration warnings only.
- Full desktop asset validation: passed with:

```powershell
node scripts/validate-release-assets.mjs --version 1.0.6 --dir "$env:LOCALAPPDATA\Temp\mc-release-assets\v1.0.6-desktop" --platform desktop --macos-dmg-sha256 d966bc73247b0ee77431443d30c19f9a2ca9b5a9aff7aa120f3288fcf8cf3c88 --macos-updater-sha256 128aadef0348dcbecaa83c804d4aed37c096e42fbeb162dbdfbad11334abcd72 --linux-appimage-sha256 8d31bfa9850cc3f1ae4f92fe14c4b74eeb72f2b5e74111e05186a3c8654cea4e
```

## Remaining Before Publication

- Run the final clean-Mac smoke test from the downloaded DMG:
  - mount DMG;
  - drag app to Applications;
  - verify first-launch warning and `System Settings > Privacy & Security > Open Anyway`;
  - verify second launch;
  - test file selection;
  - run one base media conversion;
  - run one document/PDF path if those engines are included;
  - check updater metadata behavior.
- Run the final Linux AppImage smoke test from the downloaded AppImage.
  - The WSL structural and launch checks above do not replace this manual smoke test because they do not prove a normal installed desktop workflow or user-driven conversion flow.
- After those two manual checks pass, update `docs/V1_0_6_VALIDATION.md` from pending to success for the manual smoke tests before treating v1.0.6 as fully release-ready.

## Publication Steps After Manual Smoke Tests

Do not run these steps until the clean-Mac DMG smoke test and Linux AppImage smoke test have both passed.

1. Create or edit the GitHub release `v1.0.6` as a draft with the body from `docs/RELEASE_NOTES_V1.0.6_DESKTOP.md`.

2. Pre-upload the verified macOS and Linux platform assets that the `Release` workflow expects to find on the draft release:

```powershell
$assetDir = "$env:LOCALAPPDATA\Temp\mc-release-assets\v1.0.6-desktop"
gh release upload v1.0.6 `
  "$assetDir\Multi-Converter_1.0.6_macos-universal.dmg" `
  "$assetDir\Multi-Converter_1.0.6_macos-universal.app.tar.gz" `
  "$assetDir\Multi-Converter_1.0.6_macos-universal.app.tar.gz.sig" `
  "$assetDir\Multi-Converter_1.0.6_linux-x64.AppImage" `
  "$assetDir\Multi-Converter_1.0.6_linux-x64.AppImage.sig" `
  --repo Amix29/Multi-Converter --clobber
```

3. Run the manual GitHub Actions `Release` workflow on `codex/test` with `include_macos=true` and `include_linux=true`.

4. Confirm the workflow republishes the exact 13-asset desktop set and verifies the published release asset list.

5. Only after that workflow succeeds, publish the draft release or mark it as the latest public release if the workflow has not already done so.

## Do Not Upload

Do not manually upload extra assets such as `.deb`, `.rpm`, tarballs, portable folders, `.dmg.sig`, `.app.tar.gz.sha256`, duplicate Linux updater aliases, source archives, logs or engine archives. GitHub-generated source code links are separate from application assets and do not count against the required application asset list.
