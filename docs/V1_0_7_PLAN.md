# Multi-Converter V1.0.7 Development Plan

## Status

- Development version: **V1.0.7**
- Current published version: **V1.0.6**
- Last documentation review: **2026-08-01**
- Release status: **not ready**

V1.0.7 is built around two official product objectives:

1. add a local document editor powered by the open-source Tiptap/ProseMirror stack;
2. add local OCR powered by `PP-OCRv6_medium` for PDF-to-text conversion and text extraction from images.

The repository version remains `1.0.6` until both objectives are implemented, tested and accepted. Do not publish V1.0.7 release notes, updater metadata or release assets before the exit gates in this document pass.

Phase 6 quality/security work is implemented in its isolated checkpoint. It
adds source-size and bundle budgets, a reproducible OCR dependency lock, a
40-case corpus contract and a numbered security review. This checkpoint does
not make V1.0.7 release-ready: native macOS/Linux validation, the assumed but
unexecuted installed-Windows matrix, maintainer license approval and the
reviewed PDFium archive replacement remain open.

## Product Principles

- Files stay on the user's computer.
- Editing and OCR must work without an account or cloud service.
- Document contents, images and OCR results must never be uploaded.
- The editor uses only the MIT-licensed Tiptap/ProseMirror packages already declared by the project.
- The OCR target is the local `PP-OCRv6_medium` model. Do not replace it with a remote API.
- Vite mock behavior is useful for UI work but never proves real file import, export, OCR or persistence.
- Failed rich document imports or OCR jobs must return a visible error. They must not silently produce incomplete plain text.

## Workstream A — Document Editor

### Implemented

- Separate `Convertisseur | Éditeur` workspaces.
- One active editor document at a time.
- New document, open document and drag-and-drop entry points.
- Local recent documents with rename, duplicate and confirmed draft deletion.
- Tiptap JSON document model with schema versioning.
- Paginated editing canvas and DOM-independent pagination planner.
- Text styles, headings, fonts, sizes, colors, highlighting, alignment, lists, links, tables and local images.
- Page formats, orientation, margins, headers, footers and numbering.
- Local autosave and recent-document storage.
- Validated local image assets referenced as `mc-asset://<uuid>`.
- DOCX and RTF import through LibreOffice-to-ODT followed by the bounded ODT parser.
- Direct ODT parsing without Office-to-HTML routing.
- Office/PDF export through the rich ODT generator.
- TXT, Markdown and HTML adapters.
- UI regression protection for recent-document menus and full-viewport dialogs.

### Still required

- Complete the real Windows Tauri ODT/DOCX/RTF import → edit → export → reopen matrix.
- Confirm rich images, headers, footers, page numbers, merged cells, landscape layout and manual page breaks in real output files.
- Confirm native Tauri drag and drop.
- Confirm draft and `mc-asset://` image persistence after closing and restarting the packaged application.
- Confirm overwrite approval, external-source conflicts and original-file integrity after a forced failure.
- Confirm unsupported embedded objects create a compatibility warning and block unsafe replacement.
- Record fixtures, screenshots and SHA-256 values in `V1_0_7_EDITOR_VALIDATION.md`.

The editor gate must close before OCR implementation is treated as the active release workstream.

## Workstream B — Local OCR

### Implemented in the Phase 3 Windows checkpoint

- Locked five-module `PP-OCRv6_medium` model preparation with official origins,
  SHA-256 verification and per-file manifests.
- Supervised official CPU sidecar with one active job, persistent session
  worker, cancellation, crash recovery and bounded temporary files.
- Hybrid PDF page inspection, native extraction, selective 300-DPI OCR and
  text/editor serializers.
- Explicit image-text dialog, progress, cancellation, empty state and
  write-only text clipboard capability.
- Real Tauri development-runtime evidence for image, native/scanned/mixed PDF,
  editor import, cancellation, crash and retry.
- Extracted-NSIS packaged-resource smoke for PNG OCR, explicit copy,
  cancellation, worker termination and retry, with a measured Windows memory
  baseline.
- Exact runtime inventory covering 71 Python distributions and 105 embedded
  license files; the one missing `bce-python-sdk` license is a locked release
  blocker.
- Explicit selection of the official CPU sidecar; native ONNX and accelerators
  remain unselected unless they later pass every parity, size and speed gate.

### Still required for release

- Full reviewed multilingual and difficult-image corpus with threshold reports.
- Native ONNX or accelerator parity/size/speed measurements only if a candidate
  is proposed; none is selected in the current package.
- Complete redistribution approval and `NOTICE` after adding the missing
  `bce-python-sdk` license to the exact inventoried runtime.
- Packaged Windows NSIS offline matrix, followed by real macOS universal and
  Linux x64 runtime/package matrices.

### Phase 5 validation status

- A machine-checked Windows native ledger now defines 101 required installed
  scenarios and rejects extracted, online or current-profile evidence as final
  proof.
- The exact Phase 5 candidate passed the complete automated Windows gate and
  rendered on first and second extracted-package launches without `Ctrl+R`.
- Installation, offline execution and all converter/editor/OCR scenarios still
  require an interactive session in the dedicated clean Windows profile.
- By explicit maintainer decision, the remaining scenarios are assumed to work
  and Phase 5 is accepted as complete for sequencing into Phase 6. They remain
  unvalidated and must not be cited as release evidence.

### Required user outcomes

- Convert PDFs containing scanned or image-only pages into usable text formats.
- Copy text detected in a local image.
- Open a PDF in the document editor by converting recognized content into the existing Tiptap JSON model.
- Preserve readable page order and paragraph separation when the source makes them recoverable.
- Show progress, allow cancellation and report partial-page failures without hiding them.

### Selected model

- OCR family: PaddleOCR PP-OCRv6.
- Required tier: `PP-OCRv6_medium`.
- Execution: local only.
- Network use during recognition: forbidden.
- Model/runtime archives: pinned and checksum-verified before packaging.

The upstream PP-OCRv6 documentation describes tiny, small and medium tiers and identifies the medium pipeline as the default high-accuracy tier. Upstream also documents unified recognition for 50 languages in the medium model. Multi-Converter must advertise only the languages and platforms that its own packaged-runtime tests validate.

### Minimum V1.0.7 scope

- Input:
  - PDF;
  - PNG;
  - JPEG/JPG;
  - WebP;
  - TIFF/TIF;
  - BMP.
- OCR text outputs:
  - TXT;
  - Markdown;
  - HTML.
- Editor bridge:
  - OCR result → Tiptap JSON;
  - document can then use the editor's normal Save As and export paths.
- Clipboard:
  - copy recognized image text only after the user requests extraction;
  - no background clipboard monitoring.

### Out of scope

- Cloud OCR or account-based OCR.
- Handwriting guarantees.
- Pixel-perfect reconstruction of the original PDF.
- Automatic translation of recognized text.
- Training or fine-tuning PP-OCRv6.
- Claiming table, formula or layout fidelity that has not been measured.

The detailed OCR architecture and validation contract live in `V1_0_7_OCR.md`.

## Cross-Cutting Workstream C — Rust Backend Structure

The Phase 4 checkpoint reorganizes the existing native implementation around
the flow `Tauri commands -> business domains -> local infrastructure` while
keeping one crate and the current dependency graph.

Implemented in the checkpoint:

- lightweight Tauri composition root and commands split by responsibility;
- focused conversion modules for orchestration, media, images, documents, text
  and atomic output finalization;
- layered ODT package, XML, style, Tiptap, HTML and writer modules;
- separate engine catalogue, selection, process, distribution and registry
  responsibilities;
- bounded shared support for one-shot native processes while retaining the
  dedicated persistent OCR supervisor;
- no-replace atomic publication for conversion results and exclusive
  destination reservation for exports;
- pre-index entry-count and post-index size, ratio, name and duplicate limits
  for integrated DOCX, EPUB and ODT text archives;
- characterization tests for IPC serialization, registry and engine routing,
  fallbacks, archives, processes and representative outputs;
- a 500-non-blank-line hard guardrail for handwritten Rust, with an
  approximately 300-line soft target.

This workstream must not change conversion algorithms, output quality, formats,
engine resources, public commands, persistent schemas or OCR runtime policy.
Its Windows checkpoint does not close the installed-package or multiplatform
release gates.

## Integration Between The Product Workstreams

```text
PDF with usable text layer
  → existing local text extraction
  → text adapter / Tiptap JSON

Scanned or image-only PDF
  → PDFium page rasterization
  → PP-OCRv6_medium
  → ordered OCR blocks
  → TXT / Markdown / HTML or Tiptap JSON

Local image
  → PP-OCRv6_medium
  → recognized text
  → copy to clipboard or text export
```

OCR must not bypass the editor document model when a PDF is opened for editing. The output must enter the same `EditorDocumentV1` flow used by other editor imports.

## Release Gates

### Windows gate

- Complete editor matrix recorded as passed.
- OCR tests pass with real `PP-OCRv6_medium` model files.
- Image-to-clipboard extraction works in the packaged Tauri application.
- Native-text, scanned and mixed PDFs convert to the promised text targets.
- OCR cancellation, progress, errors and temporary-file cleanup are verified.
- Packaged application restarts without re-downloading the model.
- The canonical 18-step Windows gate passes, including both npm audits,
  application/preview checks, Rust format/Clippy/audit/tests, the conversion
  matrix, real LibreOffice archive extraction, PDFium, OCR runtime/corpus and
  the Tauri/NSIS build.

### macOS and Linux gates

Windows validation is sufficient to begin the OCR work after the editor gate closes. It is not sufficient for a multiplatform release claim.

Before publishing V1.0.7 for macOS or Linux:

- package the real OCR runtime and model for that platform;
- run the editor host matrix;
- run the OCR fixture matrix;
- verify architecture, licenses, notices and checksums;
- test the final DMG or AppImage on the target operating system.

### Documentation and release gate

- Update `NOTICE` only when the OCR runtime/model is actually added.
- Record exact PaddleOCR, PaddlePaddle/inference-runtime and model versions.
- Record model archive origin, SHA-256, installed size and redistribution notices.
- Synchronize version `1.0.7` only after editor and OCR gates pass.
- Write final English release notes from verified user-visible behavior.

## Documentation Map

| Document | Purpose |
| --- | --- |
| `README.md` | Public overview, stable release and V1.0.7 development summary |
| `V1_0_7_PLAN.md` | Source of truth for the complete V1.0.7 scope |
| `V1_0_7_VALIDATION.md` | Combined release gate and evidence ledger |
| `V1_0_7_EDITOR_VALIDATION.md` | Editor automated and manual validation evidence |
| `V1_0_7_EDITOR_UI_QA.md` | Editor-home visual regression evidence |
| `V1_0_7_OCR.md` | OCR product, architecture, security and test specification |
| `TESTING.md` | Commands and platform test procedures |
| `ARCHITECTURE.md` | Frontend, Rust domain and local-infrastructure boundaries |
| `SECURITY.md` | Native process, archive, editor, OCR and privacy boundaries |
| `REFACTOR_BASELINE.md` | Phase measurements, budgets, evidence and proof limits |
| `THIRD_PARTY_ENGINES.md` | Packaging, licensing and notice requirements |

## Official References

- Tiptap repository: https://github.com/ueberdosis/tiptap
- Tiptap MIT license: https://github.com/ueberdosis/tiptap/blob/main/LICENSE.md
- PaddleOCR repository: https://github.com/PaddlePaddle/PaddleOCR
- PP-OCRv6 technical documentation: https://github.com/PaddlePaddle/PaddleOCR/blob/main/docs/version3.x/algorithm/PP-OCRv6/PP-OCRv6.md
- PaddleOCR pipeline documentation: https://github.com/PaddlePaddle/PaddleOCR/blob/main/docs/version3.x/pipeline_usage/OCR.en.md
- PaddleOCR Apache-2.0 license: https://github.com/PaddlePaddle/PaddleOCR/blob/main/LICENSE
