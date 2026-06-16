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

- macOS Conversion Matrix (Apple Silicon): pending.
- macOS Conversion Matrix (Intel): pending.
- macOS DMG verification (Apple Silicon): pending.
- macOS DMG verification (Intel): pending.
- Manual clean-Mac smoke testing: pending.

## Linux Release Evidence

- Linux AppImage Build: pending.
- Linux Conversion Matrix: pending.
- Linux AppImage Verification: pending.
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
- macOS release assets: pending.
- Linux release assets: pending.
