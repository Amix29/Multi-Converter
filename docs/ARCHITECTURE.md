# Multi-Converter Architecture

## Atelier Integration

The global workspace boundaries are defined by
[`../../../AGENTS.md`](../../../AGENTS.md) and its architecture rule. Multi-Converter
adds only one integration detail: the portal launches the installed desktop
application through its validated registry entry.

```text
atelier/config/projects.json
  -> validated installed Multi-Converter executable
  -> independent Tauri desktop application
```

No additional runtime, localhost server or source-code bridge is required.

## Repository Areas

| Area | Responsibility |
| --- | --- |
| Desktop root (`src/`, `src-tauri/`) | Local application, converters, editor, OCR and packaging |
| `site/` | Static marketing, download, format, guide and documentation pages |
| `branding-kit/` | Source logos, design tokens, brand guides, templates and mockups |

These areas share one Multi-Converter repository but remain independently
buildable. The site does not import desktop internals, and the desktop
application does not load the marketing site at runtime.

## Technical Architecture

| Layer | Responsibility |
| --- | --- |
| React + TypeScript | Converter, editor and user-facing state |
| Tiptap + ProseMirror | Local rich-document editing |
| Tauri 2 IPC | Typed boundary between the WebView and native operations |
| Rust | File access, conversion orchestration, editor persistence and bounded parsers |
| Bundled engines | FFmpeg, PDFium, LibreOffice, Pandoc and libvips conversion paths |
| Local application data | Draft JSON, validated editor assets and application state |

The existing application does not need a new framework, database or local web
server for its Atelier integration.

## Rust Backend Boundaries

The Phase 4 backend keeps one Tauri crate and organizes native responsibilities
in three explicit layers:

```text
Tauri invoke handlers
  -> commands/*
  -> converters/* | editor/* | ocr/* | engines/* | registry/*
  -> process_support.rs | engine_archive/* | engine_distribution/*
  -> local filesystem and bundled resources
```

`src-tauri/src/lib.rs` is the composition root: it registers application state,
plugins and the existing 35 commands, but does not implement conversion or
editor behavior. The command modules translate Tauri inputs into domain calls;
domain modules remain directly unit-testable without a WebView. Existing facade
files retain their module paths and public contracts while delegating to focused
implementations.

The shared `process_support.rs` module is limited to operations that are truly
common to one-shot native processes: hidden Windows launch, bounded stdout and
stderr capture, timeout handling, portable Linux environment setup and process
tree termination. OCR keeps its persistent JSON-lines supervisor separate
because its model lifecycle, progress protocol and cancellation semantics are
different.

`converters/output.rs` owns same-directory staging and no-replace publication
for conversion results. `commands/export.rs` separately reserves user-facing
export names with exclusive file creation because export naming and authority
belong to the command boundary. Integrated ZIP text input is split again:
`converters/text/archive.rs` performs entry-count preflight and bounded archive
metadata validation, while `converters/text/read.rs` extracts only the
supported DOCX, EPUB or ODT text parts. The editor's richer ODT domain retains
its separate package, XML, style, Tiptap and writer rules.

## Frontend Boundaries

The React frontend is organized by product responsibility instead of keeping
the whole workflow in one component:

| Area | Responsibility |
| --- | --- |
| `src/App.tsx` | Application lifecycle, active mode and composition of the converter, editor and global overlays |
| `src/app/conversion/` | Pure conversion-selection rules and stateful file/conversion workflows |
| `src/app/screens/` | Files, format selection and conversion progress screens |
| `src/app/layout/`, `settings/`, `welcome/`, `feedback/` | Shell navigation and focused overlays or panels |
| `src/editor/EditorWorkspace.tsx` | Editor mode lifecycle, document opening and recent-document refresh |
| `src/editor/DocumentEditor.tsx` | Active Tiptap document, autosave, save/export coordination and editor composition |
| Other `src/editor/` modules | Canvas, toolbar, document commands, dialogs, local assets, extensions, search, pagination and HTML sanitization |

The converter and editor consume the public API from `src/lib/api.ts`. They do
not import the Tauri or preview implementations directly.

## Frontend API Boundary

`src/lib/api.ts` remains the stable frontend facade. It re-exports the existing
contracts, including `MultiConverterApi` and `EditorDocumentV1`, then selects
one implementation without changing the command signatures:

```text
src/lib/api.ts
  -> api/contracts.ts        shared public types
  -> api/tauriAdapter.ts     typed Tauri command and event mapping
  -> api/previewAdapter.ts   browser-preview state and mock behavior
  -> api/previewFixtures.ts  deterministic preview descriptions and fixtures
```

The Tauri adapter is the real desktop boundary. The preview adapter cannot
access files, sidecars or native engines and is not evidence that a conversion
works.

Normal production builds select the Tauri adapter. Browser mocks are enabled
only by Vite's explicit `preview` mode or by a non-Tauri development browser.
`npm run build:frontend:preview` is therefore the supported compiled-preview
command, while `npm run build:frontend` remains the production command. The
production-build contract verifies that the packaged command never opts into
preview mode; production-output inspection remains part of frontend validation.

## Vellum Styling Boundary

`src/main.tsx` loads the vendored Vellum 1.0 tokens from
`src/styles/vendor/vellum-tokens.css`, followed by the application styles.
Paper is the active application theme. Multi-Converter does not expose a
Carbon preference, and it does not fetch fonts, stylesheets or visual assets at
runtime.

`src/styles.css` is only the ordered stylesheet entry point. Shell, files,
formats, progress, welcome, settings, notices, feedback, motion and responsive
rules live in focused files under `src/styles/`; editor-specific presentation
remains in `src/editor/editor.css`. Components consume semantic `--vlm-*`
tokens as the shared application theme contract; focused styles may derive
local presentation values without defining another selectable theme.

## Marketing Site Boundary

`site/` is a Next.js 16 application configured for static export. It owns its
package lock, source routes, SEO checks and public media. The repository-level
Pages workflow runs commands from `site/` and publishes only `site/out`.

The site may link to verified GitHub releases and public project documentation,
but it is not part of the local conversion runtime and never receives user
files.

## Branding Boundary

`branding-kit/` is the source of reference for logos, tokens, brand guidance,
templates and mockups. Runtime-ready or web-optimized copies may live beside
their consumer, such as `site/public/`, while retaining the branding source
name and documented intent.

## Conversion Boundary

Inputs are treated as untrusted. Rust validates paths, file types, limits and
engine results before an output replaces its temporary sibling. The WebView
receives typed results rather than unrestricted file-system access.

The conversion domain separates job validation, orchestration, progress and
cancellation from media, image, document, text and output-finalization
adapters. Engine preference, fallback order, parameters, warnings, filenames
and observable error prefixes remain compatible. One-shot engine output is
drained concurrently and retained only as a bounded tail so verbose child
processes cannot deadlock or grow memory without limit; timed-out children are
terminated before temporary output is cleaned.

Real conversion behavior belongs to Tauri/Rust. The Vite preview uses mocks and
is limited to frontend development.

## Editor Boundary

Editor drafts use `EditorDocumentV1` Tiptap JSON. Rich DOCX and RTF imports
pass through LibreOffice to ODT and then through the bounded ODT parser.
Validated local images are stored under the document directory and referenced
with `mc-asset://<uuid>`.

The ODT boundary is split into package validation, XML reading, style and
namespace interpretation, Tiptap conversion, HTML rendering and ODT writing.
This keeps archive limits and path checks independent from document semantics
while preserving the existing import/export facade and serialized document
schema.

Office and PDF exports originate from the editor document model through the
rich ODT generator. Deleting a draft removes only its local draft and assets,
never the imported source.

Closing an active document is an ordered operation: finish the pending
autosave, refresh the recent-document list and only then return to the editor
landing screen. If saving or refreshing fails, the active document remains
open and the error stays visible instead of presenting a stale landing state.

Untrusted HTML is sanitized before it is handed to Tiptap. Embedded accepted
images are persisted through the editor asset API and rewritten to validated
`mc-asset://<uuid>` references. The detailed allowlist, CSP and proof limits
are documented in [`SECURITY.md`](SECURITY.md).

## OCR Boundary

The frontend OCR dialog consumes only the typed API facade. Rust owns path and
real-type validation, resource integrity, temporary files, process supervision,
progress and cancellation. A persistent JSON-lines sidecar loads the locked
local `PP-OCRv6_medium` pipeline on demand; only one OCR job can be active.

PDFium 0.3 inspects every PDF page. Usable native text is retained, while only
insufficient pages are rendered at 300 DPI for OCR. The normalized result then
feeds the existing text serializers or `EditorDocumentV1` with explicit page
breaks. Image OCR accepts the five bounded local raster formats and returns
structured text for an explicit write-only clipboard action.

On Windows, the official CPU runtime is stored as one verified compressed
archive and extracted into application-local data on first use. Its complete
per-file manifest is checked after extraction. The existing LibreOffice
runtime uses the same package-size strategy with its separately hash-locked
release archive and on-demand extraction; PDFium, Pandoc and libvips remain
direct resources. Archive readers reject absolute paths, parent traversal,
symlinks and configured size or entry-count overruns.

The Windows official CPU sidecar is implemented and exercised in the real
Tauri development runtime, and the local unsigned NSIS build passes with all
engines retained. Installed-package behavior is not yet proven. Runtime
selection, hashes, limits, evidence and remaining platform gates live in
[`V1_0_7_OCR.md`](V1_0_7_OCR.md).

Phase 4 leaves the OCR runtime, model lock, hybrid PDF policy, limits and public
contracts functionally unchanged. It adopts no generic process abstraction for
the persistent OCR worker.

Phase 6 makes the Windows OCR build supply chain reproducible through an exact
hash-locked Python/uv input and a generated license inventory. The selected
runtime remains the official persistent CPU worker: targeted alternatives are
kept outside application resources and may be selected only after their size,
quality and stability gates all pass. Corpus fixtures are committed with input,
expected-output, provenance and SHA-256 metadata; generated runtime evidence
stays under ignored `test-results/` paths.

Phase 7 gives Windows PDFium its own immutable provenance boundary. The
official `pdfium-win-x64.tgz` input, `pdfium.dll`, wrapper source lock, Rust
toolchain, compiled wrapper and final engine ZIP all have exact sizes and
SHA-256 values in `tools/pdfium-windows-x64.lock.json`. Preparation refuses a
different version, architecture or payload. Packaging sorts regular files,
normalizes ZIP timestamps and metadata, and rejects reparse points. The
installed engine keeps the existing `bundled-engines/pdfium/compatible` path;
the conversion and OCR domains therefore retain their public contracts and
hybrid page-selection policy.

## Sources Of Truth

1. Atelier [`AGENTS.md`](../../../AGENTS.md), its indexed rules and
   [`Stack.md`](../../../Stack.md)
2. Project [`AGENTS.md`](../AGENTS.md) and `.agents/rules/`
3. `docs/V1_0_7_PLAN.md`
4. `docs/V1_0_7_VALIDATION.md`
5. `docs/V1_0_7_EDITOR_VALIDATION.md`
6. `docs/V1_0_7_OCR.md`
7. `docs/TESTING.md` and the platform release checklists
8. `docs/SECURITY.md` and the repository `SECURITY.md`
9. `branding-kit/README.md` and `site/README.md`
