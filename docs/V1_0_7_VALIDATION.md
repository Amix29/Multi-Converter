# Multi-Converter V1.0.7 Validation

## Current Status

- Target version: **V1.0.7**
- Published baseline: **V1.0.6**
- Last documentation review: **2026-08-01**
- Overall gate: **blocked**
- Version metadata: **1.0.6**
- Phase 1 checkpoint: local commit **`9f89a8d2`** on `codex/phase-1-guardrails`, not pushed
- Phase 2 state: isolated worktree on `codex/phase-2-frontend-vellum`, based on the Phase 1 checkpoint, not merged or pushed
- Phase 3 state: isolated worktree on `codex/phase-3-ocr-local`, based on the Phase 2 checkpoint, not merged or pushed
- Phase 4 state: isolated worktree on `codex/phase-4-rust-backend`, based on Phase 3 commit `9ec3b9ca`, not merged or pushed

This is the combined release-validation ledger for V1.0.7. It does not replace the detailed editor or OCR documents:

- [`V1_0_7_EDITOR_VALIDATION.md`](V1_0_7_EDITOR_VALIDATION.md) contains editor evidence;
- [`V1_0_7_OCR.md`](V1_0_7_OCR.md) defines the OCR contract until implementation produces its own test evidence;
- [`V1_0_7_PLAN.md`](V1_0_7_PLAN.md) defines the complete scope and sequencing.

V1.0.6 results prove the existing release baseline only. They do not validate V1.0.7.

## 2026-07-31 Workspace Consolidation Evidence

The local checkpoint combines the Atelier IA transition with the unfinished
V1.0.7 development tree so its rules, commands, documentation and source stay
coherent. It is not a release candidate and does not close any pending host or
OCR gate.

Verified during consolidation:

- `npm run site:check` passed with 114 generated static pages, 120 checked
  routes, 111 HTML pages and 110 indexable SEO HTML pages;
- `npm --prefix site audit --omit=dev` reported zero known vulnerabilities;
- the repository secret-leak scan and staged diff checks passed;
- the former standalone site bundle was verified as a complete Git history;
- an isolated Playwright profile exercised the marketing home/download pages
  at desktop and 390 × 844 px, including screenshot preview, format search and
  the Windows, macOS and Linux download links;
- the compiled editor preview opened, switched to Editor mode, created a local
  mock document and accepted text at 390 × 844 px.

The editor browser smoke used the existing compiled `dist` preview because the
Vite development server remained in dependency optimization during this pass.
It proves only the rendered mock-browser flow: it does not validate current
Tauri persistence, native file access, Office import/export, sidecars, updater
behavior or OCR.

## 2026-07-31 Refactor Phase 1 Guardrails

Phase 1 is an isolated local guardrail and measurement change on branch
`codex/phase-1-guardrails`, based on commit `3570b89a03a7`. It preserves every
bundled engine and conversion path and intentionally leaves the project
metadata at `1.0.6`.

Implemented evidence:

- Vitest executes ten pagination-planner cases instead of relying on
  source-text inspection for that behavior;
- a dedicated TypeScript project checks the Vitest/Playwright configuration
  and all test files instead of leaving them outside `tsc --noEmit`;
- Playwright exercises converter import/format selection, editor creation and
  editing, and the recent-document delete confirmation in compiled Chromium at
  desktop and 390 x 844 mobile sizes;
- the browser suite passes 6 scenarios, but remains mock-preview evidence only;
- the installed npm dependency audit reports zero known vulnerabilities after
  upgrading Vite/PostCSS and adding the pinned test tools;
- the Rust audit reports zero vulnerabilities without exceptions after the
  `wayland-scanner` update removed the affected older `quick-xml` path; allowed
  warning categories remain documented in `TESTING.md`;
- local-only scripts now separate software, frontend bundle, packaged artifact
  and engine-size measurements, with an opt-in Windows responsive-window and
  process-memory proxy;
- the final 15-step Windows gate passed in 1,148,177 ms, including both npm
  audits, 34 Vitest tests, 6 compiled-preview Chromium scenarios, Rust/Clippy,
  the complete conversion matrix, PDFium and the Tauri/NSIS build;
- after review-only test/tooling hardening, `npm run check` and
  `npm run test:guardrails` passed again with 35 Vitest tests, strict test
  configuration typechecking and the 6 Chromium scenarios;
- the resulting Windows executable is 25,644,032 bytes and the local unsigned
  NSIS installer is 612,348,424 bytes. These are development artifacts, not
  V1.0.7 release assets.

The initial browser run also found a mobile pointer overlap from the floating
feedback control and could not use a newly edited preview document as a stable
recent-document navigation fixture. These are recorded in
`REFACTOR_BASELINE.md`; they were not repaired or misreported as native-runtime
proof in this guardrail phase.

Phase 1 does **not** close the Windows Tauri editor matrix, native drop,
persistent asset, OCR, macOS, Linux, version synchronization or release-asset
gates below. The responsive-window probe also remains a local startup proxy,
not functional validation of the packaged editor or conversion UI.

## 2026-07-31 Refactor Phase 2 Frontend And Vellum Paper

Phase 2 refactors the React application without changing Tauri commands,
conversion formats, persistent schemas or the bundled-engine boundary. It
keeps metadata at `1.0.6` and remains isolated from `codex/test`.

Implemented frontend evidence:

- `src/App.tsx` is now a lightweight coordinator; conversion rules, workflows,
  screens, overlays and editor responsibilities live in focused modules;
- the stable `src/lib/api.ts` import path now delegates to separate contracts,
  Tauri adapter, preview adapter and deterministic fixtures;
- production and compiled-preview builds select distinct API behavior, with a
  contract preventing the packaged build command from opting into preview mode;
- official Vellum 1.0 Paper tokens are vendored locally, with no Carbon
  preference or remote visual dependency. The source and vendored token files
  share SHA-256
  `FA4C4754834756896E610CFB751170654B09BBBD543606149B1866513B8A44BE`;
- the feedback action now stays in the topbar instead of covering the mobile
  conversion action;
- closing an editor document waits for autosave and recent-document refresh;
  either failure keeps the document open and exposes the error;
- dialogs implement Escape handling, focus trapping and focus return, with
  visible keyboard focus and reduced-motion support;
- rich HTML is sanitized through pinned `dompurify` 3.4.12 with bounded links,
  styles, tables and local-image rules documented in [`SECURITY.md`](SECURITY.md);
- every current TypeScript, TSX and CSS file under `src/` remains below the
  500-non-blank-line hard limit.

The Phase 2 preview suite covers a real touch at 390 x 844, the full simulated
conversion lifecycle, autosave and recents, failure recovery, editor stacking,
hostile HTML, settings, feedback, keyboard behavior and responsive widths.
This remains mock-browser evidence and does not prove native persistence or
real conversion behavior.

The final 15-step Windows gate passed on 2026-07-31 in 647,789 ms, after the
last CSS and test corrections. It includes zero-vulnerability npm audits,
application checks, 44 Vitest tests, 8 routed compiled-preview scenarios,
Rust/Clippy, 95 Rust tests, the 6/6 conversion matrix, 5 PDFium wrapper tests,
the production frontend and local Tauri/NSIS packaging. Exact bundle, artifact
and engine measurements live in [`REFACTOR_BASELINE.md`](REFACTOR_BASELINE.md).
The total production bundle misses its Phase 1 raw-size target by 37,548 bytes,
while the 206,028-byte initial chunk and 496,337-byte largest chunk pass their
limits and the 1,988,656,508-byte engine boundary remains unchanged.

Phase 2 does **not** close the real Tauri Office matrix, native file drop,
restart/persistent-asset proof, OCR, real macOS or Linux host validation,
version synchronization or release publication gates.

## 2026-08-01 Phase 3 Local OCR Development Checkpoint

Phase 3 adds the Windows reference implementation without changing version
metadata, removing an engine or publishing any artifact.

Implemented evidence:

- the editor prerequisite passed in the real Tauri development runtime for
  create, edit, autosave, close and reopen; direct Save As wrote the expected
  TXT bytes after the staging-extension repair;
- the local model lock pins PaddlePaddle 3.3.1, PaddleOCR 3.7.0, PaddleX 3.7.0,
  ONNX Runtime 1.26.0 and all five `PP-OCRv6_medium` pipeline modules;
- the prepared models and Windows official CPU sidecar have per-file manifests,
  locked aggregate SHA-256 values and Rust pre-use integrity verification;
- one supervised persistent worker handles one job at a time, supports
  cancellation, discards crashed workers and cleans temporary job directories;
- PNG, JPEG, WebP, TIFF and BMP are validated and normalized locally; the UI
  offers an explicit accessible image-text dialog and write-only text copy;
- PDFium 0.3 inspects every page, keeps sufficient native text and renders only
  insufficient pages at 300 DPI for OCR;
- native, scanned and mixed PDF paths were exercised through real Tauri, as
  were mixed-PDF editor import and semantic HTML serialization;
- 8 OCR Rust tests and 6 PDFium wrapper tests pass;
- compiled-preview Playwright covers OCR result, empty result, copy,
  cancellation, focus, Escape and four reference widths;
- the standalone packaged-sidecar smoke reached exact normalized recognition
  for the reviewed clean French fixture without a Python installation.
- an 11-case persistent-worker CPU corpus passed with a 99.16 percent clean
  seven-language mean, 100 percent difficult-image mean, empty blank output and
  48,280 ms median; Japanese remained individually visible at 94.12 percent.
- the 660,098,904-byte installed OCR runtime is packaged as a verified
  236,434,900-byte archive, while the existing LibreOffice runtime is packaged
  as its verified 483,796,141-byte release archive and extracted on demand;
- traversal-resistant extraction tests cover both archive boundaries, and the
  real LibreOffice archive restored its required launcher in 69.22 seconds on
  the final rerun;
- the local unsigned Windows build passed with all engines retained, producing
  a 26,662,400-byte executable and a 999,871,215-byte NSIS installer.

Measured real Tauri development-runtime timings include 194.8 seconds for the
first image job with cold resource verification, 24.2 seconds for the next
persistent-worker job, 248 ms for a native PDF, 27.8 seconds for a scanned PDF,
8.6 seconds for a mixed PDF and 9.1 seconds for mixed-PDF editor import.

The final 15-step Windows gate passed on 2026-08-01 in **557,915 ms**. It
included both npm audits with zero known vulnerabilities, deterministic engine
preparation, `npm run check`, 44 Vitest tests, 11 Playwright scenarios with 11
routed duplicates skipped, Rust formatting and Clippy, the allowed-warning
Rust audit, 108 passing Rust tests with 7 intentionally separated heavy tests,
the 6/6 real conversion matrix, 6 PDFium tests, the production build and the
local unsigned Tauri/NSIS build.

The resulting NSIS file was also parsed and extracted without error into an
isolated temporary directory: 281 files and 1,407,773,464 expanded bytes. The
exact extracted `multi-converter.exe` was subsequently launched and its process
path verified. A native clipboard file paste, PNG OCR, explicit copy,
cancellation, worker termination and retry all passed against the packaged
resources. This is extracted-package behavior evidence; the installed NSIS
lifecycle and complete PDF/image/editor matrix remain pending.

The locally achievable Windows Phase 3 checkpoint is closed, not the release
gate. The initial synthetic corpus must still be expanded across native input
paths and real-world fixtures. The runtime decision now explicitly retains the
official CPU sidecar and disables unproven native/accelerated options. An exact
71-distribution/105-license-file inventory and Windows peak-memory baseline are
recorded, but the missing embedded `bce-python-sdk` license, installed Windows
NSIS matrix and real macOS/Linux builds remain open. Full details and hashes are in
[`V1_0_7_OCR.md`](V1_0_7_OCR.md).

## 2026-08-01 Phase 4 Rust Backend Refactor Checkpoint

Phase 4 restructures the existing Rust backend without changing public Tauri
commands, serialized contracts, conversion formats, engine selection order,
OCR policy, persistent schemas, dependencies or version metadata.

Implemented evidence:

- `lib.rs` is a 68-non-blank-line composition root registering the same 35
  commands; Tauri adapters now delegate to focused command and domain modules;
- conversion orchestration, media, image, document, text and atomic-output
  responsibilities are separated while preserving fallbacks, parameters,
  warnings, filenames and error prefixes;
- ODT package validation, XML reading, style interpretation, Tiptap conversion,
  HTML rendering and writing have characterization fixtures for rich content,
  tables, lists, images, page breaks, accents and hostile archives;
- engine catalogue, selection, executable resolution, health checks,
  distribution manifests, checksum verification and atomic installation are
  split without changing an engine or packaged resource;
- shared one-shot process support bounds stdout and stderr to 128 KiB per
  stream, applies timeouts and terminates process trees; the persistent OCR
  supervisor remains independent;
- the Rust structure guardrail scanned 91 handwritten files, found none above
  500 non-blank lines and measured a 426-line maximum; the softer 300-line
  objective remains visible for 17 files;
- 138 Rust tests passed with 7 intentionally separated heavy tests. Three warm
  normal-suite runs had a 15.09-second median test body, below the recorded
  Phase 3 31.77-second body;
- targeted deterministic preparation reproduced the expected fingerprints for
  both sidecars, four advanced-engine archives, 24 OCR resources and the
  LibreOffice archive;
- the Windows executable is 26,734,080 bytes, +0.27 percent from Phase 3 and
  below the 5 percent ceiling; the NSIS build is 999,834,801 bytes.

The canonical Windows gate passed **18/18 steps** in **1,632,700 ms**. It
included both npm audits, `npm run check`, compiled-preview Playwright, Rust
formatting, Clippy and audit, 138 Rust tests, the 6/6 real conversion matrix,
the real LibreOffice archive extraction, PDFium, the OCR runtime and corpus,
the production frontend and the local unsigned Tauri/NSIS build.

A Phase 4 release executable built before the final adversarial hardening was
launched with its process path verified. Native clipboard-file import, PNG OCR,
explicit copy, PNG to WebP conversion, export, editor autosave,
recent-document refresh and reopening the saved draft passed. The final
rebuilt executable passed the complete automated gate but was not re-exercised
interactively. Native UI ODT import could not be driven reliably through the
system file picker, so no native ODT round-trip claim is made. The installed
NSIS lifecycle, manual native conversion cancellation and macOS/Linux remain
open. This checkpoint does not make V1.0.7 release-ready.

## 2026-08-01 Phase 5 Windows Native Validation Checkpoint

Phase 5 adds a reproducible installed-Windows evidence protocol without
changing a Tauri command, public contract, format, engine, dependency or
version. `npm run test:windows:native -- --self-test` passes and locks 101
required scenarios covering NSIS lifecycle, converter engine families, the
Office editor matrix and OCR.

Current evidence:

- the canonical Windows gate passed 18/18 steps in 939,660 ms;
- 44 Vitest tests, 22 routed Playwright executions, 138 Rust tests, the 6/6
  conversion matrix, LibreOffice archive extraction, PDFium, OCR runtime and
  the current 11-case corpus passed;
- the prepared engine tree matches Phase 4 exactly: 19,571 files,
  1,785,947,516 bytes and aggregate SHA-256
  `5f5c6d5d11fcda17b741924d273108ded718b7581ebb0d19db04136bff0cd290`;
- the exact local NSIS candidate is 999,834,888 bytes with SHA-256
  `D070371BEB318F27EFC25E443A1F22662B3611B286D2C5D6168C6D9660FF91A1`;
- its 26,734,080-byte executable is unchanged from Phase 4 and the extracted
  281-file package rendered immediately on first and second launch without
  `Ctrl+R`;
- the native Windows file picker opened, but file selection stopped safely
  after concurrent human input was detected.

The current evidence run is deliberately labelled `current` and `extracted`,
not `dedicated`, `installed` or `offline`. Its final validator reports 104 open
issues: three environment requirements plus the 101 scenarios that are not all
passed. First launch, second launch and native picker contain partial evidence
but remain blocked; 98 scenarios remain pending. The installed NSIS lifecycle,
complete converter/editor/OCR matrices and offline clean-profile proof remain
open, so Phase 5 is a local checkpoint rather than a closed Windows gate.

### Maintainer Assumption For Phase Sequencing

The maintainer has explicitly asked not to disconnect the active machine,
because doing so would interrupt the working session, and has chosen to assume
that the remaining native scenarios function correctly. Phase 5 is therefore
accepted as complete **for phase sequencing only**. The 101 scenarios are not
reclassified as passed, and the evidence manifest remains incomplete so that
an assumption cannot be mistaken for an executed test.

This assumption allows work to proceed to Phase 6. It does not constitute
installed-NSIS, offline, Office round-trip or OCR validation, and it cannot be
used as release-readiness evidence unless those checks are later executed.

## 2026-08-02 Phase 6 Quality, Security And Optimization Checkpoint

Phase 6 adds a global 500-nonblank-line source guardrail, deterministic bundle
budgets, an exact Python OCR lock, a 71-package/106-license inventory, a
40-case corpus manifest and a numbered security review. It does not change the
version, public IPC contracts, conversion formats or selected OCR runtime.

Current automated evidence:

- `npm run check` passes, including 44 Vitest tests, 6 PDFium wrapper tests,
  101 Windows native-protocol self-test scenarios and all static platform
  packaging contracts;
- `npm run test:guardrails` passes with 11 compiled-preview Playwright tests
  and 11 expected duplicate-project skips;
- npm production/full audits, the exact Python lock audit and Cargo Audit pass
  under the documented Rust advisory policy;
- the production frontend is exactly 1,095,149 raw bytes, its initial
  application chunk is 211,600 bytes and its largest chunk is 496,337 bytes;
- 245 handwritten source files were checked, none exceeds 500 nonblank lines;
- the official OCR runtime stays selected because the targeted candidate saved
  only 9.17% installed and 6.28% compressed, below the required 10%;
- OCR process samples were taken with the machine network active and observed
  no established remote connection. This is not continuous packet capture.
- `npm run test:windows:ci` passes all 18 steps in 1,521,300 ms. The resulting
  executable remains exactly 26,734,080 bytes; the local unsigned NSIS is
  999,835,255 bytes with SHA-256
  `9CB355FC932347E7CF62444A3FF1A393D93AC56699C36A2C77052159A8ED5DD0`.

The technical security review is recorded in
[`V1_0_7_SECURITY_REVIEW.md`](V1_0_7_SECURITY_REVIEW.md). No exploitable
critical, high or medium issue was demonstrated. Three missing CSP directives
were added. One low release-engineering issue remains open: the historical
PDFium archive predates the hybrid OCR `--inspect-text` command, although the
current source-built wrapper passes its six tests. Consequently an exact
packaged PDF OCR claim remains blocked until a reviewed archive is staged.

The standalone final 40-case corpus run passed in 829.6 seconds with 772
network samples and zero observed remote connections. The retained report from
the following successful Windows gate records clean mean 100%, difficult mean
99.76%, median measured recognition 43,878 ms, peak worker working set
750,030,848 bytes and 40 results. Native, scanned and mixed PDFs passed at
100%; the source-built PDFium wrapper was used, so this is not evidence for the
stale packaged wrapper. The Rust PNG/JPEG/WebP/TIFF/BMP normalization and
original-hash checks passed.

## 2026-08-02 Phase 7 Windows PDFium Packaging Checkpoint

Phase 7 replaces the obsolete Windows x64 PDFium package without changing the
PDF hybrid algorithm, OCR contracts, formats or application version. The
provenance lock fixes PDFium `149.0.7825.0`, tag `chromium/7825`, the official
archive and DLL hashes, wrapper `0.3.0`, Cargo lock, Rust `1.96.0`, compiled
wrapper fingerprint and deterministic engine ZIP fingerprint.

Evidence obtained before public staging:

- the 3,720,244-byte official archive and 7,178,240-byte DLL match their
  independent locked SHA-256 values;
- two wrapper builds are byte-identical at 970,752 bytes and two engine ZIPs
  are byte-identical at 3,962,918 bytes;
- the clean three-asset engine set and bundled tree pass exact version, x64 PE,
  archive path, checksum, `--check`, native `--inspect-text` and scanned-page
  `--render`/PNG-decode checks;
- all seven native wrapper tests pass;
- the first Phase 7 OCR corpus run passes 40/40 with 100% clean mean, 99.76%
  difficult mean and 100% on native, scanned and mixed PDFs; 822 process
  samples observe no remote OCR-worker connection while the network is active;
- `npm run check`, both npm audits and the project-authorized Rust audit pass.

The remaining Phase 7 evidence is the successful `codex/test` staging job,
public cache-empty download, exact NSIS identity and the installed-resource
two-cycle harness. Until those are recorded, this subsection is an engineering
checkpoint rather than phase closure. The 101 Phase 5 manual scenarios are not
replayed and remain unvalidated by explicit maintainer decision.

## Gate Summary

| Gate | Status | Blocking work |
| --- | --- | --- |
| Tiptap editor implementation | Implemented in development tree | Preserve current contracts while completing real host tests |
| Phase 2 frontend and Vellum Paper | Windows automated checkpoint passed | Raw-total bundle target missed; keep the measured result and complete native/manual gates |
| Phase 4 Rust backend refactor | Windows checkpoint passed | Preserve compatibility and complete the remaining installed/platform matrices |
| Phase 5 Windows native validation | Accepted for sequencing by explicit maintainer assumption; native ledger remains incomplete | Execute the 101 installed scenarios later if release-grade native proof is required |
| Editor automated checks | Passed for unit and compiled-preview scope | Keep preview proof separate from real Tauri behavior |
| Editor HTML sanitization | Implemented with preview and static coverage | Complete real Tauri asset persistence and packaged-runtime checks |
| Windows Tauri Office matrix | Pending | Complete ODT/DOCX/RTF import, edit, export and reopen scenarios |
| Native editor file drop | Pending manual proof | Validate in the real Tauri application |
| Editor restart and asset persistence | Pending manual proof | Confirm `mc-asset://` images after a clean restart |
| OCR Windows reference implementation | Phase 6 technical checkpoint closed | Regenerate final 40-case report and obtain maintainer license approval |
| OCR Windows NSIS build | Passed locally | Preserve the verified compressed-resource preparation path |
| OCR Windows packaged-app matrix | Extracted-package smoke passed | Installed offline NSIS PDF/image/editor matrix and output hashes |
| macOS V1.0.7 matrix | Blocked | Real universal editor/OCR package and host validation |
| Linux V1.0.7 matrix | Blocked | Real x64 editor/OCR AppImage and host validation |
| V1.0.7 version synchronization | Blocked | All feature and release gates must pass first |
| Final release notes and assets | Blocked | Derive only from verified V1.0.7 behavior |

## Editor Evidence

The development tree contains the local Tiptap editor, bounded ODT import path, rich ODT export path and validated local asset protocol. The current automated and UI evidence is recorded in:

- [`V1_0_7_EDITOR_VALIDATION.md`](V1_0_7_EDITOR_VALIDATION.md);
- [`V1_0_7_EDITOR_UI_QA.md`](V1_0_7_EDITOR_UI_QA.md).

The Windows gate remains open until the complete real Tauri matrix is marked passed with fixtures, screenshots, engine versions and output SHA-256 values.

## OCR Evidence

Status: **locally achievable Windows Phase 3 checkpoint closed; release gate open**.

The exact versions, five model origins and hashes, installed sizes, automated
commands, Tauri-development results and current proof limits are recorded in
[`V1_0_7_OCR.md`](V1_0_7_OCR.md). Before this section can pass, add:

- preserve the retained 40-case report and rerun it against the reviewed
  packaged PDFium artifact before an exact-package claim;
- parity measurements only for a future candidate that first passes the size
  gate; the targeted Phase 6 candidate was rejected and official CPU retained;
- maintainer legal approval of the complete 71-distribution inventory;
- Windows packaged-NSIS tests for every advertised PDF text target, image
  format, editor path, cancellation, limits, cleanup and original integrity;
- a continuous offline/network capture; sampled packaged-process inspection
  found zero TCP connections but is not a full trace;
- real macOS universal and Linux x64 host/package matrices.

## Platform Release Evidence

### Windows x64

Status: **blocked by the editor manual matrix and OCR packaged-app matrix**.

Required final evidence:

- full commands from `RELEASE_CHECKLIST_WINDOWS.md`;
- editor and OCR packaged-app matrices;
- NSIS smoke test;
- exact final release asset validation.

### Universal macOS

Status: **blocked by V1.0.7 implementation and host packaging**.

Required final evidence:

- Apple Silicon and Intel editor/OCR host matrices;
- universal DMG build and two-architecture verification;
- clean-Mac installation and offline OCR smoke test;
- exact final DMG and updater hashes.

### Linux x64

Status: **blocked by V1.0.7 implementation and host packaging**.

Required final evidence:

- Linux editor/OCR conversion matrix with real engines;
- verified final AppImage;
- offline OCR and clipboard smoke test;
- exact final AppImage and updater hashes.

## Security And Privacy Evidence

The Phase 2 frontend security boundary is implemented and documented in
[`SECURITY.md`](SECURITY.md). DOMPurify 3.4.12 is pinned in the npm lockfile and
recorded in `NOTICE`; compiled-preview fixtures exercise hostile imports and
pastes, while static contracts preserve the sanitizer entry points and strict
script CSP. These checks do not replace real Tauri asset persistence,
filesystem or packaged-runtime validation.

The final V1.0.7 security review must cover:

- bounded ODT XML and ZIP handling;
- editor draft and `mc-asset://` isolation;
- OCR source limits, raster limits, timeouts and cancellation;
- model/runtime archive traversal and checksum enforcement;
- temporary PDF page and normalized-image cleanup;
- atomic output and preservation of originals;
- absence of source content and recognized text in telemetry or logs;
- absence of cloud OCR and runtime model downloads;
- dependency and license review for the exact packaged OCR stack.

Record the final reviewer, date, scope, commands and result here when the implementation is complete.

## Release Closure

V1.0.7 may be marked ready only when:

1. every gate above is passed with real evidence;
2. `NOTICE`, engine documentation and licenses match the packaged OCR stack;
3. version `1.0.7` is synchronized in npm, Cargo, Tauri and lockfiles;
4. final English release notes describe only verified behavior;
5. the exact release assets pass their platform validators;
6. the release diff and assets contain no local paths, credentials, temporary fixtures or private engine references.
