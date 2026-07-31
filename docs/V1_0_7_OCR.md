# V1.0.7 Local OCR Specification

## Status

- Target release: **V1.0.7**
- Selected model: **PP-OCRv6_medium**
- Implementation status: **not started**
- Current editor PDF-import status: **disabled**
- Privacy mode: **local only**

This file defines the required OCR behavior before implementation starts. It must be updated with exact runtime versions, commands, benchmarks and validation evidence as the code becomes real.

## User Goals

### PDF to text formats

Users must be able to select one or more PDFs and obtain readable text without uploading the files. The minimum direct OCR targets are:

- TXT for plain extracted text;
- Markdown for readable paragraphs and recoverable simple structure;
- HTML for semantic local output.

When a PDF is opened in Editor mode, recognized content must be converted to `EditorDocumentV1` Tiptap JSON. The user can then edit it and use the editor's existing Save As/export paths.

### Copy text from an image

Users must be able to request text extraction from a selected local image and copy the recognized result to the system clipboard.

The action must:

- be explicit;
- show a progress state;
- show the recognized text before or when it is copied;
- report an empty result clearly;
- avoid background clipboard monitoring;
- leave the source image unchanged.

## Supported Inputs

The V1.0.7 minimum is:

- PDF;
- PNG;
- JPEG/JPG;
- WebP;
- TIFF/TIF;
- BMP.

Animated images, SVG, HEIC/HEIF, multipage TIFF and unusually large sources require explicit fixture coverage before they are advertised.

## Model Contract

Multi-Converter will integrate the local PaddleOCR `PP-OCRv6_medium` pipeline.

Required packaging rules:

- pin the exact PaddleOCR/inference runtime version;
- pin every model component used by the pipeline;
- record official download URLs;
- verify SHA-256 before staging;
- keep the installed model in the local engine directory;
- never download a model during a conversion;
- never fall back to a network service;
- include applicable Apache-2.0 and runtime/model notices.

The upstream project documents PP-OCRv6 medium as a multilingual tier. Multi-Converter must not claim a language as supported until fixtures for that language pass on the packaged runtime.

## Planned Local Architecture

### Tauri backend

The Tauri backend owns OCR jobs, local paths, process isolation, progress, cancellation and cleanup.

The planned boundary is:

```text
React UI
  → typed Tauri OCR command
  → bounded local OCR job
  → packaged PP-OCRv6_medium runtime/model
  → structured OCR result
  → converter output, clipboard preview or EditorDocumentV1
```

Do not expose arbitrary file-system access to the WebView. The frontend receives structured results, not unrestricted local paths.

### PDF flow

1. Validate the PDF and source limits.
2. Inspect whether each page contains usable extractable text.
3. Use the existing local text path for a reliable native text layer.
4. Rasterize scanned or insufficient pages through the bundled PDFium path.
5. Run `PP-OCRv6_medium` on the required pages.
6. Normalize Unicode, whitespace, page order and paragraph boundaries.
7. serialize the requested text target or convert the result into Tiptap JSON.

A mixed PDF may combine native extraction and OCR page by page. The result must record which pages used OCR so warnings remain explainable.

### Image flow

1. Validate type, byte size and decoded dimensions.
2. Normalize orientation without changing the source file.
3. Run `PP-OCRv6_medium`.
4. Return ordered text blocks and confidence metadata.
5. Present the text for copy/export.
6. Remove temporary normalized images after completion or cancellation.

### Planned result model

The exact API may evolve during implementation, but it must preserve at least:

```ts
interface OcrDocumentResultV1 {
  schemaVersion: 1;
  sourceKind: "pdf" | "image";
  model: "PP-OCRv6_medium";
  pages: OcrPageResultV1[];
  warnings: OcrWarningV1[];
}

interface OcrPageResultV1 {
  pageIndex: number;
  width: number;
  height: number;
  extraction: "native-text" | "ocr";
  blocks: OcrTextBlockV1[];
}

interface OcrTextBlockV1 {
  text: string;
  confidence: number | null;
  box: { x: number; y: number; width: number; height: number } | null;
}
```

Persisted editor content must contain normalized text, not engine-specific temporary paths.

## UX Requirements

- OCR jobs show current file/page progress.
- Long jobs can be cancelled.
- Cancelling does not leave a partial output presented as complete.
- Failed pages are named in the error or warning.
- A blank result is different from a runtime failure.
- The selected output location follows the existing converter workflow.
- The UI explains that OCR reconstructs text, not the exact visual PDF.
- Editor PDF import becomes enabled only when the real OCR command is available.
- OCR controls honor keyboard navigation and `prefers-reduced-motion`.

## Security And Privacy

- No source bytes, thumbnails, recognized text or metrics leave the device.
- The OCR process runs with only the paths required for its current job.
- Remote image URLs are rejected.
- Temporary directories use unpredictable names and are removed after success, error or cancellation.
- Archive/model extraction rejects traversal and ambiguous paths.
- Model and runtime downloads are maintainer-staged and checksum-verified.
- Output files are written to a temporary sibling and atomically replaced only after validation.
- Existing originals remain intact after every failure.
- Logs must not include recognized document text by default.

Concrete source-byte, page-count, pixel-count, timeout and memory limits must be selected from real Windows benchmarks before the OCR feature is merged.

## Output Expectations

### TXT

- Preserve page order.
- Separate pages predictably.
- Preserve accents and Unicode.
- Never insert object identifiers or confidence values into user text.

### Markdown

- Preserve paragraphs and simple headings/lists only when confidence is sufficient.
- Reconstruct simple table-like rows only when deterministic.
- Warn that exact page layout, images, signatures and complex tables are not reproduced.

### HTML

- Use semantic local markup.
- Escape recognized text.
- Do not embed remote resources or scripts.
- Keep page boundaries identifiable.

### Editor

- Convert recognized blocks into valid Tiptap JSON.
- Keep page-break information when available.
- Add compatibility warnings for uncertain structure.
- Use the editor's normal autosave, asset and export paths after import.

## Test Fixtures

The OCR fixture set must include:

- native-text PDF;
- scanned-only PDF;
- mixed native/scanned PDF;
- rotated pages;
- three or more pages;
- French accents and punctuation;
- English and at least one additional upstream-supported language;
- low contrast;
- skew;
- phone photo with perspective;
- PNG, JPEG, WebP, TIFF and BMP;
- blank page/image;
- very large image;
- corrupted input;
- password-protected PDF;
- cancellation during a multipage job.

Expected text must be stored in reviewed fixture files. Tests must use normalized comparisons and documented accuracy thresholds rather than subjective claims.

## Required Automated Coverage

When implementation starts, add a dedicated OCR contract command and include it in `npm run check`. The command name is not active yet; do not document it as runnable until it exists.

Coverage must include:

- exact model identifier;
- checksum and offline-model discovery;
- no network access;
- PDF page selection;
- reading order;
- Unicode/accents;
- clipboard result;
- Tiptap JSON conversion;
- cancellation;
- progress;
- corrupt input;
- limits;
- cleanup;
- atomic output;
- original-file integrity;
- deterministic TXT/Markdown/HTML serialization.

## Manual Platform Matrix

For each release platform:

1. launch the packaged application offline;
2. convert native, scanned and mixed PDFs to every advertised text target;
3. extract and copy text from every advertised image format;
4. open a scanned PDF in the editor;
5. edit and export the OCR-created document;
6. cancel a long job;
7. force an error and confirm cleanup/original integrity;
8. restart the app and repeat without downloading the model;
9. record runtime/model versions, duration, peak memory, output hashes and screenshots.

## Exit Criteria

- Real `PP-OCRv6_medium` inference runs locally in the packaged app.
- PDF-to-TXT, Markdown and HTML meet reviewed fixture thresholds.
- Image text can be copied reliably.
- PDF-to-editor produces valid editable Tiptap JSON.
- Progress, cancellation, warnings and errors work.
- Model/runtime checksums and notices are recorded.
- No OCR data is transmitted.
- Windows gate passes before the V1.0.7 version bump.
- macOS/Linux gates pass before those V1.0.7 packages are published.

## Official References

- PaddleOCR repository: https://github.com/PaddlePaddle/PaddleOCR
- PP-OCRv6 documentation: https://github.com/PaddlePaddle/PaddleOCR/blob/main/docs/version3.x/algorithm/PP-OCRv6/PP-OCRv6.md
- OCR pipeline usage: https://github.com/PaddlePaddle/PaddleOCR/blob/main/docs/version3.x/pipeline_usage/OCR.en.md
- PaddleOCR license: https://github.com/PaddlePaddle/PaddleOCR/blob/main/LICENSE
