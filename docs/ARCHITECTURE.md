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
8. `branding-kit/README.md` and `site/README.md`
