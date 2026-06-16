# Multi-Converter v1.0.6

Multi-Converter v1.0.6 is a reliability update focused on safer document conversions and stronger release checks. 🛠️

## Highlights

- 📝 Fixed DOCX conversions to plain text-style formats such as TXT, Markdown, CSV, JSON and XML when the source document contains complex content like tables, images or embedded objects.
- 🛟 Added a safer text fallback for readable documents when a richer external document engine cannot finish a conversion.
- ✅ Strengthened release readiness checks for v1.0.6 so platform release gates no longer depend on old v1.0.5 status evidence.

## Download And Installation

- 🪟 Windows x64: download `Multi-Converter_1.0.6_x64-setup.exe`, or use the stable latest alias `Multi-Converter_windows-x64_setup.exe`.
- 🔄 Automatic updates for Windows are enabled through the updater metadata in `latest.json`.
- 🏠 Conversions still run locally on your computer. Multi-Converter does not upload your files.

## Validation

- ✅ TypeScript, i18n, bundled-engine, embedded-manifest, release-asset contract, production-config and secret-leak checks passed with `npm run check`.
- Rust unit tests passed with `npm run test:rust`.
- The local conversion matrix passed with `npm run test:conversions`.
- Rust formatting and Clippy passed with `npm run fmt:rust:check` and `npm run clippy:rust`.
- The production web bundle passed with `npm run build`.
- The Windows x64 Tauri build completed and produced the signed updater artifact for `Multi-Converter_1.0.6_x64-setup.exe`.

## Formats And Conversions

- 📝 DOCX files with tables, images or embedded objects now use integrated text extraction for layout-free outputs, so useful text is preserved instead of failing because a layout-aware engine could not simplify the document.
- TXT, Markdown, CSV, JSON and XML outputs are covered for the complex DOCX path.
- Rich layout conversions still use the best available document engine when layout fidelity matters.

## Performance And Reliability

- 🛟 Document conversions can fall back to the integrated text pipeline when LibreOffice or Pandoc fails and the target format can be produced safely from readable text.
- DOCX text extraction now also reads useful header and footer text and handles table boundaries more cleanly.

## Security And Privacy

- 🔒 The production config check passed and keeps frontend environment exposure narrow.
- The secret leak scan passed for tracked project files.
- The local-first privacy promise is unchanged: files are converted on the user's machine.

## Developer And Build Notes

- Version files are synchronized at `1.0.6` across `package.json`, `package-lock.json`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock` and `src-tauri/tauri.conf.json`.
- The GitHub release preflight now uses the v1.0.6 readiness gate for platform releases.
