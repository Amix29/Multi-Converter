# Multi-Converter V1.0.7 Development Plan

## Status

- Development version: **V1.0.7**; published baseline: **V1.0.6**.
- Last documentation review: **2026-11-01**.
- Release status: **not ready**.
- Approved next architecture: desktop Svelte 5 + Tailwind 4 + shadcn-svelte,
  retaining Rust/Tauri/TypeScript/Vite. The maintainer approved it on 2026-11-01;
  [execution mandate and acceptance](MANDAT_MIGRATION_SVELTE.md). The present
  checkpoint remains React; migration implementation has not started. The site
  is outside this migration, and final-source/platform gates must be renewed.
- Current application-source checkpoint: `853aa081`, integrated on `codex/test`;
  current maintenance branch: `codex/app-design-system`. Documentation-only
  commits may follow this functional checkpoint.
- Workspace: standalone `Développement/Multi-Converter`;
  [location, rules and worktree recovery](LOCAL_WORKSPACE.md).
- Preserved local NSIS/AppImage/DMG candidates use `8b510138`; they predate the
  new interface and are not packages of `853aa081`. All remain unpublished with
  installed acceptance pending.
- macOS targets Apple Silicon on macOS 15 and later; Windows x64 and Linux x64 remain supported.
- Conversion/OCR audit: `codex/audit-follow-through`, based on integrated `41459c23`;
  [current work and handoff](V1_0_7_AUDIT_FOLLOW_THROUGH.md).
- `codex/test` remains the persistent integration/CI validation branch; `main` is the public stable branch.

The maintainer cancelled document and PDF editing on 2026-10-29. Multi-Converter
is a file converter. The active V1.0.7 objective is local `PP-OCRv6_medium` OCR
for PDF-to-text conversion and copying text from images, alongside the existing
conversion workflows. There is no document creation, rich-text workspace,
PDF modification, draft management or editor-specific native command surface.

The repository metadata is synchronized to `1.0.7`. This version change is not a release-readiness claim.
Do not publish application release notes, updater metadata or release assets
until the remaining gates close.

## Retained Behavior

- Files → Formats → Conversion, with native picker/drop, implicit clipboard import,
  batch jobs, cancellation, retries, temporary outputs and destination export.
- Document, PDF, image, audio and video conversion through the existing Rust,
  FFmpeg/ffprobe, PDFium, LibreOffice, Pandoc and libvips paths.
- Image text extraction and explicit copy through the OCR dialog.
- PDF hybrid extraction: usable native text first; local OCR for scanned pages.
- Packaged local `PP-OCRv6_medium` resources, CPU selection, verification, progress,
  cancellation and cleanup, with no runtime model downloads or cloud fallback.
- Existing settings, onboarding, feedback and update behavior.
- Approved light/dark brand system, local system/light/dark preference, custom
  quality/media selectors, short accessible motion and glass navigation. Colored
  primary actions use warm-white text and deeper action shades; the exact brand
  anchors are unchanged. See [UI implementation and checks](APP_DESIGN_SYSTEM_ADOPTION.md).

## Removal And Data Handling

Both editor frontends, their styles, adapters, schemas, native domains and IPC
commands are removed. Tiptap/ProseMirror, docx.js, DOMPurify and Lucide frontend
dependencies and notices are removed with the editor-only test suites and
translations. Windows DirectWrite and the Linux font-enumeration dependency are
removed from the application manifest.

The PDFium source wrapper no longer accepts structural inspection, patches,
editable copies or editor-page rendering; its conversion/OCR text inspection,
page count and image rendering remain. Its dependency manifest and Cargo lock
are retained because the existing engine preparation/provenance contracts pin
the exact wrapper graph. Removing those unused dependencies requires a new
reviewed engine build, fingerprints and notices, and is not silently folded into
this application cleanup. Existing staged engine binaries are unchanged.

Legacy `multi-converter-app-mode=editor` preferences no longer select a workspace.
Old local drafts, images and user source documents are not deleted or migrated.
Historical editor reports remain explicitly historical, accessible through Git
and the documentation index; they no longer define feature or release gates.

## Remaining Release Gates

1. Run the canonical Windows gate on the final integrated source and lockfiles.
2. Verify installed Windows conversion/OCR, native picker/drop, offline behavior,
   cancellation, cleanup, restart and source integrity using the current 66-scenario
   acceptance manifest. Old 101-scenario editor-inclusive receipts are historical.
3. Build and verify real macOS Apple Silicon and Linux x64 engine/runtime packages;
   complete native conversion/OCR and final downloaded-package acceptance.
4. Review final third-party licenses/NOTICE files and signed updater artifacts.
5. Validate exact application assets and release metadata before publication.

`docs/V1_0_7_VALIDATION.md` records current checks and proof limits.
`docs/V1_0_7_OCR.md` remains the OCR runtime and behavior contract.
Browser previews prove UI behavior only, not native conversions or inference.

## Approved Audit Implementation — 2026-10-30

The maintainer approved the comprehensive audit recommendations and retired Intel
macOS. Windows x64, Apple Silicon macOS and Linux x64 remain the supported targets.
The implementation and evidence ledger is [V1_0_7_APPROVED_IMPLEMENTATION.md](V1_0_7_APPROVED_IMPLEMENTATION.md).
It separates completed changes, local checks and outstanding native/release gates.
Historical V1.0.6 universal artifacts and their evidence remain unchanged.
