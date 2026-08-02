# Multi-Converter Desktop Security Architecture

## Status And Purpose

This document describes the security boundaries implemented in the desktop
source tree. Package metadata remains at V1.0.6 while the editor and OCR work
is under development for V1.0.7. This document is not a release-readiness
statement; packaged and multiplatform OCR gates remain open.

Use the repository [`SECURITY.md`](../SECURITY.md) for supported versions and
private vulnerability reporting. Do not attach crafted documents, personal
files, secrets or sensitive logs to a public issue.

## Local Threat Model

Multi-Converter treats these inputs as untrusted:

- selected, dropped or pasted files and folders;
- document HTML produced by an importer or pasted into Tiptap;
- document JSON and asset metadata loaded from local application data;
- archives, XML and outputs handled by native converters or bundled engines;
- release metadata and release-note text fetched from allowed endpoints.

The protected assets are the user's source files and paths, conversion outputs,
editor drafts and images, application data, and the integrity of the local
application and bundled engines.

The main trust boundaries are:

| Boundary | Security responsibility |
| --- | --- |
| React WebView | Render only constrained application or document content and call the typed API facade |
| HTML to Tiptap | Remove active or unsupported markup before ProseMirror parses it |
| Tauri IPC | Expose the explicit `MultiConverterApi` command set rather than unrestricted native access |
| Rust filesystem and editor code | Validate paths, document assets, bounded formats and atomic writes |
| Bundled engines | Operate on local files through the native orchestration layer and validate resulting artifacts |
| Network | Limit WebView connections to the configured update/release-note and translation destinations |

The model does not attempt to defend against an already-compromised operating
system or administrator account. An upstream engine vulnerability remains an
upstream issue unless Multi-Converter's packaging, arguments or validation
exposes additional impact.

## Native Process Boundary

One-shot FFmpeg, ffprobe and advanced-engine invocations use a shared native
process primitive. It launches without a console window on Windows, disables
stdin, drains stdout and stderr concurrently, retains at most 128 KiB from each
stream, preserves the exit status and applies a caller-selected timeout. A
timeout or I/O failure stops the child process tree and waits for termination
before control returns to output cleanup.

On Unix, supervised children start in their own process group so termination
also reaches descendants that inherited an engine's output pipes. Output-drain
joins are themselves bounded to prevent a descendant from keeping the caller
blocked indefinitely. Windows uses the existing process-tree termination path.

The primitive is covered for large output, non-zero exit status, launch failure,
timeouts and paths containing spaces or non-ASCII characters. Callers still own
engine-specific validation and error wording; sharing process mechanics does
not broaden filesystem authority. The persistent OCR worker deliberately keeps
its separate supervisor, locked JSON-lines protocol, resource verification and
job lifecycle.

## Filesystem, Export And Archive Boundary

Conversion exports accept only canonical regular files inside a managed
temporary output root. A source path is rejected when any existing component
is a symbolic link or, on Windows, a reparse point. This prevents an export
request from using a link or junction to copy an unrelated file. Conversion
outputs are written to same-directory staging files, validated and published
with a no-replace atomic link so concurrent jobs cannot overwrite an existing
result. Uncommitted staging files are removed automatically. Export commands
reserve collision-free destination names with `create_new`, write through the
reserved handle and remove a partial destination on failure; terminal symbolic
links are never followed. Source files are never modified.

ODT, OCR-runtime and engine archives keep responsibility-specific entry-count,
path, type and expanded-size limits. Integrated DOCX, EPUB and ODT text readers
preflight the ZIP central-directory entry count before constructing the archive
index, including ZIP64 metadata, then bound cumulative expanded size,
compression ratios, duplicate names and entry-name length. Archives reject
absolute paths, parent traversal and links before extraction or parsing. The
shared checks are used only where their security limits are identical; the
bounded editor ODT reader keeps its own XML, asset and package rules.

Memory-backed clipboard imports are created through a private temporary
directory. Unix directories use mode `0700` and imported files use mode `0600`;
Windows relies on the current account's temporary-directory access controls.
The command accepts at most 24 files, 128 MiB per file and 512 MiB for the
batch. The aggregate limit is checked after Tauri has deserialized the public
`Vec<ClipboardFile>` contract; this command-level check does not prove a bound
on memory already used by a hostile IPC payload during framework
deserialization.

## HTML Sanitization Boundary

All rich HTML entering an editor surface uses `sanitizeImportedHtml()` before
Tiptap parses it:

- document-import HTML passes through the sanitizer and local image
  normalization before `setContent()`;
- rich clipboard HTML and dropped HTML in the document body pass through
  Tiptap's `transformPastedHTML` hook (ProseMirror routes both through its
  clipboard parser);
- rich clipboard or dropped HTML in header and footer dialogs uses the same
  hook.

The sanitizer is based on the pinned `dompurify` 3.4.12 package. DOMPurify
applies an explicit allowlist, then a second DOM pass enforces link, image,
attribute and inline-style rules. The sanitized string is the only HTML passed
on to the editor.

### Allowed Elements

The allowlist contains only structures represented by the editor:

- paragraphs and blocks: `p`, `br`, `hr`, `blockquote`, `pre`, `code`;
- headings: `h1` through `h6`;
- inline text: `strong`, `em`, `i`, `u`, `s`, `strike`, `del`, `mark` and
  `span`;
- lists: `ul`, `ol`, `li`;
- links: `a`;
- tables: `table`, `thead`, `tbody`, `tfoot`, `tr`, `th` and `td`; `colgroup`
  and `col` are retained only as TableKit column-width helpers and do not
  become document nodes;
- constrained editor nodes: `div` for page breaks and `aside` for unsupported
  imported objects;
- localizable images: `img`.

Allowed attributes are limited to `alt`, `colspan`, `colwidth`, `data-align`,
`data-asset-id`, `data-page-break`,
`data-unsupported-object`, `height`, `href`, `rel`, `rowspan`, `src`, `start`,
`style`, `target`, `title` and `width`. Arbitrary ARIA and other `data-*`
attributes are disabled.

A `div` survives only as an attribute-free page-break node normalized to
`data-page-break="true"`; other `div` wrappers are unwrapped. An `aside`
survives only as an attribute-free unsupported-object node normalized to
`data-unsupported-object="true"`; other `aside` wrappers are unwrapped.

Links may use only `http:`, `https:`, `mailto:` or a same-document `#`
fragment. A target may be `_self` or `_blank`; `_blank` is always normalized to
`rel="noopener noreferrer"`.

### Forbidden Content

The boundary removes scripts, style blocks, embedded browsing or plugin
content, forms and active vector markup. In particular, `script`, `style`,
`iframe`, `object`, `embed`, `link`, `meta`, `form`, `input`, `button`, `svg`
and `math` are forbidden. Content belonging to scripts, styles, frames,
objects, embeds and forms is discarded rather than retained as editor text.

Event-handler attributes and `srcdoc`, `formaction` and `xlink:href` are
removed independently of DOMPurify's allowlist. Unknown protocols are not
allowed.

Inline styles are retained only for the editor features that need them. The
allowed properties are `background-color`, `color`, `font-family`,
`font-size`, `font-style`, `font-weight`, `text-align`, `text-decoration` and
image `width`. Values are limited to 160 conservative characters and are
rejected if they contain `expression`, `url`, `var`, `behavior`,
`-moz-binding` or `@import`.

Table cell `colspan` and `rowspan` values are positive integers capped at 100.
TableKit column widths are positive integers capped at 4096 pixels; a cell's
`colwidth` list is retained only when it has exactly one width per spanned
column. Invalid or excessive values are removed so TableKit falls back to its
safe defaults instead of iterating over attacker-controlled dimensions.

## Editor Image Boundary

Persistent editor content must reference images as
`mc-asset://<uuid>` together with the matching asset identifier. It must not
persist remote URLs, filesystem paths, Blob URLs or Base64 image data.

The frontend applies these controls:

- direct image insertion accepts PNG, JPEG, WebP or GIF files only;
- at most eight files are processed per insertion and each file is limited to
  24 MiB before it is sent to the editor asset command;
- Base64 PNG, JPEG, WebP or GIF data from a document import is temporarily
  accepted for migration, bounded to 32 MiB of encoded text and 24 MiB after
  decoding, then stored through `editorStoreAsset` and rewritten to
  `mc-asset://`;
- Base64 images in pasted HTML are removed because the synchronous Tiptap
  transform cannot persist them first; pasted image files use `FileHandler`,
  `editorStoreAsset` and `mc-asset://` instead;
- an existing `mc-asset://` image is retained only when its UUID, declared
  asset ID and current document asset list agree;
- remote or inaccessible images are replaced by explicit text instead of being
  fetched by the editor.

The Rust editor boundary validates persisted asset references again and owns
the local document asset directory. Blob URLs are created only for displaying
bytes returned by `editorReadAsset` and are revoked when the image view is
disposed.

## Content Security Policy

The exact WebView CSP configured in `src-tauri/tauri.conf.json` is:

```text
default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' asset: http://asset.localhost data: blob:; font-src 'self'; connect-src ipc: http://ipc.localhost http://localhost:1420 ws://localhost:1420 https://api.github.com https://translate.googleapis.com; object-src 'none'; base-uri 'self'; form-action 'none'; frame-src 'none'; frame-ancestors 'none'
```

Its intended controls are:

- scripts are restricted to application resources; neither inline scripts nor
  `unsafe-eval` are enabled;
- objects/plugins are disabled and the document base URL stays self-hosted;
- images are limited to application resources, Tauri's asset protocol and the
  transient `data:`/`blob:` forms used by controlled editor flows;
- WebView connections are limited to Tauri IPC/development origins, GitHub
  release metadata and the optional Google release-note translation endpoint;
- conversions and editor documents remain local and must never be sent to
  those endpoints.

### Controlled `style-src 'unsafe-inline'` Exception

The application currently requires dynamic style attributes for bounded UI
values such as progress widths, editor page scale, image width and release-note
table alignment. Sanitized document HTML may also retain the small inline-style
allowlist documented above. These runtime values cannot be represented by a
fixed CSP hash.

For that reason, `style-src 'unsafe-inline'` is a documented exception rather
than a general content permission. Its compensating controls are:

- `script-src` remains strict and does not inherit the style exception;
- imported and pasted HTML is sanitized before parsing;
- active CSS constructs and unlisted properties are removed;
- remote stylesheets, `style` elements, `@import` and CSS `url()` values are
  rejected at the editor boundary;
- `object-src 'none'`, `base-uri 'self'`, `form-action 'none'`,
  `frame-src 'none'` and `frame-ancestors 'none'` remain enforced.

Removing this exception later requires replacing every dynamic style attribute
and editor inline-style feature; it must not be removed without equivalent UI
and document validation.

## Network And Privacy Boundary

File conversion, draft persistence, editor assets and bundled-engine execution
are local operations. The WebView allowlist includes GitHub's API for release
metadata and Google's translation endpoint for optional release-note
translation. If translation is unavailable, the application displays the
original English notes. User files, file contents, editor text and recognized
OCR text must not be included in those requests.

Phase 3 OCR uses only bundled, hash-verified local resources. The worker starts
with offline environment flags and has no cloud fallback. Sources and text are
not sent to the existing release-metadata or optional release-note translation
endpoints. The frontend receives structured results and never receives general
filesystem authority.

The OCR boundary rejects remote paths, false file types, corrupt inputs and
password-protected PDFs. It caps sources at 128 MiB, decoded images at 120
megapixels and 32,768 pixels per side, PDFs at 2,000 pages and normalized text
at 64 MiB. Recognition has a 180-second page timeout. Temporary normalized
images, PDF renders and results are scoped to unpredictable temporary
directories and originals are never modified.

The runtime and model each carry a per-file manifest. The packaged Windows
runtime archive is extracted only into application-local data through a reader
that rejects absolute paths, parent traversal, symlinks, excessive entries and
expanded-size overruns. Rust then compares file count, total size, aggregate
lock value, every relative path and every SHA-256 before the first job.
Unexpected files, non-regular filesystem entries and tampering are rejected.
Cancellation and crash terminate the Windows process tree and force a clean
worker on the next job.

Windows LibreOffice packaging uses its already hash-locked engine archive to
stay below the NSIS raw-resource limit. Rust verifies the embedded archive hash
against `engines-manifest.json`, applies the same traversal and expansion
guards, and extracts it on the first conversion that needs LibreOffice. The
source engine remains unchanged; only its package representation differs.

Clipboard access is restricted to `clipboard-manager:allow-write-text`.
Multi-Converter cannot read, monitor, clear or write image/HTML clipboard data
through this capability.

## Verification And Proof Limits

Phase 2 adds compiled-preview coverage for hostile imported and pasted HTML.
The exercised fixtures include scripts and embedded content, event attributes,
dangerous link protocols, active CSS, remote images, excessive table spans and
Base64 images pasted into both the document body and a header/footer surface.
The checks preserve supported text and safe links while confirming that active
content does not execute. Static editor contracts also pin DOMPurify, keep the
sanitizer on every rich-HTML entry point and preserve the CSP boundary.

The final 15-step Windows gate passed on 2026-07-31 after the last CSS and test
corrections. It included both npm audits, static application and CSP contracts,
the compiled hostile-HTML scenarios, Rust and PDFium checks, the complete
conversion matrix, the production build and local Tauri/NSIS packaging. This
gate strengthens the Windows checkpoint but does not broaden the proof limits
below.

Phase 3 real Tauri development-runtime checks exercised local inference,
resource verification, cancellation, forced worker crash, restart, native,
scanned and mixed PDFs, editor import and semantic HTML. Unit tests cover the
five image normalizers, limits, invalid sources, manifest tampering and unsafe
archive paths. The local unsigned NSIS build succeeds with compressed OCR and
LibreOffice resources. Its exact extracted executable also passed native PNG
paste, OCR, explicit copy, cancellation, worker termination and retry. Sampled
process inspection found zero TCP connections and the worker used the locked
CPU provider. This is not a continuous packet capture and does not prove the
installed-NSIS lifecycle, every packaged path, complete dependency notices,
macOS or Linux.

The exact Windows runtime inventory records 71 Python distributions and 105
embedded license files. The absence of an embedded `bce-python-sdk` license is
explicitly locked and blocks public redistribution. Runtime process counters
recorded 1,069.8 MiB peak working set and 1,939.1 MiB peak paged memory on the
reviewed fixture; these are measured baselines, not security limits or
cross-platform guarantees.

The Phase 4 backend refactor passed the 18-step Windows gate, including both npm
audits, the allowed-warning Rust audit, Rust formatting and Clippy, 138 unit
tests, the 6/6 conversion matrix, the real LibreOffice archive extraction,
PDFium, the OCR runtime and corpus, and the local Tauri/NSIS build. Tests also
exercise process timeout and termination, bounded output, archive traversal,
symlink/reparse-point export rejection and serialized command contracts.

A Phase 4 release executable built before the final adversarial hardening was
launched and its process path was verified. Native clipboard-file import, PNG
OCR, explicit text copy, PNG to WebP conversion, export, editor autosave,
recent-document refresh and reopen passed. The final rebuilt executable passed
the automated gate but was not re-exercised interactively. This does not prove
the installed NSIS lifecycle, native UI ODT import, manual conversion
cancellation, macOS or Linux behavior; those gates remain open.

Passing TypeScript, unit, preview or static CSP tests does not prove that native
filesystem behavior, engine isolation, packaging or real conversions are safe.
Vite preview uses mocks and cannot validate Tauri IPC or local asset storage.
Windows validation does not prove macOS or Linux behavior; those platforms
require their documented native gates. Dependency audits report known
advisories in the inspected graph, not the absence of exploitable defects.
