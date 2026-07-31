# Multi-Converter v1.0.6 Validation Evidence

This file records the final validation evidence for the v1.0.6 release.

## Final-Source Local Windows Validation

- `npm run check`: passed on 2026-07-09, including translations, production configuration, secret scanning, platform packaging contracts, workflow contracts and release-asset tests.
- `npm run fmt:rust:check` and `npm run clippy:rust`: passed on 2026-07-09.
- `npm run test:rust`: passed on 2026-07-09 with 77 passed, 0 failed and 6 conversion-matrix tests intentionally ignored by this command.
- `npm run test:conversions`: passed on 2026-07-09 with all 6 full-matrix tests passed.
- `npm run test:pdfium-wrapper`: passed on 2026-07-09 with all 5 runtime tests passed.
- `npm run clippy:pdfium-wrapper`: passed on 2026-07-09.
- `npm run build`: passed on 2026-07-09.
- `npm run tauri:build`: passed on 2026-07-09 and generated the Windows x64 NSIS installer plus updater signature.
- `npm run test:windows:ci`: passed on 2026-07-09. All 13 ordered steps completed successfully in `tmp/windows-ci-gate-status.json`.
- `npm audit --omit=dev`: passed with 0 vulnerabilities.
- `npm run audit:rust`: passed with 0 denied runtime vulnerabilities and 19 allowed warning-category advisories. At release-validation time, `RUSTSEC-2026-0194` and `RUSTSEC-2026-0195` were temporarily acknowledged only for the build-time `wayland-scanner 0.31.10` proc-macro; the later V1.0.7 development lockfile moved to the patched scanner and removed those exceptions.
- Playwright frontend QA: passed on 2026-07-09 at 1440x900 and 390x844 with 0 console errors and 0 console warnings. The Files screen rendered without a clipboard button or visible mobile overflow.
- Regression coverage includes complex DOCX layout-free extraction, complex PDF-to-Markdown table reconstruction, bounded local clipboard files and drop/paste step restrictions.

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

- macOS Conversion Matrix (Apple Silicon): success on 2026-07-10 in GitHub Actions run `29052945332` on commit `33ba006b`.
- macOS Conversion Matrix (Intel): success on 2026-07-10 in GitHub Actions run `29052945332` on commit `33ba006b`.
- macOS DMG verification (Apple Silicon): success on 2026-07-10 in GitHub Actions run `29052946761` on commit `33ba006b`.
- macOS DMG verification (Intel): success on 2026-07-10 in GitHub Actions run `29052946761` on commit `33ba006b`.
- macOS release artifact: `macos-release-artifacts`, artifact ID `8213016442`, size `2657339578` bytes.
- SHA-256 `Multi-Converter_1.0.6_macos-universal.dmg`: `f6978d93278a142c98c23a655059b77b5ed68fdc6b2408296f2df1ae8cd3421f`.
- SHA-256 `Multi-Converter_1.0.6_macos-universal.app.tar.gz`: `0b0e95fd7cefe5885a587dac6e7a0a4069b7c36b59331518cf18184a0111abdc`.
- Manual clean-Mac smoke testing: success on 2026-07-10, confirmed by the maintainer for the final downloaded draft DMG. The confirmation covers DMG mount, drag to Applications, the expected unsigned/not-notarized Gatekeeper warning, `System Settings > Privacy & Security > Open Anyway`, confirmation with `Open`, normal second launch, file selection, a base media conversion, a document/PDF conversion and updater metadata behavior.

## Linux Release Evidence

- Linux AppImage Build: success on 2026-07-10 in GitHub Actions run `29052948091` on commit `33ba006b`.
- Linux Conversion Matrix: success on 2026-07-10 as part of GitHub Actions run `29052948091` on commit `33ba006b`.
- Linux AppImage Verification: success on 2026-07-10 in GitHub Actions run `29052948091` on commit `33ba006b`.
- Linux release artifact: `linux-release-artifacts`, artifact ID `8212865700`, size `1078842855` bytes.
- SHA-256 `Multi-Converter_1.0.6_linux-x64.AppImage`: `aa743940ed29e7426877f82b54e951681697906a5c1750dca8aee5b973093fce`.
- Manual Linux AppImage smoke testing: success on 2026-07-10, confirmed by the maintainer for the final downloaded draft AppImage. The confirmation covers executable permission, normal desktop launch, file selection, conversion and output access.

## Security And Confidentiality Evidence

- `npm run test:secret-leaks`: passed on 2026-06-16 during `npm run check`.
- `npm run test:production-config`: passed on 2026-06-16 during `npm run check`.
- Additional tracked-file confidentiality search: passed on 2026-06-16. Only expected GitHub Actions `${{ secrets.* }}` references, environment variable reads without values, test patterns and historical documentation were found.
- Final Codex Security pass: passed on 2026-06-16. Scope: diff-scoped Codex Security review of the V1.0.6 code, release-gate and release-note changes plus configured secret/production scans.
- Confidential information exposure: none found in the local configured scans, tracked-file confidentiality search and final diff-scoped Codex Security pass.

## Release Asset Evidence

- Windows release assets: prepared and validated on 2026-07-10. SHA-256 `Multi-Converter_1.0.6_x64-setup.exe`: `4d33813ea175cf66f15202dfc204328d841b2b8829ba4eab57ba2c8ca406d73a`.
- macOS release assets: prepared and verified by GitHub Actions run `29052946761`, downloaded and hash-checked locally.
- Linux release assets: prepared and verified by GitHub Actions run `29052948091`, downloaded and hash-checked locally.
- Full desktop release assets: prepared in `%LOCALAPPDATA%\Temp\mc-release-assets\v1.0.6-final-desktop` and validated on 2026-07-10 with `npm run validate:release-assets -- --version 1.0.6 --platform desktop --macos-dmg-sha256 f6978d93278a142c98c23a655059b77b5ed68fdc6b2408296f2df1ae8cd3421f --macos-updater-sha256 0b0e95fd7cefe5885a587dac6e7a0a4069b7c36b59331518cf18184a0111abdc --linux-appimage-sha256 aa743940ed29e7426877f82b54e951681697906a5c1750dca8aee5b973093fce`.
- GitHub draft `v1.0.6`: exactly 13 application assets, with every remote size and digest matching the validated local desktop folder before publication.
