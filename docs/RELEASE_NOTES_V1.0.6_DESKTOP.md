# Multi-Converter v1.0.6

Multi-Converter v1.0.6 is a reliability update focused on safer document conversions, stronger platform builds and clearer release checks.

## Highlights

- Fixed DOCX conversions to plain text-style formats such as TXT, Markdown, CSV, JSON and XML when the source document contains complex content like tables, images or embedded objects.
- Added a safer text fallback for readable documents when a richer external document engine cannot finish a layout-free conversion.
- Prepared Windows x64, macOS universal and Linux x64 release builds through the platform release workflows.
- Strengthened release readiness checks for v1.0.6 so platform release gates use current validation evidence.

## Download And Installation

- Windows x64: download `Multi-Converter_1.0.6_x64-setup.exe`, or use the stable latest alias `Multi-Converter_windows-x64_setup.exe`.
- macOS: download `Multi-Converter_1.0.6_macos-universal.dmg`, or use the stable latest alias `Multi-Converter_macos-universal.dmg`. This is one universal DMG for Apple Silicon and Intel Macs.
- The macOS build is not Apple-signed and is not notarized. On first launch, open the app once, go to `System Settings > Privacy & Security`, choose `Open Anyway`, then confirm `Open`. This approval is normally needed only once for that downloaded app copy or after installing a new version.
- Linux x64: download `Multi-Converter_1.0.6_linux-x64.AppImage`, or use the stable latest alias `Multi-Converter_linux-x64.AppImage`.
- macOS automatic updates are enabled through `latest.json` when this full desktop release asset set is published.
- Linux automatic updates are enabled through `latest.json` when this full desktop release asset set is published.
- Windows automatic updates remain enabled through `latest.json`.
- Conversions still run locally on your computer. Multi-Converter does not upload your files.

## Validation

- TypeScript, i18n, bundled-engine, embedded-manifest, release-asset contract, production-config and secret-leak checks passed with `npm run check`.
- Rust unit tests passed with `npm run test:rust`.
- The local conversion matrix passed with `npm run test:conversions`.
- Rust formatting and Clippy passed with `npm run fmt:rust:check` and `npm run clippy:rust`.
- PDFium wrapper tests and Clippy checks passed with `npm run test:pdfium-wrapper` and `npm run clippy:pdfium-wrapper`.
- The production web bundle passed with `npm run build`.
- The Windows x64 Tauri build completed and produced the updater signature for `Multi-Converter_1.0.6_x64-setup.exe`.
- The macOS conversion matrix passed on Apple Silicon and Intel runners.
- macOS DMG verification passed; the universal DMG was verified on macOS for Apple Silicon and Intel.
- Linux AppImage verification passed; the x64 AppImage was verified on Linux with real Linux sidecars and bundled engines.

## Formats And Conversions

- DOCX files with tables, images or embedded objects now use integrated text extraction for layout-free outputs, so useful text is preserved instead of failing because a layout-aware engine could not simplify the document.
- TXT, Markdown, CSV, JSON and XML outputs are covered for the complex DOCX path.
- DOCX text extraction now also reads useful header, footer, footnote, endnote and comment text.
- Rich layout conversions still use the best available document engine when layout fidelity matters.

## Performance And Reliability

- Document conversions can fall back to the integrated text pipeline when LibreOffice or Pandoc fails and the target format can be produced safely from readable text.
- Table and line boundaries in DOCX text extraction are handled more cleanly for layout-free outputs.
- Platform release workflows now avoid pulling Windows-only Git LFS sidecars during macOS and Linux validation, reducing release-build fragility when those platforms use staged sidecars and engines.

## Security And Privacy

- The production config check passed and keeps frontend environment exposure narrow.
- The secret leak scan passed for tracked project files.
- A final diff-scoped Codex Security pass found no personal or confidential information exposure in the v1.0.6 public changes.
- The local-first privacy promise is unchanged: files are converted on the user's machine.

## Compatibility

- Windows support remains Windows x64.
- macOS support is delivered as one universal DMG for Apple Silicon and Intel Macs.
- Linux support is delivered as one x64 AppImage.

## Known Limitations

- The macOS build is not Apple-signed and not notarized, so macOS may require the first-launch approval flow described above.
- Final publication should still use the exact verified release assets from the platform workflows and the matching `latest.json` generated from those files.

## Developer And Build Notes

- Version files are synchronized at `1.0.6` across `package.json`, `package-lock.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock` and `src-tauri/tauri.conf.json`.
- The GitHub release preflight now uses the v1.0.6 readiness gate for platform releases.
- The full desktop release asset set is expected to contain exactly 13 application assets: Windows installer files, macOS universal DMG and updater archive files, Linux AppImage files and one shared `latest.json`.
