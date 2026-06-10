# Contributing

Thanks for helping improve Multi-Converter.

## What Contributions Are For

Community contributions are welcome for:

- bug fixes;
- performance or reliability improvements;
- UI and accessibility improvements;
- translations;
- tests;
- documentation corrections;
- feature suggestions and focused feature pull requests.

Release preparation is handled by the project maintainers. Contributors are not expected to prepare new versions, installers, engine archives, release checksums, or release notes.

## Development Setup

```bash
npm install
npm start
```

Use `npm start` or `npm run tauri:dev` for the real desktop runtime. `npm run dev` only starts the Vite preview with mocked API behavior.

## Checks Before Pull Requests

Run the checks that match the files you changed. For most code changes:

```bash
npm run typecheck
npm run validate:i18n
npm run validate:embedded-manifest
npm run validate:bundled-engines
npm run test:rust
npm run test:pdfium-wrapper
```

For Rust formatting and linting:

```bash
npm run fmt:rust:check
npm run clippy:rust
npm run clippy:pdfium-wrapper
```

## Third-Party Engines

Do not commit generated engine archives, extracted bundled engines, local engine sources, or build caches. The Windows x64 FFmpeg/ffprobe sidecars and advanced conversion engines are intentionally bundled and must keep their license notices accurate. Advanced engine ZIPs may still be published through releases as verified build inputs.

Do not change engine versions, public engine URLs, generated manifests, release checksums, or release archive contents unless a maintainer explicitly asks for that work.
