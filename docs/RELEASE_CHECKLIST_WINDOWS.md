# Windows x64 Release Checklist

## Required Checks

```powershell
npm ci
npm run typecheck
npm run validate:i18n
npm run validate:bundled-engines
npm run validate:embedded-manifest
npm run validate:engines
npm run fmt:rust:check
npm run clippy:rust
npm run test:rust
npm run test:pdfium-wrapper
npm run clippy:pdfium-wrapper
npm run test:conversions
npm run build
npm run tauri:build
npm run validate:release-assets -- --version X.Y.Z --dir "$env:LOCALAPPDATA\Temp\mc-release-assets\vX.Y.Z"
```

## Engine Compliance

- Confirm `ffmpeg -version` and `ffprobe -version` show `8.1.1-essentials_build-www.gyan.dev`.
- Confirm their configuration includes `--enable-gpl`.
- Keep FFmpeg/ffprobe license and source/build links in release notes.
- Confirm advanced engine ZIP URLs in `src-tauri/engines-manifest.json` return HTTP 200.
- Confirm each manifest SHA-256 matches the uploaded ZIP.
- Confirm each engine ZIP contains `engine.json`, licenses, notices, and declared binaries.

## Repository Hygiene

- Ensure ignored local outputs are not staged: `dist/`, `dist-engines*/`, `engine-sources/`, `tmp/`, `test-results/`, logs, and Playwright artifacts.
- Publish assets from a clean release asset folder, not directly from a Tauri bundle directory that may still contain older versions.
- Confirm the clean release asset folder contains exactly `latest.json`, the versioned setup `.exe`, its `.sig`, its `.sha256`, and `Multi-Converter_windows-x64_setup.exe`.
- Confirm `README.md`, `NOTICE`, `SECURITY.md`, and `CONTRIBUTING.md` are present.
- Tag only after the NSIS installer has been smoke-tested on a clean Windows user profile.
