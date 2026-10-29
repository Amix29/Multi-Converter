# Multi-Converter Desktop Security Architecture

Reviewed for the conversion-only scope on **2026-10-29**. Development metadata
is `1.0.7`; this document does not certify release or multiplatform readiness.
See repository `SECURITY.md` for vulnerability reporting.

## Local Threat Model

Untrusted inputs include selected/dropped/pasted files, folders, archives, XML,
engine output and fetched release metadata. Protected assets are original files,
conversion outputs, recognized text, application data and bundled runtimes.
The application does not protect against an already compromised OS or upstream
engine vulnerabilities outside its enforced packaging and invocation boundaries.

## Native And Filesystem Boundaries

The typed frontend facade exposes only conversion, OCR, export, onboarding and
external-link operations. The Tauri handler registers 19 commands. Document/PDF
editing, asset/draft management and system font-enumeration commands are removed.
Old drafts are left untouched; removal does not authorize deleting user data.

Native conversion engines run with bounded output capture, timeouts and process
tree termination. Windows children start without console windows; Unix children
use process groups. The persistent OCR worker has its own supervisor/protocol.

Export accepts canonical regular files inside managed temporary output roots.
Links/reparse points and escaping paths are rejected. Outputs are staged,
validated and atomically published without overwriting source files. Clipboard
imports use private temporary files with bounded sizes and validated formats.
DOCX/EPUB/ODT text readers, engine archives and OCR archives enforce their own
entry, path, type, compression and expanded-size limits before parsing/extraction.

## Local OCR Boundary

`PP-OCRv6_medium` runs from packaged, hash-verified resources with CPU selection,
offline environment flags and no cloud or model-download fallback. Image-text
copy is explicit and the clipboard plugin grants only `allow-write-text`.
PDF conversion retains usable native text and OCRs pages that need recognition;
there is no PDF mutation or editor-only text-layer command.

The OCR boundary rejects remote paths, false file types, corrupt inputs and
password-protected PDFs. Sources are capped at 128 MiB, images at 120 megapixels
and 32,768 pixels per side, PDFs at 2,000 pages and normalized text at 64 MiB.
Recognition has a 180-second page timeout. Temporary renders/results remain
scoped to unpredictable temporary directories; originals are never modified.

Runtime extraction rejects traversal, links and expansion overruns. File counts,
sizes, relative paths and every SHA-256 are verified against packaged manifests.
Cancellation is checked during extraction, hashing, verification and inference;
failed/cancelled verification is not cached. Cancelled UI jobs ignore late
results and progress, permitting a clean retry. See `V1_0_7_OCR.md` for locks,
fixtures, license inventory and native proof limits.

## Content And Network Boundaries

The WebView renders release-note Markdown with React elements and constrained
links; application content is not inserted as arbitrary HTML. Editor HTML
imports, DOMPurify, Tiptap/ProseMirror, docx.js workers and editor asset URLs no
longer exist in the application frontend.

The CSP in `src-tauri/tauri.conf.json` restricts scripts to `self`, blocks eval,
objects, forms and frames, and limits connections to IPC/development origins,
GitHub release metadata and optional Google release-note translation. Files and
recognized text must never be sent to these endpoints. Unavailable translation
falls back to the original English release notes.

The existing `style-src 'unsafe-inline'` exception remains needed for bounded
progress/virtualization and release-note table styles. Script restrictions
remain strict. The existing image-source allowlist is unchanged by this removal.

## Engine Provenance And Dependency Scope

Conversion engines and OCR resources retain their existing hashes and provenance
locks. The PDFium source wrapper no longer exposes editor commands; packaged
engine archives are not rewritten here. Its Cargo manifest/lock stay pinned to
the reviewed graph until a separate engine rebuild updates fingerprints/notices.
Application/frontend editor-only dependencies are removed without upgrading
unrelated locked packages.

## Verification And Proof Limits

See `V1_0_7_VALIDATION.md` for checks performed on this change. Browser mocks prove
UI behavior only. Rust and wrapper runtime tests prove their named contracts;
installed packages, real inference, platform packaging and final publication
require their own evidence. Earlier editor security reviews are historical.
