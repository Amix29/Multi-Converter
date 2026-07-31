# Testing

Require evidence from the runtime that owns the behavior being changed.

## When this applies

- Code, conversion, editor, OCR, packaging, workflow or release-gate changes.
- Any claim that a format, platform or interaction works.

## Rules

- Read `docs/TESTING.md` before changing tests, workflows or validation coverage.
- Vite uses a mock API; it cannot prove real imports, exports, file access, persistence, sidecars, OCR or updater behavior.
- Use Tauri or Rust tests for real conversion and file-system behavior.
- `npm run test:rust` skips the heavy conversion matrix; run `npm run test:conversions` before claiming complete conversion coverage.
- Editor changes require `npm run test:editor`, `npm run test:ui-layout`, typechecking and rendered UI inspection.
- Changes under `site/` or to its Pages workflow require `npm run site:check`.
- Windows, macOS and Linux claims require validation on the named target operating system.
- Compile-only sidecars, static packaging contracts and Vite previews must be labelled as limited evidence.
- Keep OCR unavailable until real packaged `PP-OCRv6_medium` fixtures, cancellation, cleanup and offline behavior pass.

## Main gates

```text
npm run check
npm run test:editor
npm run fmt:rust:check
npm run clippy:rust
npm run test:rust
npm run test:conversions
npm run test:pdfium-wrapper
npm run build
```
