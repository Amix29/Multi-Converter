# Multi-Converter Application Refactor Baseline — Phases 1 To 6

## Purpose

This document fixes the measurable starting point and the Phase 1 through
Phase 4 checkpoints for the Multi-Converter application refactor. It covers
the desktop application only; the marketing site in `site/` is outside this
audit.

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
Both frontend defects are resolved and covered by rendered regression tests in
the Phase 2 checkpoint below.

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

## After Phase 2

The final Phase 2 snapshot was captured on 2026-07-31 in the isolated
`codex/phase-2-frontend-vellum` worktree, based on the committed Phase 1
checkpoint `9f89a8d2`. Its ignored machine-readable reports and reviewed
captures are stored locally at:

- `test-results/phase-2-baseline/after.json`;
- `test-results/phase-2-vellum/vellum-paper-*.png`.

The snapshot can be reproduced with:

```powershell
npm run measure:baseline -- --output test-results/phase-2-baseline/after.json --gate-status tmp/phase2-windows-ci-final.json
```

### Structure And Vellum

- `App.tsx`, the conversion workflow, editor, API facade/adapters and styles
  are split by responsibility while the public API import path and persistent
  contracts remain compatible;
- every current TypeScript, TSX and CSS file under `src/` is below the hard
  500-non-blank-line limit; the largest is 416 lines. The 300-line objective
  remains an optimization target rather than a claim that every file reached
  it;
- the vendored Vellum 1.0 token file exactly matches the Atelier source at
  SHA-256
  `FA4C4754834756896E610CFB751170654B09BBBD543606149B1866513B8A44BE`;
- the floating feedback overlap and unreliable preview recent-document return
  observed in Phase 1 are fixed and covered by real touch and autosave/refresh
  scenarios;
- the production bundle excludes preview fixtures; searches for the preview
  switches and seeded document/error strings returned no match in `dist`.

### Final Measurements And Budgets

| Measurement | After Phase 2 | Difference from Phase 1 | Exit budget |
| --- | ---: | ---: | --- |
| Measured source | 185 files / 42,126 lines | +43 files / +1,778 lines | Informational; modular extraction increases file count |
| Frontend production bundle | 1,087,591 bytes / 9 files | +37,548 bytes (+3.58%) | **Missed**: target <= 1,050,043 bytes |
| Frontend bundle, independent gzip method | 311,726 bytes | +11,972 bytes | Informational |
| Initial main JavaScript chunk | 206,028 bytes | -192,147 bytes | **Passed**: target <= 398,175 bytes |
| Largest JavaScript chunk | 496,337 bytes | Editor chunk was 529,855 bytes before Phase 1 | **Passed**: target <= 500,000 bytes, 3,663-byte margin |
| Windows application executable | 25,656,320 bytes | +12,288 bytes | Informational local build |
| Windows NSIS installer | 612,397,457 bytes | +49,033 bytes | Informational local build |
| Advanced engine resources | 1,785,947,516 bytes / 19,571 files | 0 bytes / 0 files | **Passed**: unchanged |
| All local engine resources | 1,988,656,508 bytes / 19,573 files | 0 bytes / 0 files | **Passed**: unchanged |

The raw-total bundle objective was not reached and is not reported as an
optimization success. The mandatory pinned DOMPurify chunk accounts for
26,853 raw bytes; Vellum, accessibility and the refactored UI account for the
remaining net increase. Chunking still brings the initial and largest chunks
under their explicit limits without removing editor or conversion capability.
Controlled minifier experiments found only a 242-byte Oxc gain and a 686-byte
out-of-band Terser gain; a `marked` wrapper increased its chunk by 45 bytes.
Removing the 41,174-byte `marked` parser would cross the target only by reducing
GFM release-note capability, so that tradeoff was rejected.

### Final Validation

The final 15-step Windows gate passed in **647,789 ms** (about 10 min 48 s):

- both npm audits reported zero known vulnerabilities;
- 44 Vitest tests passed;
- 8 routed Playwright scenarios passed and 8 duplicate cross-project routes
  were intentionally skipped; the suite covers all key application states at
  375, 768, 1024 and 1440 CSS px plus the deterministic 200% zoom equivalent;
- 95 Rust tests passed, with the 6 heavy conversion-matrix cases intentionally
  separated; those 6/6 cases then passed through `npm run test:conversions`;
- 5 PDFium wrapper tests and both Rust/PDFium Clippy gates passed;
- deterministic engine preparation reproduced exactly 19,573 engine files and
  1,988,656,508 bytes;
- the production frontend, Windows executable and local unsigned NSIS package
  built successfully.

The shorter duration relative to Phase 1 reflects warm build caches and NSIS
run variability, not an application performance improvement. The reviewed
Vellum captures and compiled preview prove rendered Chromium behavior only;
the real Tauri Office matrix, restart persistence, OCR and native macOS/Linux
gates remain open.

## Phase 3 Development Snapshot

The local Phase 3 snapshot was measured on 2026-08-01 in the isolated
`codex/phase-3-ocr-local` worktree. It includes the local PP-OCRv6 reference
runtime and the Windows package-size repair, but it is not a release baseline.
The ignored machine-readable report is stored at
`test-results/phase-3-baseline/after.json` and can be reproduced with:

```powershell
npm run measure:baseline -- --output test-results/phase-3-baseline/after.json
```

| Measurement | Phase 3 snapshot | Interpretation |
| --- | ---: | --- |
| Measured source | 204 files / 45,468 lines | OCR domain, runtime preparation and archive isolation added |
| Frontend production bundle | 1,095,149 bytes / 9 files | Raw total remains above the Phase 2 aspirational budget |
| Frontend bundle, independent gzip method | 313,570 bytes | Informational |
| Initial main JavaScript chunk | 211,600 bytes | Passes the 398,175-byte budget |
| Largest JavaScript chunk | 496,337 bytes | Passes the 500,000-byte budget |
| Windows application executable | 26,662,400 bytes | Local unsigned development build |
| Windows NSIS installer | 999,871,215 bytes | Local unsigned development build |
| Installed OCR models and runtime | 845,180,907 bytes | All locked PP-OCRv6 resources retained |
| Packaged OCR resource tree | 421,522,838 bytes / 24 files | Runtime compressed; models and manifests retained |
| Expanded advanced engine resources | 1,786,155,388 bytes / 19,571 files | Conversion source resources unchanged |
| Packaged LibreOffice archive | 483,796,141 bytes | Same verified runtime, extracted on demand |

The first packaging attempt exposed an NSIS memory-mapped input limit when the
7,260-file OCR runtime and expanded LibreOffice tree were both passed as raw
resources. Packaging the verified OCR runtime and the already verified
LibreOffice engine as bounded archives reduced the raw Windows resource input
to 1,380,851,344 bytes without removing any engine or conversion capability.
The rebuilt NSIS installer completed successfully. Installed application
behavior, offline network capture, peak OCR memory and real macOS/Linux
packages remain separate exit gates in `V1_0_7_VALIDATION.md`.

The final 15-step Windows gate passed in **557,915 ms** (about 9 min 18 s):

- both npm audits reported zero known vulnerabilities;
- 44 Vitest tests and 11 Playwright scenarios passed, with 11 duplicate routed
  scenarios intentionally skipped;
- 108 Rust tests passed and 7 heavy tests were intentionally separated; the
  6/6 conversion matrix and the real LibreOffice archive extraction test both
  passed separately;
- 6 PDFium wrapper tests, Rust/PDFium Clippy, deterministic engine preparation,
  the production frontend and the local Tauri/NSIS build passed.

## Phase 4 Rust Backend Snapshot

Phase 4 was measured on 2026-08-01 in the isolated
`codex/phase-4-rust-backend` worktree based on Phase 3 commit `9ec3b9ca`. Its
ignored machine-readable report is
`test-results/phase-4-baseline/refactor-baseline-after.json` and can be
reproduced with:

```powershell
npm run measure:baseline -- --output test-results/phase-4-baseline/refactor-baseline-after.json --gate-status tmp/phase-4-windows-ci-gate.json
```

### Structure And Compatibility

| Measurement | Before Phase 4 | After Phase 4 | Interpretation |
| --- | ---: | ---: | --- |
| Rust files under `src-tauri/src` | 24 | 87 | Domains and tests were extracted into focused modules |
| Rust source lines | 13,817 | 15,420 | Includes characterization, archive and process-safety tests |
| Rust non-blank lines | 12,925 | 14,382 | +1,457 lines; this phase prioritizes boundaries and proof over line-count reduction |
| Handwritten Rust files scanned by the guardrail | Not applicable | 91 | Includes `src-tauri/src`, `build.rs` and `tools` |
| Files above 500 non-blank lines | Not guarded | 0 | Hard limit passed |
| Largest handwritten Rust file | Above the new target in former monoliths | 426 non-blank lines | 17 files remain above the approximately 300-line soft target |
| `src-tauri/src/lib.rs` | Mixed composition and command behavior | 68 non-blank lines | Composition root with the same 35 registered commands |

The increase in file count and modest source-line increase are expected results
of extracting commands, conversion adapters, ODT parsing/writing, engine
selection, distribution and characterization tests. No new Rust crate or Rust
dependency was added. Public command names, serialized contracts, formats,
fallback order, persistent schemas and error prefixes remain compatible.

### Artifacts And Resource Boundary

| Measurement | Phase 3 snapshot | Phase 4 snapshot | Difference |
| --- | ---: | ---: | ---: |
| Frontend production bundle | 1,095,149 bytes | 1,095,149 bytes | 0 bytes |
| Initial main JavaScript chunk | 211,600 bytes | 211,600 bytes | 0 bytes |
| Largest JavaScript chunk | 496,337 bytes | 496,337 bytes | 0 bytes |
| Windows application executable | 26,662,400 bytes | 26,734,080 bytes | +71,680 bytes (+0.27%) |
| Windows NSIS installer | 999,871,215 bytes | 999,834,801 bytes | -36,414 bytes |

The executable increase remains below the 5 percent Phase 4 ceiling. Installer
compression varies between builds and the small decrease is not an optimization
claim. Deterministic preparation reproduced the expected hashes for both
FFmpeg sidecars, all four advanced-engine archives, all 24 OCR resources and
the LibreOffice release archive. This targeted fingerprint comparison does not
claim that every expanded cache file was rehashed. FFmpeg, ffprobe, PDFium,
LibreOffice, Pandoc, libvips, the integrated Rust converters and the local OCR
runtime all remain present.

### Test And Runtime Evidence

The final Windows gate passed all **18/18 steps** in **1,632,700 ms** (about
27 min 13 s):

- both npm audits reported zero known vulnerabilities;
- Rust formatting and Clippy passed; Cargo Audit reported no denied
  vulnerability and retained the documented allowed warnings;
- 138 Rust tests passed and 7 intentionally heavy tests remained separated;
- the 6/6 conversion matrix, real LibreOffice archive extraction, PDFium
  wrapper tests and Clippy, OCR runtime fixture and 11-case OCR corpus passed;
- `npm run check`, compiled-preview Playwright, the production frontend and the
  local unsigned Tauri/NSIS build passed.

Three warm runs of the normal Rust test body measured 15.09 s, 15.08 s and
15.25 s, for a 15.09 s median versus the recorded Phase 3 test-body value of
31.77 s. This is a same-machine development comparison affected by caches and
does not establish product runtime performance; it establishes that the 10
percent test-time regression limit was not breached.

A Phase 4 release executable built from this worktree before the final
adversarial hardening was launched and its process path was verified. Native
clipboard-file import, PNG OCR, explicit text copy, PNG to WebP conversion,
output export, editor creation, autosave, recent-document refresh and reopening
the saved draft passed. The final rebuilt executable passed the complete
automated gate but was not re-exercised interactively. File-picker automation
could not reliably drive native ODT import, so Phase 4 does not claim a native
UI ODT round trip; ODT parity remains covered by Rust fixtures and the real
LibreOffice archive test. The installed NSIS lifecycle, manual native
conversion cancellation and real macOS/Linux behavior also remain open.

## Phase 5 Windows Native Validation Snapshot

Phase 5 is based on commit `51c5c595` in the isolated
`codex/phase-5-windows-native` worktree. It adds validation infrastructure and
documentation only; no product engine, conversion algorithm, public contract
or dependency changed.

### Candidate And Engine Identity

| Measurement | Phase 4 | Phase 5 | Difference |
| --- | ---: | ---: | ---: |
| Advanced engine files | 19,571 | 19,571 | 0 |
| Advanced engine bytes | 1,785,947,516 | 1,785,947,516 | 0 |
| Windows application executable | 26,734,080 | 26,734,080 | 0 |
| Windows NSIS installer | 999,834,801 | 999,834,888 | +87 bytes |

The advanced-engine aggregate SHA-256 is identical in both worktrees:
`5f5c6d5d11fcda17b741924d273108ded718b7581ebb0d19db04136bff0cd290`.
The Phase 5 NSIS SHA-256 is
`D070371BEB318F27EFC25E443A1F22662B3611B286D2C5D6168C6D9660FF91A1`.
The installer delta is compression metadata, not an optimization claim. The
executable remains exactly at the Phase 4 baseline and therefore stays below
the five-percent ceiling.

### Validation Evidence And Limits

The full Windows gate passed 18/18 steps in 939,660 ms. The NSIS parsed into
281 files totalling 1,407,637,272 bytes. Its exact extracted executable rendered
on first and second launch without reproducing the earlier blank WebView.

`npm run test:windows:native` adds a 101-scenario evidence contract. The partial
current-host run intentionally fails with 104 issues because it is extracted,
online and not isolated in a dedicated profile, and because none of the 101
installed scenarios can yet be marked fully passed. Three have blocked partial
evidence; 98 remain pending. This snapshot must not be presented as installed
NSIS, offline OCR, complete Office round-trip or release readiness.

The maintainer subsequently accepted these remaining checks by assumption so
that Phase 6 can begin without disconnecting the active machine. This sequencing
decision does not alter the measurements or turn the pending checks into passed
evidence.

## Phase 6 Quality, Security And Optimization Snapshot

Phase 6 is based on commit `cdbda9e8` in the isolated
`codex/phase-6-quality-security-optimization` worktree. The version remains
`1.0.6`; no engine, format or public contract was removed.

| Measurement | Phase 5 baseline | Phase 6 checkpoint | Result |
| --- | ---: | ---: | --- |
| Frontend raw bundle | 1,095,149 bytes | 1,095,149 bytes | unchanged |
| Initial application chunk | 211,600 bytes | 211,600 bytes | unchanged |
| Largest JavaScript chunk | 496,337 bytes | 496,337 bytes | below 500 kB |
| Windows application executable | 26,734,080 bytes | 26,734,080 bytes | unchanged |
| Windows NSIS installer | 999,834,888 bytes | 999,835,255 bytes | +367 bytes |
| Handwritten source files above 500 nonblank lines | not globally enforced | 0 / 245 | gate passed |
| Files above the 300-line target | not globally recorded | 36 / 245 | tracked debt |
| Official OCR runtime, installed | 660,098,904 bytes | 660,098,904 bytes | retained |
| Targeted candidate, installed | - | 599,539,740 bytes | 9.17% smaller; rejected |
| Official/candidate runtime ZIP | 236,434,900 / - | 236,434,900 / 221,586,643 bytes | 6.28% candidate saving; rejected |

Three oversized engine/release scripts were split by responsibility. The new
source gate examines handwritten JavaScript, TypeScript and Rust and rejects
files above 500 nonblank lines while reporting the approximately 300-line
target. `npm run check` and `npm run test:guardrails` pass with this gate.

The production frontend exactly retains the Phase 5 byte budgets. The Phase 6
release executable is unchanged and remains below the 28,070,784-byte ceiling.
The 367-byte NSIS variation is packaging metadata/compression noise, not a
product-size regression claim. The complete 18-step Windows gate passed in
1,521,300 ms. The exact local unsigned NSIS SHA-256 is
`9CB355FC932347E7CF62444A3FF1A393D93AC56699C36A2C77052159A8ED5DD0`;
the executable SHA-256 is
`4D03729EE7E06E95A8E5230EA9316F0434A1291E237C52D94E7421C8F861C011`.

## Phase 7 Windows PDFium Packaging Snapshot

Phase 7 is based on `08cd9b35` in the isolated
`codex/phase-7-pdfium-native` worktree. It changes only Windows x64 PDFium
packaging and validation; version metadata remains `1.0.6`.

| Measurement | Phase 6 | Phase 7 locked package |
| --- | ---: | ---: |
| PDFium version | historical compatible archive | 149.0.7825.0 |
| Wrapper version | packaged 0.2.0 / source 0.3.0 | packaged 0.3.0 |
| Official upstream archive | not independently locked | 3,720,244 bytes |
| `pdfium.dll` | historical package | 7,178,240 bytes |
| Wrapper executable | historical package | 969,216 bytes |
| Deterministic engine ZIP | historical package | 3,961,574 bytes |
| Installed PDFium tree | historical package | 8,257,482 bytes |
| PDFium wrapper runtime tests | 6 | 7 |
| Handwritten files above 500 nonblank lines | 0 / 245 | 0 / 250 |

The official wrapper build uses `rust-lld` from Rust 1.96.0 on the declared
GitHub Actions `windows-2025` environment. This pins the MSVC system-library
inputs that differ across Windows SDK revisions. Its locked SHA-256 is
`1D1474C2EFF303112F00065D43818C2A4C005ACC71C4AE32E3BDC0B37D9CB0D4`.
Two packages from that environment produced the exact ZIP SHA-256
`819104B0FD72C49A81282C0E35552C57A0C98995EF830FC580778E75EF213D6D`.

The public three-asset prerelease and cache-empty download validate at the same
3,961,574 bytes. The final 18-step Windows gate passed in 2,246,500 ms. Its
unsigned NSIS is 998,186,835 bytes with SHA-256
`FEBAF4FAD2CC0BDD570BEEFF0C83CCA706526F75C3DBED987E1A7B8B5028EF28`.
The installed application remains exactly 26,734,080 bytes, with SHA-256
`C3D75F40F12BBE379F955BCE7F2ACAD08FBDDEC5986A826FD8833D35BA1FBD41`;
the size increase from Phase 6 is 0%.

The installed-resource corpus passed 40/40: clean mean 100%, difficult mean
99.76%, native/scanned/mixed PDF cases 100%, median measured recognition
33,794 ms and peak worker working set 749,379,584 bytes. No remote worker
connection was observed across 615 process samples while the host network
remained active. Both installation cycles used the locked wrapper and DLL,
then removed the isolated installation root successfully.

## Phase 8 macOS/Linux Packaging Implementation Snapshot

Phase 8 starts from `13e4285f2d455af8e4c3cd5da2b583047894bc4b` in
`codex/phase-8-macos-linux-native`. Metadata remains `1.0.6`. This Windows-side
snapshot records implementation and static/local checks only; native package
measurements remain pending the GitHub runner jobs.

| Measurement | Phase 8 local result |
| --- | ---: |
| Handwritten frontend/tooling files | 260 |
| Largest handwritten frontend/tooling file | 500 nonblank lines |
| Handwritten Rust files | 91 |
| Largest handwritten Rust file | 426 nonblank lines |
| Vitest | 44 passed |
| Rust unit tests | 142 passed, 7 ignored |
| npm production/development vulnerabilities | 0 / 0 |
| Python locked-runtime vulnerabilities | 0 |
| Phase 8 workflow contracts | passed |
| Native Apple Silicon/Intel/Linux packages | pending native workflows |

The locked upstream PDFium archives are 6,866,454 bytes on universal macOS
(`3782e6cbc13c75dcf6461fdd33048fd7507730e095181427de24c0c400ea3eb6`)
and 3,615,157 bytes on Linux x64
(`ae0e276bcdf276dca2746adb4780f79949620e5c655973ca252a3994bc516a13`).
Package size, runtime performance, 40-case corpus and launch evidence will be
recorded only after the exact checkpoint succeeds on native runners.
