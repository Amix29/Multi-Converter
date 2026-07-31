# Phase 1 Refactor Baseline

## Purpose

This document fixes the measurable starting point for the Multi-Converter
application refactor. It covers the desktop application only; the marketing
site in `site/` is outside this audit.

Phase 1 adds measurement and regression guardrails. It does not remove,
replace or reduce any conversion engine, advertised format, offline behavior
or conversion-quality path. In particular, bundled FFmpeg, ffprobe, PDFium,
LibreOffice, Pandoc and libvips resources remain part of the product boundary.

## Measurement Boundary

The baseline was captured on 2026-07-31 from commit `3570b89a03a7`, before the
Phase 1 changes, on Windows x64 with:

- Node.js `24.11.1`;
- npm `11.7.0`;
- Rust `1.96.0`;
- Cargo `1.96.0`.

Measurements are local engineering data. They do not collect file names from
user conversions, source contents, converted contents or telemetry. Source
counts exclude generated output, dependencies, Git data, the marketing site
and Rust targets. Bundle and engine measurements report only paths, file
counts and byte totals inside the repository's known build/resource folders.

The post-change snapshot can be recollected with:

```powershell
npm run measure:baseline -- --output test-results/phase-1-baseline/after.json --gate-status tmp/phase1-after-windows-ci.json
```

An explicit installer or executable can be added with `--artifact <path>`.
Generated reports stay ignored by Git.

The command is repeatable, but the values are state-dependent: detected build
artifacts, build caches and mutable local engine folders can differ between
runs. Compare two reports only after applying the same preparation and artifact
boundary.

## Before Phase 1

### Frontend Production Bundle

`vite build` produced five files totalling **1,049,979 bytes** before gzip.

| Asset | Bytes |
| --- | ---: |
| `EditorWorkspace` JavaScript chunk | 529,855 |
| Main JavaScript chunk | 398,175 |
| Main CSS | 80,033 |
| `marked` JavaScript chunk | 41,174 |
| HTML entry | 742 |

The build warned that the editor chunk exceeded 500 kB. This is a refactor
signal, not proof that loading is slow and not permission to remove editor
capabilities.

### Packaged Application And Engines

| Item | Bytes |
| --- | ---: |
| Windows application executable | 25,644,032 |
| Windows NSIS installer | 612,349,037 |
| Advanced engine resources | 1,786,873,098 |
| All local engine resources, including FFmpeg/ffprobe | 1,989,582,090 |

The installer is compressed, so its size cannot be compared directly with the
uncompressed engine-resource total. Engine size is reported separately from
software size on purpose: later code simplification must not be presented as
an engine reduction, and no target is allowed to discard supported engines.

The raw pre-change engine folder contained 44 runtime-generated LibreOffice
files (`.dmp` crash dumps and Python `__pycache__` entries) totalling 925,582
bytes. The deterministic engine preparation removed those transient files;
they were not conversion engines or required runtime resources.

### Canonical Windows Gate

The complete pre-change Windows gate passed in approximately **29 min 57 s**.
The status ledger recorded these step durations:

| Step | Duration |
| --- | ---: |
| Production npm audit | 1.1 s |
| Prepare bundled engines | 0.4 s |
| Application checks | 31.0 s |
| Rust format | 0.9 s |
| Rust Clippy | 80.2 s |
| Rust dependency audit | 4.5 s |
| Validate engines | 1.7 s |
| Rust tests | 100.5 s |
| Conversion matrix | 25.0 s |
| PDFium wrapper tests | 67.4 s |
| PDFium wrapper Clippy | 34.0 s |
| Frontend build | 5.7 s |
| Tauri/NSIS build | 1,445.6 s |

Most elapsed time came from the full Tauri/NSIS build. Phase 1 keeps that
canonical gate intact because it is the real packaging safeguard; faster
targeted commands are added for development feedback.

## Guardrails Added In Phase 1

- real Vitest execution for the DOM-independent pagination planner;
- rendered Chromium checks for desktop and 390 x 844 mobile preview flows;
- full installed npm audit in addition to the production-only audit;
- RustSec exceptions removed after upgrading the affected build dependency;
- structured local JSON measurements for source, bundle, engines and build
  artifacts;
- an opt-in Windows startup proxy for time-to-responsive-window and process
  memory, clearly separated from real interaction performance.

The browser suite uses the compiled Vite preview and its in-memory API. It
proves rendered frontend behavior only. It does not prove Tauri file access,
real conversions, native file drop, durable drafts, sidecars, OCR, updater or
packaged-runtime behavior.

## Existing Behaviors Observed During Guardrail Creation

The first browser run exposed two pre-existing behaviors. They are recorded so
later phases do not mistake their discovery for a regression introduced by the
new test stack:

- at 390 x 844 after mock file import, the floating feedback corner intercepted
  a pointer click on `Prepare conversion`; the stable keyboard activation path
  worked, but the pointer overlap remains a mobile UI defect to address in a
  later interface phase;
- the preview editor did not provide a reliable route from a newly edited
  document back to a rendered recent-document card during the scenario. The
  menu/dialog layout guard therefore uses an explicit preview-only seeded
  recent document. Real persistence and navigation remain Tauri validation
  work, not Phase 1 proof.

Neither observation changes conversion capacity or conversion output quality.

## Remaining Organization Debt

`src/lib/api.ts` remains a 597-non-blank-line mixed Tauri/preview API module.
Phase 1 added only the three-line net preview seed needed for rendered dialog
coverage and deliberately did not perform a product-code extraction after the
packaged baseline was validated. Splitting the Tauri adapter, preview adapter
and preview fixtures is therefore an explicit early refactor target for the
next code-structure phase. The workflow contract file touched in Phase 1 was
already split and is now below 500 non-blank lines.

## After Phase 1

The final local snapshot was captured after a clean `npm ci` and the complete
Windows gate. Its ignored machine-readable report is
`test-results/phase-1-baseline/after.json`.

| Measurement | After Phase 1 | Difference from recorded before value |
| --- | ---: | ---: |
| Measured software source | 142 files / 40,348 lines | No equivalent pre-change source count |
| Frontend production bundle | 1,050,043 bytes / 5 files | +64 bytes |
| Frontend bundle, independent gzip method | 299,754 bytes | No equivalent pre-change gzip method |
| Windows application executable | 25,644,032 bytes | 0 bytes |
| Windows NSIS installer | 612,348,424 bytes | -613 bytes |
| Advanced engine resources | 1,785,947,516 bytes / 19,571 files | -925,582 bytes / -44 transient files |
| All local engine resources | 1,988,656,508 bytes / 19,573 files | -925,582 bytes / -44 transient files |

The only frontend-size change is 64 raw bytes in the main chunk for the
preview-only recent-document fixture. This phase was not intended to reduce
production code yet. The executable is byte-size identical, and the 613-byte
installer variation is too small and build-dependent to establish an
optimization. The engine delta is exactly the transient LibreOffice content
identified above; FFmpeg, ffprobe, PDFium, LibreOffice, Pandoc and libvips all
remain validated and bundled.

The strengthened 15-step Windows gate passed in **1,148,177 ms** (about
19 min 08 s), compared with 1,797,980 ms (about 29 min 58 s) for the 13-step
pre-change run. The new run includes an additional complete npm audit and the
compiled Chromium suite. Most of the apparent reduction came from Tauri/NSIS
build time (805,925 ms after versus 1,445,620 ms before), so this is cache and
run variability, not evidence of a product performance improvement.

Validation totals at this checkpoint:

- 35 Vitest tests passed;
- 6 Playwright scenarios passed across desktop and mobile Chromium;
- both npm audits reported zero known vulnerabilities;
- Cargo Audit reported zero vulnerabilities and 20 allowed warnings
  (19 unmaintained advisories and the documented `glib 0.18.5` unsoundness
  warning);
- the Rust suite, complete conversion matrix, PDFium wrapper tests, Clippy,
  engine validation, frontend build and Tauri/NSIS build passed.

### Windows Startup Proxy

The opt-in packaged-executable probe completed five of five runs:

| Sample | Window-ready proxy |
| --- | ---: |
| First labelled run | 293 ms |
| Four repeat runs | 77–88 ms, 82 ms median |
| Root-process working set | 22,257,664–22,712,320 bytes |
| Root-process private memory | 3,936,256–3,989,504 bytes |

Every measured process closed through its main window; the forced PID fallback
was not used. These values cover only the launched root process, not WebView2
or engine child processes. The first run is not a controlled cold start, the
repeat runs benefit from operating-system caches, and a responsive window does
not prove interaction readiness or conversion performance. The measurement
script stores only local aggregate data, but the application starts with its
normal local profile and network isolation is not enforced, so configured
updater behavior may run during the probe.

A passing gate does not prove unmeasured native interaction performance,
security, OCR accuracy, macOS packaging or Linux packaging. Those gates remain
open in `V1_0_7_VALIDATION.md`.
