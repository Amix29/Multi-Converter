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
| Desktop root (`src/`, `src-tauri/`) | Local application, converters, editor, planned OCR work and packaging |
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

Real conversion behavior belongs to Tauri/Rust. The Vite preview uses mocks and
is limited to frontend development.

## Editor Boundary

Editor drafts use `EditorDocumentV1` Tiptap JSON. Rich DOCX and RTF imports
pass through LibreOffice to ODT and then through the bounded ODT parser.
Validated local images are stored under the document directory and referenced
with `mc-asset://<uuid>`.

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

V1.0.7 OCR is planned around a packaged local `PP-OCRv6_medium` runtime. PDF
pages flow through native text extraction or PDFium rasterization before OCR.
Recognized content becomes TXT, Markdown, HTML or the existing Tiptap JSON
model.

No OCR implementation is considered available until the packaged runtime,
offline behavior, limits, cancellation, cleanup and platform matrices pass.

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
