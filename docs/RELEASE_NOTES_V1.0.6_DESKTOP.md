# Multi-Converter v1.0.6

Multi-Converter v1.0.6 makes importing files easier and improves complex document conversions across Windows, macOS and Linux. ✨

## Highlights

- 📋 Paste text, images, audio or video directly into Multi-Converter with `Ctrl+V` on Windows/Linux or `Cmd+V` on macOS, then convert it like any other imported file.
- 📝 Complex DOCX files containing tables, images or embedded objects can now be converted to layout-free formats such as TXT, Markdown, CSV, JSON and XML without losing their useful text.
- 📊 PDF-to-Markdown conversion now preserves extractable text and reconstructs repeated table-like rows, even when the PDF also contains images or signature fields.
- 🎯 Drag-and-drop imports are now accepted only during the Files and Formats steps, preventing accidental imports later in the workflow.

## Download And Installation

- 🪟 Windows x64: download `Multi-Converter_1.0.6_x64-setup.exe`, or use `Multi-Converter_windows-x64_setup.exe` for the stable latest download.
- 🍎 macOS: download `Multi-Converter_1.0.6_macos-universal.dmg`, or use `Multi-Converter_macos-universal.dmg`. The same DMG supports Apple Silicon and Intel Macs.
- 🔐 The macOS build is not Apple-signed and is not notarized. After the first launch warning, open `System Settings > Privacy & Security`, choose `Open Anyway`, then confirm `Open`. This is normally required only once for each downloaded app copy.
- 🐧 Linux x64: download `Multi-Converter_1.0.6_linux-x64.AppImage`, or use `Multi-Converter_linux-x64.AppImage` for the stable latest download.
- 🔄 Windows automatic updates remain enabled through `latest.json`.
- 🔄 macOS automatic updates are enabled through the universal updater archive referenced by `latest.json`.
- 🔄 Linux automatic updates are enabled through the signed AppImage referenced by `latest.json`.
- 🏠 Conversions and clipboard imports stay on your computer; files are not uploaded.

## Validation

- ✅ TypeScript, translations, production configuration, secret scanning, packaging contracts and release-asset contracts passed the local release checks.
- 77 Rust unit tests passed, including regression tests for complex DOCX, complex PDF-to-Markdown and clipboard-backed local files.
- The complete local conversion matrix passed for integrated images, documents, audio, video and extraction targets.
- Rust formatting and Clippy passed for the Tauri application and PDFium wrapper.
- All 5 PDFium wrapper runtime tests passed, including page counting and rendering.
- The production web bundle and Windows x64 Tauri package are rebuilt from the final v1.0.6 source before asset assembly.
- The macOS Conversion Matrix passed on Apple Silicon and Intel runners. macOS DMG verification passed on macOS for both Apple Silicon and Intel.
- The Linux Conversion Matrix passed with real Linux engines. Linux AppImage verification passed on Linux x64.

## What's New

- 📋 Clipboard import works without a dedicated button: paste while the Files or Formats step is active.
- Native clipboard file paths are reused when available. Text and in-memory media are written to temporary local files before analysis and cleaned up by the app.
- Text, PNG, JPEG, GIF, WebP, BMP, TIFF, MP3, WAV, OGG, FLAC, M4A, MP4, MOV, WebM and MKV clipboard content receive a suitable local filename when the clipboard does not provide one.

## Formats And Conversions

- 📝 Complex DOCX extraction now preserves readable body text, table boundaries, headers, footers, footnotes, endnotes and comments while ignoring non-text object placeholders.
- Layout-free DOCX targets use the integrated text pipeline instead of requiring a layout-aware external engine.
- 📊 PDF-to-Markdown detects repeated columns separated by tabs or spacing and writes valid Markdown table rows when the extracted structure is consistent.
- Readable document conversions can use the integrated text fallback when LibreOffice or Pandoc cannot complete a compatible layout-free conversion.

## Interface And Usability

- 🎯 Native and HTML drag-and-drop events are ignored after the Formats step.
- Clipboard shortcuts do not intercept text fields, text areas, selectors or editable content.

## Performance And Reliability

- In-memory clipboard items larger than 128 MB are rejected before the browser allocates a second full byte buffer.
- Temporary clipboard imports use bounded file counts, safe local filenames and startup cleanup.
- GitHub build and release jobs no longer depend on Git LFS downloads; verified platform sidecars and engines are restored through the existing preparation workflows.
- The macOS packaging workflow verifies that the generated DMG contains the universal application bundle before it can become a release asset.

## Fixes

- Fixed complex DOCX conversions that previously failed or produced unusable layout-free output when tables, images, 3D models or other embedded objects were present.
- Fixed accidental file imports caused by dropping files during the Output step or after the import workflow had ended.
- Fixed the macOS release handoff so a DMG cannot pass verification unless it contains a non-empty universal application bundle for Apple Silicon and Intel.
- Fixed PDF-to-Markdown conversion for readable complex PDFs by preserving text around tables, images and signature fields and rebuilding consistent table rows.

## Security And Privacy

- 🔒 Clipboard content is saved only to a temporary folder on the local machine and is never sent to a conversion service.
- Production configuration and tracked-file secret scans passed for the release changes.
- Clipboard filenames are sanitized before local files are created, and import size/count limits are enforced in the Rust backend.
- Newly published RustSec advisories in PDF parsing and shared dependencies were resolved by updating `pdf-extract`, `lopdf`, Tauri and their dependency chain.

## Compatibility

- Windows support remains x64.
- macOS is delivered as one universal DMG for Apple Silicon and Intel Macs.
- Linux is delivered as one x64 AppImage.

## Known Limitations

- ⚠️ PDF-to-Markdown is text-first. It does not reproduce image pixels, exact page layout or cryptographic signature data, and scanned-only PDFs still require OCR before their text can be converted.
- The macOS build is not Apple-signed or notarized and therefore requires the first-launch approval described above.
- Raw in-memory clipboard items are limited to 128 MB each; copying an existing file by path avoids loading the entire file into clipboard memory when the operating system exposes that path.

## Developer And Build Notes

- Version metadata is synchronized at `1.0.6` across npm, Cargo and Tauri configuration files.
- The full desktop release contains exactly 13 application assets: Windows installer files, the universal macOS DMG and updater archive, the Linux AppImage files, and one shared `latest.json`.
- Build and Release workflow checkout contracts now enforce `lfs: false` so exhausted repository LFS bandwidth cannot block verified release preparation.
- At publication time, two `quick-xml` denial-of-service advisories were explicitly acknowledged only in the build-time Wayland protocol generator; that code did not parse application or user XML at runtime. The later V1.0.7 development lockfile moved to the patched `wayland-scanner` release and removed those exceptions.
