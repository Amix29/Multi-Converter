# Multi-Converter v1.0.6

Multi-Converter v1.0.6 makes importing files easier and improves complex document conversions on Windows. ✨

## Highlights

- 📋 Paste text, images, audio or video directly into Multi-Converter with `Ctrl+V`, then convert it like any other imported file.
- 📝 Complex DOCX files containing tables, images or embedded objects can now be converted to layout-free formats without losing their useful text.
- 📊 PDF-to-Markdown now preserves extractable text and reconstructs repeated table-like rows, even when a PDF also contains images or signature fields.
- 🎯 Drag-and-drop imports are now accepted only during the Files and Formats steps.

## Download And Installation

- 🪟 Windows x64: download `Multi-Converter_1.0.6_x64-setup.exe`, or use `Multi-Converter_windows-x64_setup.exe` for the stable latest download.
- 🔄 Automatic updates remain available through the Windows x64 entry in `latest.json`.
- 🏠 Conversions and clipboard imports stay on your computer; files are not uploaded.

## Validation

- ✅ TypeScript, translations, production configuration, secret scanning, packaging contracts and release-asset contracts passed the local release checks.
- 77 Rust unit tests and the complete conversion matrix passed, including regressions for complex DOCX, complex PDF-to-Markdown and clipboard-backed files.
- Rust formatting, Clippy, PDFium wrapper runtime tests and the production web build passed.
- The Windows x64 Tauri installer is rebuilt from the final v1.0.6 source before release-asset validation.

## What's New

- 📋 Clipboard import works without a dedicated button while the Files or Formats step is active.
- Native file paths are reused when available; text and in-memory media are saved temporarily on the local machine before analysis.

## Formats And Conversions

- Complex DOCX extraction now preserves readable body and table text plus useful header, footer, footnote, endnote and comment content.
- PDF-to-Markdown reconstructs consistent repeated columns as Markdown tables.
- Readable documents can use the integrated text fallback when a compatible layout-free conversion cannot be completed by LibreOffice or Pandoc.

## Interface And Usability

- 🎯 Drag-and-drop events are ignored after the Formats step.
- Clipboard shortcuts do not intercept editable fields.

## Performance And Reliability

- In-memory clipboard items larger than 128 MB are rejected before a second full byte buffer is allocated.
- Temporary clipboard imports use bounded file counts, safe filenames and startup cleanup.
- GitHub build and release jobs restore verified sidecars without depending on Git LFS downloads.

## Fixes

- Fixed complex DOCX conversions that previously failed or produced unusable layout-free output when tables, images, 3D models or other embedded objects were present.
- Fixed accidental file imports caused by dropping files during the Output step or after the import workflow had ended.
- Fixed PDF-to-Markdown conversion for readable complex PDFs by preserving text around tables, images and signature fields and rebuilding consistent table rows.

## Security And Privacy

- 🔒 Clipboard content is written only to a local temporary folder and is never uploaded.
- Production configuration and tracked-file secret scans passed for the release changes.
- Newly published RustSec advisories in PDF parsing and shared dependencies were resolved by updating `pdf-extract`, `lopdf`, Tauri and their dependency chain.

## Known Limitations

- ⚠️ PDF-to-Markdown does not reproduce image pixels, exact page layout or cryptographic signature data, and scanned-only PDFs require OCR first.
- Raw in-memory clipboard items are limited to 128 MB each.

## Developer And Build Notes

- Version metadata is synchronized at `1.0.6` across npm, Cargo and Tauri configuration files.
- The Windows-only release asset contract contains exactly five application assets, including `latest.json` and the stable installer alias.
