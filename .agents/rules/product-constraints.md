# Product Constraints

Preserve Multi-Converter's local, private and open-source product contract.

## When this applies

- Conversion, editor, OCR, storage, clipboard, networking or dependency work.
- Any user-facing compatibility or privacy claim.

## Rules

- **CRITICAL**: user files, document content, images and recognized OCR text stay on the device.
- Never add cloud conversion, cloud OCR, silent uploads or runtime model downloads.
- The public baseline is V1.0.6; V1.0.7 remains blocked until both editor and OCR gates close.
- Keep npm, Cargo and Tauri version metadata at `1.0.6` until the V1.0.7 validation ledger permits the bump.
- The editor uses only the MIT Tiptap/ProseMirror packages and rejects Tiptap Pro or Cloud.
- Persist editor content as versioned Tiptap JSON and images as validated `mc-asset://<uuid>` assets.
- Rich DOCX and RTF import passes through LibreOffice to ODT, then the bounded ODT parser; never route Office documents through HTML.
- Office and PDF editor exports originate from `EditorDocumentV1` through the rich ODT generator.
- V1.0.7 OCR uses packaged local `PP-OCRv6_medium`; do not substitute another tier or a remote API silently.
- PDF-to-editor OCR output enters `EditorDocumentV1`; do not create a parallel editor model.
- A failed rich import or OCR job must report the failure and preserve the original file.
- Deleting a recent draft never deletes its imported source file.

## Sources

- `docs/V1_0_7_PLAN.md`
- `docs/V1_0_7_OCR.md`
- `docs/V1_0_7_VALIDATION.md`
