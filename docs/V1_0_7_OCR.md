# V1.0.7 Local OCR Contract And Evidence

## Scope Update — 2026-10-29

OCR remains part of conversion and image-text extraction. Document/PDF editing,
including editor-only OCR layers, was cancelled. Earlier editor references in
this record are historical; the retained PDF flow extracts text for conversion.
Runtime locks, packaged models and original-file protection are unchanged.

## Status — current audit implementation, 2026-10-30

- Target release: **V1.0.7**
- Current metadata: **1.0.7**
- Selected model: **PP-OCRv6_medium**
- Windows implementation: **patched reference runtime built and packaged; smoke and full 40-case corpus passed**
- Windows NSIS build: **local b766134f candidate built; updater signature verified; installed acceptance pending**
- Windows packaged application smoke: **previous checkpoint only; current application acceptance pending**
- Current Windows correction fixture: **reviewed expected text matched exactly (100%)**
- Linux x64: **official runtime built and packaged reproducibly; direct 40-case corpus passed and isolated extracted-archive four-case probe passed**
- macOS Apple Silicon runtime: **official runtime built and packaged reproducibly; license inventory passed; worker startup and application acceptance pending**
- Native ONNX candidate and accelerators: **not selected; official CPU runtime retained**
- Privacy mode: **local only**

Intel macOS is retired from V1.0.7. The previous Windows NSIS/Tauri receipts
below are historical checkpoints, not validation of the current audit branch.
Current Linux measurements, runtime selection, license inventory and evidence
limits are in [the follow-through handoff](V1_0_7_AUDIT_FOLLOW_THROUGH.md).
The extracted-worker tests do not establish installed Linux application behavior.
The first rebuilt worker timed out on a scanned PDF. Explicitly bounding the
detection longest side to 1536 pixels fixed that fixture; recognition keeps the
original crops and all five reference models. The rebuilt packaged corpus passed
40 cases: clean 100%, difficult mean 99.76%, median 54,823 ms, peak 666.7 MiB,
861 network samples and zero observed remote connections. The scanned PDF passed
at 100% in 107,331 ms; the mixed PDF passed at 100% in 121,580 ms. The separate
French one-shot packaged smoke passed at 100% in 54,155 ms. No deadline or
accuracy threshold was raised. Small-print/layout generalization and Mac/Linux
runtime parity remain open. See V1_0_7_APPROVED_IMPLEMENTATION.md.

Phase 3 implements the OCR contracts, Windows reference runtime, PDF hybrid
extraction and image-text UI. The locally achievable Windows implementation
checkpoint is closed, but this is not a release-ready or multiplatform OCR
claim. The metadata moved to `1.0.7` for the Phase 8 native candidate, but
publication remains blocked until every release gate passes.

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
The current Windows runtime contains 7,246 files and 660,643,156 bytes with
aggregate SHA-256
`d386f7923fbea6fe6efa407b2f00d3e99e31ee9778027a67ca32e6b14adf759c`.

`prepare-ocr-models.mjs` validates official archive hashes and rejects unsafe
tar paths. `build-ocr-reference-runtime.mjs` creates the pinned Windows
reference sidecar. `prepare-ocr-runtime.mjs` writes per-file manifests and a
236,811,152-byte optimal-compression ZIP, SHA-256
`77da8356877fc3efc2da162a683983c66adc4e1b361d1f0f20c7bdae1c79b2ac`.
Two consecutive packages matched exactly. At first use, Rust extracts this ZIP
to the application-local data directory through a bounded path-safe reader,
then verifies the manifests and every extracted file hash. Recognition never
downloads models or selects a cloud fallback. Models remain separately
packaged; their 21-file contents and hashes remain unchanged.

`inventory-ocr-runtime-licenses.mjs` records the exact Python distribution
metadata and every embedded license-file hash in
`src-tauri/ocr-runtime-licenses.json`, tied to the runtime aggregate SHA-256.
The current artifact inventory covers 71 distributions and 104 license files,
with complete coverage including the bce-python-sdk supplemental license, and
no unresolved metadata entry. The inventory
and supply-chain audit pass for the rebuilt artifact. The dependency inputs and
three hashed platform locks include the reviewed Python security updates.

DirectML, CoreML and OpenVINO remain disabled. They may be selected only after
the required CPU parity and median-speed gates pass on the locked corpus. The
native C++ ONNX candidate is likewise not selected because its size, speed and
quality parity have not been measured. One package must contain one selected
runtime only.

For this checkpoint the explicit production decision is therefore the official
CPU sidecar. The native ONNX candidate and each accelerator are rejected from
selection, rather than silently enabled, because no artifact has met the
locked parity, size and speed thresholds. CPU fallback is the only evidenced
Windows behavior.

## Implemented Architecture

```text
React image action / converter
  -> typed Tauri OCR command
  -> one bounded OCR job
  -> validated temporary PNG or PDFium page render
  -> supervised local PP-OCRv6 sidecar
  -> normalized OcrDocumentResultV1
  -> text output or clipboard preview
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

### 2026-08-04 progress and cancellation correction

The first OCR run may spend material time extracting and hashing the locked
runtime before model inference begins. That work now emits bounded preparation
phases instead of leaving the interface at an unexplained `2%`:

- runtime archive extraction;
- runtime-manifest verification;
- model-manifest verification;
- image preparation or PDF page inspection;
- recognition and result normalization.

Extraction and verification report determinate progress. Worker startup,
recognition and cancellation are intentionally indeterminate because the
official runtime does not expose a reliable fractional inference value. The
dialog therefore never fabricates a percentage for those phases.

Cancellation is checked while reading the runtime archive, walking manifests,
hashing files, preparing PDF pages and waiting for the worker. It invalidates
the active UI sequence immediately, terminates the worker process tree when one
exists and does not cache a cancelled verification as a permanent failure.
Late progress or results for the cancelled job are ignored. The user receives
an explicit cancelled state and a focused **Retry** action; closing with Escape
or the close control also cancels an active job instead of trapping the dialog.

The correction is covered by Rust tests and compiled-preview interaction tests.
The packaged Windows runtime fixture matched its reviewed expected text exactly
(100%) in 24,672 ms. The same checkpoint reran all 40 corpus cases: clean mean
100%, difficult mean 99.76%, median measured recognition 13,330 ms and peak
worker working set 714.8 MiB. The worker showed zero remote connections in 251
process samples while the network remained active; this remains sampling, not
continuous packet capture. Preview progress/cancel tests and Windows results are
not proof of a packaged macOS or Linux worker.

The final local Windows correction NSIS installed the exact prepared
236,434,900-byte OCR runtime archive at SHA-256
`5982fcfbc2b78ee3b4aa55d4f7fad3a6a01b0388f0f384bb86051f1d343fc936`
alongside all five locked model directories. This byte identity ties the
packaged-runtime and corpus results above to the archive present in the
installed candidate; the maintainer's interactive OCR review remains separate.

## PDF Flow

The current PDFium wrapper `0.4.0` retains the `--inspect-text` command first
introduced by 0.3.0. Each page keeps native text when it contains at least 12
alphanumeric characters and less than 2 percent invalid characters. Only
insufficient pages are rendered as PNG at 300 DPI and passed to OCR. Light page
borders may be cropped locally without rescaling the text or changing the
source.

If OCR returns no text but an exploitable native fragment exists, that fragment
is retained with an `ocr-empty-native-fallback` warning. A required page
failure aborts the conversion, so no partial output replaces the destination.

Hybrid extraction is wired into existing PDF text targets including TXT,
Markdown, HTML, CSV, JSON, XML, DOCX, ODT and RTF. TXT separates pages with a
form feed; Markdown uses `---`; HTML creates escaped semantic page sections
without scripts or remote content.

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
- worker startup: 30 seconds on Windows/Linux, 90 seconds on Apple Silicon;
- recognition: 180 seconds per page;
- remote URLs, corrupted files, wrong real types and password-protected PDFs
  are rejected;
- output is Unicode NFC with LF endings and no trailing spaces;
- blocks stay ordered by page, then by deterministic anchored rows and left-to-right
  within each row; this does not reconstruct semantic newspaper columns or tables;
- low confidence alone never deletes recognized text.

## Commands

```powershell
npm run prepare:ocr-models
npm run build:ocr-runtime:windows
npm run prepare:ocr-runtime -- --platform windows-x64
npm run inventory:ocr-runtime-licenses
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

## Evidence Obtained On 2026-07-31 And 2026-08-01

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
error.

The exact `multi-converter.exe` extracted from that NSIS package was then
launched from the isolated 281-file directory. A native Windows clipboard file
paste imported a local PNG into the real Tauri application. **Extract text**
started the hash-verified worker from application-local data and loaded models
from the extracted package. Recognition returned the visible fixture text,
explicit **Copy** wrote exactly that text, **Cancel** returned `OCR_CANCELLED`
and removed the worker process, and the following retry succeeded. The worker
process command line selected `--provider cpu`; sampled TCP inspection found
zero connections for both the packaged app and worker. This is a packaged-file
smoke, not proof of the NSIS install/uninstall lifecycle or a continuous packet
capture.

Windows process counters on the successful retry recorded 1,069.8 MiB peak
working set, 1,188.0 MiB private memory after inference and 1,939.1 MiB peak
paged memory for the persistent OCR worker. The measured values describe this
machine and fixture; they are a baseline, not a hard cross-platform bound.

## Phase 5 Windows Candidate Evidence

The Phase 5 18-step Windows gate passed in 939,660 ms. The exact local unsigned
candidate is:

- NSIS: 999,834,888 bytes, SHA-256
  `D070371BEB318F27EFC25E443A1F22662B3611B286D2C5D6168C6D9660FF91A1`;
- release executable: 26,734,080 bytes, unchanged from Phase 4;
- extracted NSIS payload: 281 files and 1,407,637,272 bytes.

The exact executable extracted from that candidate rendered immediately on its
first and second launches without `Ctrl+R`, and the native Windows file picker
opened. These checks ran against the extracted package in the current profile.
They do not prove installation, offline behavior, OCR inputs or the Office
matrix in a dedicated clean profile.

`npm run test:windows:native` now locks 101 native scenarios and checks the
candidate hashes, advanced-engine tree, OCR resources, source integrity,
temporary cleanup and evidence files. The current partial ledger intentionally
fails with 104 open issues: three environment requirements and 101 scenarios
that are not all passed. Three scenarios have partial blocked evidence and 98
remain pending.

## Remaining Exit Gates

- Retain the explicitly selected official CPU runtime. The Phase 6 targeted
  candidate failed the size gate, so runtime parity and accelerator claims are
  neither required nor made for that rejected candidate.
- Obtain maintainer legal approval of the complete 71-distribution inventory
  before public redistribution; the technical license coverage is complete.
- Run corruption, password, timeout, cleanup, atomic-output and original-file
  tests through the packaged application.
- Run the complete offline installed-NSIS behavior matrix. The local unsigned
  build, earlier PNG/copy/cancel/retry smoke and Phase 5 exact-candidate launch
  have passed; the clean-profile installed matrix has not.
- Build and test the Apple Silicon macOS runtime and DMG, then the Linux x64
  runtime and AppImage on real hosts.
- Record output hashes, screenshots and all remaining host evidence in
  `V1_0_7_VALIDATION.md`.

Development metadata is already synchronized to `1.0.7` by maintainer
decision. Only after those gates pass may an OCR-enabled V1.0.7 release be
published.

## Phase 6 Quality And Supply-Chain Evidence

The OCR build input is now reproducible at the Python package boundary:
Python `3.12.10`, uv `0.11.21` and all 71 distributions are pinned with hashes
in `tools/ocr-runtime/requirements-windows-x64.lock.txt`. Its SHA-256 is
`5baf7325b3f11468ff1d8e0040e18c900a630f3bb8924550ecfbfd44aa920e99`.
`npm run test:ocr:lock`, `npm run audit:ocr-runtime` and `npm run audit:python`
verify the lock, runtime inventory and advisories. The inventory covers 71/71
packages with 106 license files and no unresolved metadata. The exact
`bce-python-sdk==0.9.76` artifact is covered by the supplemental official
Apache-2.0 text and recorded in `NOTICE`.

The committed corpus manifest contains exactly 40 CC0 fixtures/cases: 21 clean
printed cases across French, English, Spanish, German, Italian, Portuguese and
Japanese; nine rotation, skew, contrast and perspective cases; all five image
formats; native, scanned and mixed PDFs; a structured multiline case; and a
blank page. Expected text is compared after Unicode NFC, whitespace and case
normalization only. No character substitution is permitted, including for the
Japanese long-vowel mark. Rust also exercises PNG, JPEG, WebP, TIFF and BMP
normalization while verifying that source hashes do not change.

The locked reference archive is 236,434,900 bytes with SHA-256
`5982FCFBC2B78EE3B4AA55D4F7FAD3A6A01B0388F0F384BB86051F1D343FC936`.
The targeted PyInstaller candidate measured 599,539,740 installed bytes versus
660,098,904, a 9.17% saving, and 221,586,643 compressed bytes, a 6.28% saving.
Both are below the locked 10% selection threshold, so the candidate was
rejected before selection and the official runtime remains unchanged.

Corpus execution samples the OCR worker's established remote TCP connections
while the machine network remains active. Zero remote connections were seen in
772 samples during the standalone final run. This is process sampling, not
continuous packet capture. That run passed 40/40 cases in 829.6 seconds. The
retained report from the following successful Windows gate records clean mean
100%, difficult mean 99.76%, median measured recognition 43,878 ms and peak
worker working set 750,030,848 bytes (715.3 MiB). The noise fixture scored
97.62% against its 95% threshold; every other fixture scored 100%. Native,
scanned and mixed PDFs all scored 100%, as did the five Rust input normalizers.
PDF results used the current source-built wrapper; they must not be confused
with the historical packaged artifact.

## Historical Phase 7 Packaged PDFium Contract

Windows x64 uses PDFium `149.0.7825.0` from tag `chromium/7825` and the
Multi-Converter `pdfium-render` wrapper `0.3.0`. Their archive, DLL, Cargo lock,
toolchain, wrapper binary and deterministic engine ZIP are independently
locked in `tools/pdfium-windows-x64.lock.json`. The packaged wrapper must pass
native text inspection and 300-DPI rasterization with the adjacent packaged
DLL before it can enter the embedded engine manifest.

This changes packaging only. The native-text threshold, invalid-character
threshold, OCR fallback, page order, normalization, serializers, timeouts and
public OCR V1 contracts remain unchanged. The installed native test must use
the wrapper and DLL found below the NSIS installation root and compare its
40-case corpus results with the source-wrapper baseline without a score drop.
An active network is allowed during testing, but PDFium and OCR worker process
sampling must not observe remote connections during recognition.

Phase 7 installed evidence uses the unsigned NSIS SHA-256
`febaf4fad2cc0bdd570beeff0c83cca706526f75c3dbed987e1a7b8b5028ef28`.
Both isolated installation cycles expose wrapper `0.3.0` at SHA-256
`1d1474c2eff303112f00065d43818c2a4c005acc71c4ae32e3bdc0b37d9cb0d4`
and the locked DLL at SHA-256
`01be7a757183793f15eb35de9d9da424fc07d24b5560e8c3822f52812b2ad89a`.
The first installed cycle passed all 40 corpus cases with 100% clean mean,
99.76% difficult mean, 33,794 ms median recognition, 749,379,584-byte peak
working set and zero observed remote connections across 615 samples. The
second cycle repeated the packaged PDFium health checks after reinstall.

## Phase 8 Platform Runtime Contract — updated 2026-10-30

The internal OCR lock contains windows-x64, macos-aarch64 and linux-x64.
All select the official CPU runtime and shared locked PP-OCRv6_medium models.
Intel macOS is retired; no source-built Intel Paddle worker, lock or pipeline
belongs in the V1.0.7 release chain. Public OCR V1 behavior remains unchanged.

OCR Runtime Staging builds each retained native worker, runs Paddle run_check,
packages twice reproducibly, inventories licenses and tests the packaged runtime.
The Mac DMG includes only the ARM archive and one shared model tree; Linux only
Linux x64; Windows only Windows x64. Reject foreign or modified archives.
Real native corpus, launch and final installed-package acceptance remain required;
Windows self-tests are not Mac/Linux evidence. See the approved implementation
ledger for the rebuilt Windows artifact and current corpus investigation.

## Historical post-audit PDFium 0.4.0 checkpoint

The now-cancelled structural PDF editor extended the wrapper to 0.4.0 without changing PDFium
149.0.7825.0, the hybrid OCR thresholds, 300-DPI rendering or public OCR V1
contracts. The local Windows wrapper and deterministic engine archive have been
built and validated against their exact lock. The Cargo lock SHA-256 is
`6462b7bf8f748280d276316c2634f0faf8eb8ecd5c0d794ca0c445edc4decc7f`;
the 3,943,936-byte wrapper SHA-256 is
`07b3e7e61483de6e7ceb1de3596d839fa0b421118c42605de8accf62835388ec`;
the reproducible 5,127,516-byte ZIP SHA-256 is
`6627a3ca4ff30c302838b51c3830847419a30000fc155deea07b638edc8f02ea`;
and the extracted tree is 11,233,580 bytes. They remain unpublished and are not
installed-package OCR evidence. Universal macOS and Linux x64 package records
remain `pending-native-rebuild`; their sizes and SHA-256 fields stay null until
native staging produces reviewed evidence.

## Official References

- PaddleOCR 3.7.0: https://pypi.org/project/paddleocr/3.7.0/
- OCR pipeline: https://github.com/PaddlePaddle/PaddleOCR/blob/main/docs/version3.x/pipeline_usage/OCR.en.md
- PP-OCRv6: https://github.com/PaddlePaddle/PaddleOCR/blob/main/docs/version3.x/algorithm/PP-OCRv6/PP-OCRv6.md
- PaddleOCR license: https://github.com/PaddlePaddle/PaddleOCR/blob/main/LICENSE
- ONNX Runtime providers: https://onnxruntime.ai/docs/execution-providers/
- Tauri clipboard permissions: https://v2.tauri.app/plugin/clipboard/
