# V1.0.7 Local OCR Contract And Evidence

## Status

- Target release: **V1.0.7**
- Current metadata: **1.0.6**
- Selected model: **PP-OCRv6_medium**
- Windows implementation: **development checkpoint, real Tauri runtime exercised**
- Windows NSIS build: **passed locally with compressed runtime resources**
- Windows packaged application behavior matrix: **pending**
- macOS universal and Linux x64 runtimes: **not built or host-tested**
- Native ONNX candidate and accelerators: **not selected; official CPU runtime retained**
- Privacy mode: **local only**

Phase 3 implements the OCR contracts, Windows reference runtime, PDF hybrid
extraction and image-text UI. It is not a release-ready or multiplatform OCR
claim. The version stays at `1.0.6` until every release gate passes.

## Locked Runtime

`src-tauri/ocr-runtime-lock.json` is the deterministic source of truth:

| Component | Locked value |
| --- | --- |
| Model family | `PP-OCRv6_medium` |
| PaddlePaddle | `3.3.1` |
| PaddleOCR | `3.7.0` |
| PaddleX | `3.7.0` |
| ONNX Runtime | `1.26.0` |
| Windows selection | official sidecar, CPU |

The five official modules are document orientation, UVDoc unwarping, text-line
orientation, PP-OCRv6 medium detection and PP-OCRv6 medium recognition. Their
origin URLs and individual SHA-256 values are committed in the lock file.

The prepared model artifact contains 21 files and 185,082,003 bytes with
aggregate SHA-256
`e870fc5fe5287f8058a521fef3b5c8c9efe7a9d767b7110a4c5d41e12633c4bb`.
The current Windows runtime contains 7,260 files and 660,098,904 bytes with
aggregate SHA-256
`b6ea96d25e8c43ffa09efe7b8b171b44d3a82049c7cd0662ce403e8399f10da4`.

`prepare-ocr-models.mjs` validates official archive hashes and rejects unsafe
tar paths. `build-ocr-reference-runtime.mjs` creates the pinned Windows
reference sidecar. `prepare-ocr-runtime.mjs` writes per-file manifests and a
236,434,900-byte optimal-compression ZIP. At first use, Rust extracts this ZIP
to the application-local data directory through a bounded path-safe reader,
then verifies the manifests and every extracted file hash. Recognition never
downloads models or selects a cloud fallback. Models remain separately
packaged and the complete OCR resource tree occupies 421,522,838 bytes.

DirectML, CoreML and OpenVINO remain disabled. They may be selected only after
the required CPU parity and median-speed gates pass on the locked corpus. The
native C++ ONNX candidate is likewise not selected because its size, speed and
quality parity have not been measured. One package must contain one selected
runtime only.

## Implemented Architecture

```text
React image action / converter / editor
  -> typed Tauri OCR command
  -> one bounded OCR job
  -> validated temporary PNG or PDFium page render
  -> supervised local PP-OCRv6 sidecar
  -> normalized OcrDocumentResultV1
  -> text output, clipboard preview or EditorDocumentV1
```

The stable API facade exposes `getOcrRuntimeInfo()`,
`recognizeImage(path, jobId)`, `cancelOcr(jobId)` and
`onOcrProgress(callback)`. Tauri exposes the matching commands and
`ocr-progress` event. The versioned result contracts are
`OcrRuntimeInfoV1`, `OcrDocumentResultV1`, `OcrPageResultV1`,
`OcrTextBlockV1`, `OcrWarningV1` and `OcrProgressV1`.

The sidecar is persistent within the application session so the loaded model
can be reused. Only one OCR job may run at a time. Cancellation terminates the
worker process tree; crash, timeout or protocol failure discards the worker so
the next job starts a clean process. Job temporary directories are owned by
RAII guards and are removed on success, error or cancellation.

## PDF Flow

The PDFium wrapper `0.3.0` adds `--inspect-text`. Each page keeps native text
when it contains at least 12 alphanumeric characters and less than 2 percent
invalid characters. Only insufficient pages are rendered as PNG at 300 DPI
and passed to OCR. Light page borders may be cropped locally without rescaling
the text or changing the source.

If OCR returns no text but an exploitable native fragment exists, that fragment
is retained with an `ocr-empty-native-fallback` warning. A required page
failure aborts the conversion, so no partial output replaces the destination.

Hybrid extraction is wired into existing PDF text targets including TXT,
Markdown, HTML, CSV, JSON, XML, DOCX, ODT and RTF. TXT separates pages with a
form feed; Markdown uses `---`; HTML creates escaped semantic page sections
without scripts or remote content. Opening a PDF in the editor produces
paragraphs and `pageBreak` nodes, shows the fidelity warning and requires Save
As.

## Image Flow And Clipboard

PNG, JPEG, WebP, TIFF and BMP are accepted after real-type validation. EXIF
orientation is applied and the input is normalized to an unpredictable
temporary PNG without modifying the original. Limits are checked before
inference.

Each supported image exposes the explicit **Extract text** action. The Vellum
Paper dialog shows progress, cancellation, result, warnings, empty result and
errors. It is keyboard accessible, traps and restores focus, supports Escape
outside an active job and remains usable at 200 percent zoom and the reference
widths. Copy is explicit and disabled for an empty result. The Tauri clipboard
capability permits only text writing; there is no read, monitor, HTML, image or
clear permission.

## Normalization And Limits

- source: 128 MiB;
- decoded image: 120 megapixels and 32,768 pixels per side;
- PDF: 2,000 pages;
- normalized text: 64 MiB;
- worker startup: 30 seconds;
- recognition: 180 seconds per page;
- remote URLs, corrupted files, wrong real types and password-protected PDFs
  are rejected;
- output is Unicode NFC with LF endings and no trailing spaces;
- blocks stay ordered by page, then top-to-bottom and left-to-right;
- low confidence alone never deletes recognized text.

## Commands

```powershell
npm run prepare:ocr-models
npm run build:ocr-runtime:windows
npm run prepare:ocr-runtime -- --platform windows-x64
npm run test:ocr
npm run test:ocr:runtime
npm run test:ocr:corpus
```

`npm run test:ocr` is the repository contract gate and is included in
`npm run check`. `npm run test:ocr:runtime` requires the ignored prepared
Windows runtime/model artifacts and runs real inference.
`npm run test:ocr:corpus` reuses one persistent worker for the reviewed local
multilingual and difficult-image fixtures. Preview fixtures are UI evidence
only.

## Evidence Obtained On 2026-07-31

Real Tauri development-runtime evidence on Windows x64:

- runtime metadata reported the locked official CPU stack;
- a clean French fixture reached 100 percent normalized text accuracy with
  accents, including in the standalone sidecar smoke test;
- the first Tauri image job completed in 194.8 seconds including cold resource
  verification; subsequent persistent-worker runs completed in 24.2 seconds
  and later about 15.6 seconds;
- cancellation returned `OCR_CANCELLED`; a forced worker crash returned
  `OCR_RUNTIME_CRASH`; the following retry succeeded;
- native PDF extraction completed in 248 ms;
- scanned PDF extraction completed in 27.8 seconds after local border crop;
- mixed native/scanned extraction completed in 8.6 seconds and preserved page
  order with a form feed;
- mixed PDF editor import completed in 9.1 seconds with
  `paragraph,pageBreak,paragraph`, a PDF source marker and fidelity warning;
- semantic mixed-PDF HTML contained two page sections, no script and no remote
  resource.

Automated evidence:

- Rust OCR tests pass for normalization, five image normalizers, limits,
  invalid sources, manifest integrity, safe archive paths, page threshold and
  PDF crop;
- 6 PDFium wrapper tests pass, including text inspection and rendering;
- Playwright covers result, empty result, copy, cancellation, focus, Escape and
  the 375/768/1024/1440 widths through deterministic preview fixtures;
- the final real-runtime smoke recognizes the reviewed clean fixture exactly.
- the 11-case CPU corpus passed with a 99.16 percent mean across seven clean
  languages, 100 percent mean across rotation, low contrast and perspective,
  a strictly empty blank result and 48,280 ms median recognition time;
- French, English, Spanish, German, Italian and Portuguese clean fixtures were
  exact. Japanese reached 94.12 percent because `ー` was recognized as `-`;
  this visible per-language limitation is retained even though the clean
  aggregate exceeds 98 percent.

The local unsigned Windows build also completed after packaging the OCR runtime
and LibreOffice as verified compressed archives. It produced a 999,871,215-byte
NSIS installer and a 26,662,400-byte application executable. This proves the
resource set can be built without crossing NSIS's raw-input mapping limit; it
does not prove installed application behavior.

These results do not prove the installed NSIS application, all image formats
through native Tauri normalization, a broad real-world corpus, peak memory, a
native ONNX runtime, accelerators, macOS or Linux.

The final 15-step Windows development gate passed in 557,915 ms. It included
both npm audits, 44 Vitest tests, 11 Playwright scenarios, 108 normal Rust
tests with 7 intentionally separated heavy tests, the 6/6 conversion matrix,
6 PDFium tests, both Clippy gates, the production frontend and Tauri/NSIS.
The NSIS archive also parsed and extracted all 281 packaged files without
error; this remains structural evidence, not installed-runtime evidence.

## Remaining Exit Gates

- Expand the synthetic 11-case corpus with multipage documents, multiple fonts,
  skew, photos, all five native image input paths and reviewed expected files;
  improve or explicitly accept the observed Japanese long-vowel-mark error.
- Measure the required accuracy thresholds and native-runtime parity; retain
  the official runtime when the candidate misses any gate.
- Complete dependency-license review and notices for the exact 660 MB Windows
  runtime before distributing it.
- Run corruption, password, timeout, cleanup, atomic-output and original-file
  tests through the packaged application.
- Run the complete offline installed-NSIS behavior matrix; the local unsigned
  build itself has passed.
- Build and test one universal macOS runtime on Apple Silicon and Intel, then a
  Linux x64 runtime and AppImage on real hosts.
- Record output hashes, screenshots, peak memory and all host evidence in
  `V1_0_7_VALIDATION.md`.

Only after those gates pass may metadata move to `1.0.7` or an OCR release be
published.

## Official References

- PaddleOCR 3.7.0: https://pypi.org/project/paddleocr/3.7.0/
- OCR pipeline: https://github.com/PaddlePaddle/PaddleOCR/blob/main/docs/version3.x/pipeline_usage/OCR.en.md
- PP-OCRv6: https://github.com/PaddlePaddle/PaddleOCR/blob/main/docs/version3.x/algorithm/PP-OCRv6/PP-OCRv6.md
- PaddleOCR license: https://github.com/PaddlePaddle/PaddleOCR/blob/main/LICENSE
- ONNX Runtime providers: https://onnxruntime.ai/docs/execution-providers/
- Tauri clipboard permissions: https://v2.tauri.app/plugin/clipboard/
