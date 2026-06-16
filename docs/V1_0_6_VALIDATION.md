# Multi-Converter v1.0.6 Validation Evidence

This file records validation evidence for the in-progress v1.0.6 release. It is not a public release approval by itself.

## Local Windows Validation

- `npm run test:rust`: passed on 2026-06-16 after the DOCX text extraction fix.
- `npm run test:conversions`: passed on 2026-06-16 after the DOCX text extraction fix.
- `npm run fmt:rust:check`: passed on 2026-06-16.
- `npm run clippy:rust`: passed on 2026-06-16.
- `npm run test:pdfium-wrapper`: passed on 2026-06-16.
- `npm run clippy:pdfium-wrapper`: passed on 2026-06-16.
- `npm run check`: passed on 2026-06-16 after the V1.0.6 status gate and final security evidence were wired.
- `npm run build`: passed on 2026-06-16.
- `npm run tauri:build`: passed on 2026-06-16 for Windows x64.

## macOS Release Evidence

- macOS Conversion Matrix (Apple Silicon): success on 2026-06-16 in GitHub Actions run `27614880496` on commit `cfa9f1b3`.
- macOS Conversion Matrix (Intel): success on 2026-06-16 in GitHub Actions run `27614880496` on commit `cfa9f1b3`.
- macOS DMG verification (Apple Silicon): success on 2026-06-16 in GitHub Actions run `27615775974` on commit `cfa9f1b3`.
- macOS DMG verification (Intel): success on 2026-06-16 in GitHub Actions run `27615775974` on commit `cfa9f1b3`.
- macOS release artifact: `macos-release-artifacts`, artifact ID `7666472580`, size `2661378716` bytes, GitHub Actions artifact zip SHA-256 `a36b4acc7f40b3f18ac2d725386a47e1dfe88b8390173398b1b5ac52d6cadf1f`.
- Downloaded macOS files were hash-checked locally on Windows on 2026-06-16. SHA-256 `Multi-Converter_1.0.6_macos-universal.dmg`: `d966bc73247b0ee77431443d30c19f9a2ca9b5a9aff7aa120f3288fcf8cf3c88`.
- Downloaded macOS updater archive SHA-256 `Multi-Converter_1.0.6_macos-universal.app.tar.gz`: `128aadef0348dcbecaa83c804d4aed37c096e42fbeb162dbdfbad11334abcd72`.
- Manual clean-Mac smoke testing: pending.

## Linux Release Evidence

- Linux AppImage Build: success on 2026-06-16 in GitHub Actions run `27615778303` on commit `cfa9f1b3`.
- Linux Conversion Matrix: success on 2026-06-16 as part of GitHub Actions run `27615778303` on commit `cfa9f1b3`.
- Linux AppImage Verification: success on 2026-06-16 in GitHub Actions run `27615778303` on commit `cfa9f1b3`.
- Linux release artifact: `linux-release-artifacts`, artifact ID `7666415187`, size `1079168021` bytes, GitHub Actions artifact zip SHA-256 `8c79dd75bb4c648288ca8601dea1b7987e42236b5cac67eb835a3a4d6398be7e`.
- Downloaded Linux files were hash-checked locally on Windows on 2026-06-16. SHA-256 `Multi-Converter_1.0.6_linux-x64.AppImage`: `8d31bfa9850cc3f1ae4f92fe14c4b74eeb72f2b5e74111e05186a3c8654cea4e`.
- Manual Linux AppImage smoke testing: pending.

## Security And Confidentiality Evidence

- `npm run test:secret-leaks`: passed on 2026-06-16 during `npm run check`.
- `npm run test:production-config`: passed on 2026-06-16 during `npm run check`.
- Additional tracked-file confidentiality search: passed on 2026-06-16. Only expected GitHub Actions `${{ secrets.* }}` references, environment variable reads without values, test patterns and historical documentation were found.
- Final Codex Security pass: passed on 2026-06-16. Scope: diff-scoped Codex Security review of the V1.0.6 code, release-gate and release-note changes plus configured secret/production scans.
- Confidential information exposure: none found in the local configured scans, tracked-file confidentiality search and final diff-scoped Codex Security pass.

## Release Asset Evidence

- Windows release assets: prepared and validated on 2026-06-16 with `npm run validate:release-assets -- --version 1.0.6 --platform windows`.
  - Clean folder: `%LOCALAPPDATA%\Temp\mc-release-assets\v1.0.6`
  - SHA-256 `Multi-Converter_1.0.6_x64-setup.exe`: `63d1dab699e36c918cda3dcb1c07656a2e02fcfb74a871025cc80b7b9643c7a3`
- macOS release assets: prepared and verified by GitHub Actions run `27615775974`, downloaded locally, and included in the validated desktop release asset folder.
- Linux release assets: prepared by GitHub Actions run `27615778303`, downloaded locally to `%LOCALAPPDATA%\Temp\mc-release-assets\v1.0.6\linux-download`, and hash-checked on 2026-06-16.
- Full desktop release assets: prepared in `%LOCALAPPDATA%\Temp\mc-release-assets\v1.0.6-desktop` and validated on 2026-06-16 with `node scripts/validate-release-assets.mjs --version 1.0.6 --platform desktop --macos-dmg-sha256 d966bc73247b0ee77431443d30c19f9a2ca9b5a9aff7aa120f3288fcf8cf3c88 --macos-updater-sha256 128aadef0348dcbecaa83c804d4aed37c096e42fbeb162dbdfbad11334abcd72 --linux-appimage-sha256 8d31bfa9850cc3f1ae4f92fe14c4b74eeb72f2b5e74111e05186a3c8654cea4e`.
