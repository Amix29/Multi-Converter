# Product Constraints

Preserve Multi-Converter's local, private and open-source product contract.

## When this applies

- Conversion, editor, OCR, storage, clipboard, networking or dependency work.
- Any user-facing compatibility or privacy claim.

## Rules

- **CRITICAL**: user files, document content, images and recognized OCR text stay on the device.
- Never add cloud conversion, cloud OCR, silent uploads or runtime model downloads.
- The public baseline is V1.0.6; V1.0.7 remains blocked until both editor and OCR gates close.
- Keep npm, Cargo and Tauri development metadata synchronized at `1.0.7`, following the maintainer decision recorded in the V1.0.7 ledger. This is not release authorization.
- The editor uses only the MIT Tiptap/ProseMirror packages and rejects Tiptap Pro or Cloud.
- Persist editor content as versioned Tiptap JSON and images as validated `mc-asset://<uuid>` assets.
- Rich DOCX and RTF import passes through LibreOffice to ODT, then the bounded ODT parser; never route Office documents through HTML.
- DOCX export maps `EditorDocumentV1` directly to `docx.js` OOXML and publishes it through the bounded atomic Rust writer. ODT remains direct; RTF and document-to-PDF keep the local LibreOffice bridge.
- V1.0.7 OCR uses packaged local `PP-OCRv6_medium`; do not substitute another tier or a remote API silently.
- Ordinary documents use `EditorDocumentV1`. Imported PDFs use the separate versioned `PdfEditorSessionV1` structural model backed by PDFium; scanned pages may add local OCR text layers without flattening the PDF into Tiptap.
- PDF editing must enforce source SHA-256 identity, PDF permissions and DocMDP. It never executes JavaScript, Launch actions, XFA, 3D or media and never edits the source in place.
- A failed rich import or OCR job must report the failure and preserve the original file.
- Deleting a recent draft never deletes its imported source file.

## Sources

- `docs/V1_0_7_PLAN.md`
- `docs/V1_0_7_OCR.md`
- `docs/V1_0_7_VALIDATION.md`
