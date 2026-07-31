# Multi-Converter V1.0.7 Validation

## Current Status

- Target version: **V1.0.7**
- Published baseline: **V1.0.6**
- Last documentation review: **2026-07-31**
- Overall gate: **blocked**
- Version metadata: **1.0.6**
- Development checkpoint: local commit **`1be6b840`** on `codex/test`, not pushed

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

## Gate Summary

| Gate | Status | Blocking work |
| --- | --- | --- |
| Tiptap editor implementation | Implemented in development tree | Preserve current contracts while completing real host tests |
| Editor automated checks | Recorded pass | Rerun after any correction |
| Windows Tauri Office matrix | Pending | Complete ODT/DOCX/RTF import, edit, export and reopen scenarios |
| Native editor file drop | Pending manual proof | Validate in the real Tauri application |
| Editor restart and asset persistence | Pending manual proof | Confirm `mc-asset://` images after a clean restart |
| OCR implementation | Not started | Integrate local `PP-OCRv6_medium` |
| OCR Windows packaged-app matrix | Blocked by implementation | PDF-to-text and copy-text-from-image |
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

Status: **no implementation evidence yet**.

Before this section can pass, record:

- exact PaddleOCR, inference-runtime and `PP-OCRv6_medium` model versions;
- official archive origins, SHA-256 values, installed size and redistribution notices;
- the dedicated automated OCR command and its real totals;
- reviewed accuracy thresholds and fixture results;
- Windows packaged-app tests for native-text, scanned and mixed PDFs;
- PDF outputs to TXT, Markdown and HTML;
- PDF import to editable Tiptap JSON;
- explicit copy-text-from-image tests for every advertised image format;
- offline, progress, cancellation, limits, cleanup and original-integrity tests;
- proof that no model is downloaded during recognition and no OCR data is transmitted.

## Platform Release Evidence

### Windows x64

Status: **blocked by the editor manual matrix and OCR implementation**.

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
