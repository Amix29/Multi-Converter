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
| Desktop root (`src/`, `src-tauri/`) | Local application, converters, OCR and packaging |
| `site/` | Static marketing, download, format, guide and documentation pages |
| `branding-kit/` | Source logos, design tokens, brand guides, templates and mockups |

These areas share one Multi-Converter repository but remain independently
buildable. The site does not import desktop internals, and the desktop
application does not load the marketing site at runtime.

## Technical Architecture

| Layer | Responsibility |
| --- | --- |
| React + TypeScript | Converter, OCR and user-facing state |
| Tauri 2 IPC | Typed boundary between the WebView and native operations |
| Rust | File access, conversion orchestration, OCR and bounded parsers |
| Bundled engines | FFmpeg, PDFium, LibreOffice, Pandoc and libvips conversion paths |
| Local application data | Application preferences and verified OCR runtime caches |

The existing application does not need a new framework, database or local web
server for its Atelier integration.

## Rust Backend Boundaries

The Phase 4 backend keeps one Tauri crate and organizes native responsibilities
in three explicit layers:

```text
Tauri invoke handlers
  -> commands/*
  -> converters/* | ocr/* | engines/* | registry/*
  -> process_support.rs | engine_archive/* | engine_distribution/*
  -> local filesystem and bundled resources
```

`src-tauri/src/lib.rs` is the composition root: it registers application state,
plugins and the existing 20 commands, but does not implement conversion or
OCR behavior. The command modules translate Tauri inputs into domain calls;
domain modules remain directly unit-testable without a WebView. Existing facade
files retain their module paths and public contracts while delegating to focused
implementations.

The shared `process_support.rs` module is limited to operations that are truly
common to one-shot native processes: hidden Windows launch, bounded stdout and
stderr capture, timeout handling, portable Linux environment setup and process
tree termination. OCR keeps its persistent JSON-lines supervisor separate
because its model lifecycle, progress protocol and cancellation semantics are
different.

The audit follow-through adds a shared native admission pool in
`converters/resources.rs`. Its cancellation-aware RAII reservations coordinate
image/document/media operations and the retained OCR worker. The documented
2 GiB reservation budget is an estimate, not an OS memory limit.
`converters/media/remux.rs` owns fail-closed stream-copy compatibility separately
from re-encoding profiles. Image ICC/frame/depth policy lives in
`converters/image/fidelity.rs`. See `V1_0_7_AUDIT_FOLLOW_THROUGH.md` for proof
and explicit limits.

`converters/output.rs` owns same-directory staging and no-replace publication
for conversion results. `commands/export.rs` separately reserves user-facing
export names with exclusive file creation because export naming and authority
belong to the command boundary. Integrated ZIP text input is split again:
`converters/text/archive.rs` performs entry-count preflight and bounded archive
metadata validation, while `converters/text/read.rs` extracts only the
supported DOCX, EPUB or ODT text parts.

## Frontend Boundaries

The React frontend is organized by product responsibility instead of keeping
the whole workflow in one component:

| Area | Responsibility |
| --- | --- |
| `src/App.tsx` | Application lifecycle, composition of the converter, OCR and global overlays |
| `src/app/conversion/` | Pure conversion-selection rules and stateful file/conversion workflows |
| `src/app/screens/` | Files, format selection and conversion progress screens |
| `src/app/layout/`, `settings/`, `welcome/`, `feedback/` | Shell navigation and focused overlays or panels |

The converter and OCR dialog consume the public API from `src/lib/api.ts`.

## Frontend API Boundary

`src/lib/api.ts` remains the stable frontend facade. It re-exports the existing
contracts, including `MultiConverterApi` and the conversion/OCR contracts, then selects
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

Vellum Paper remains the desktop foundation. `src/styles.css` imports the focused
styles under `src/styles/`; components consume shared semantic `--vlm-*` tokens.
Editor styles, bundled editor icons and font controls have been removed.

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

## Conversion-Only Scope (2026-10-29)

The application exposes 20 native commands for conversion, OCR, export, onboarding
and external links, with `convert-progress` and `ocr-progress` events. Neither
frontend adapters nor the Tauri invoke handler expose document/PDF editing.
The former editor-only Office bridge and font-enumeration modules are removed;
the generic document conversion path retains LibreOffice and Pandoc.
Old local drafts remain untouched. Legacy saved mode preferences are ignored.

Batch report export runs its hashing and filesystem work off the async executor.
It validates outputs against the current managed batch, records their actual
SHA-256/size, and uses the same no-overwrite export transaction. Reports contain
basenames and bounded status/settings/warning codes; absolute paths, file bodies,
OCR text and raw errors are excluded. Exporting a report does not mark outputs
as safely exported or change their cleanup lifecycle.

The PDFium source wrapper accepts conversion/OCR commands only. Existing packaged
binaries and provenance fingerprints are not rewritten by this cleanup; the
wrapper dependency graph remains pinned until a reviewed engine rebuild.

## OCR Boundary

The frontend OCR dialog consumes only the typed API facade. Rust owns path and
real-type validation, resource integrity, temporary files, process supervision,
progress and cancellation. Runtime extraction and manifest/model verification
emit determinate preparation progress; worker startup and recognition remain
indeterminate because the official engine exposes no reliable fractional
value. A persistent JSON-lines sidecar loads the locked local
`PP-OCRv6_medium` pipeline on demand; only one OCR job can be active.

The cancellation flag is shared across archive extraction, manifest traversal,
hashing, PDF preparation and worker supervision. UI attempts are sequenced so
a cancelled job cannot overwrite a retry with late progress or a late result.
Cancelling resource verification is never cached as a permanent verification
failure, and the next attempt starts from a valid clean state.

PDFium wrapper 0.4 inspects every PDF page. Usable native text is retained,
while only insufficient pages are rendered at 300 DPI for OCR. The normalized
result then feeds the existing text serializers with explicit page separation. Image OCR accepts the five bounded local raster formats
and returns structured text for an explicit write-only clipboard action.

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

Phase 8 extends that boundary to `macos-universal` and `linux-x64`. A single
platform provenance lock fixes PDFium, PaddlePaddle, Python and the approved
V1.0.6 engine staging inputs. The universal macOS package carries two official
CPU worker archives (`arm64` and `x86_64`) but one shared model tree; Linux
carries only its x86_64 worker. Rust selects the worker from the process OS and
architecture, validates the archive hash and every extracted file, then checks
the Mach-O, ELF or PE machine type before launch. Foreign runtimes, duplicate
archive entries, links, traversal and missing executable permissions fail
closed. CoreML, OpenVINO and the native ONNX candidate remain unselected.

The post-audit wrapper is 0.4.0 while PDFium stays at 149.0.7825.0. Its Windows
package has a reproducible local fingerprint but remains unpublished, so the
committed historical 0.3.0 engine manifest is not a post-audit candidate.
macOS universal and Linux x64 package records fail closed as
`pending-native-rebuild` with unset measurements until native runners rebuild
and validate them.

## Sources Of Truth

1. Atelier [`AGENTS.md`](../../../AGENTS.md), its indexed rules and
   [`Stack.md`](../../../Stack.md)
2. Project [`AGENTS.md`](../AGENTS.md) and `.agents/rules/`
3. `docs/V1_0_7_PLAN.md`
4. `docs/V1_0_7_VALIDATION.md`
6. `docs/V1_0_7_OCR.md`
7. `docs/TESTING.md` and the platform release checklists
8. `docs/SECURITY.md` and the repository `SECURITY.md`
9. `branding-kit/README.md` and `site/README.md`
