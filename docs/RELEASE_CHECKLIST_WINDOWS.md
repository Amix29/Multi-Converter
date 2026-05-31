# Windows x64 Release Checklist

## Required Checks

```powershell
npm ci
npm run typecheck
npm run validate:i18n
npm run validate:bundled-base-engines
npm run validate:embedded-manifest
npm run validate:engines
npm run fmt:rust:check
npm run clippy:rust
npm run test:rust
npm run test:pdfium-wrapper
npm run clippy:pdfium-wrapper
npm run tauri:build
```

## Engine Compliance

- Confirm `ffmpeg -version` and `ffprobe -version` show `8.1.1-essentials_build-www.gyan.dev`.
- Confirm their configuration includes `--enable-gpl`.
- Keep FFmpeg/ffprobe license and source/build links in release notes.
- Confirm Quality Max ZIP URLs in `src-tauri/engines-manifest.json` return HTTP 200.
- Confirm each manifest SHA-256 matches the uploaded ZIP.
- Confirm each engine ZIP contains `engine.json`, licenses, notices, and declared binaries.

## Repository Hygiene

- Ensure ignored local outputs are not staged: `dist/`, `dist-engines*/`, `engine-sources/`, `tmp/`, `test-results/`, logs, and Playwright artifacts.
- Confirm `README.md`, `NOTICE`, `SECURITY.md`, and `CONTRIBUTING.md` are present.
- Tag only after the NSIS installer has been smoke-tested on a clean Windows user profile.
