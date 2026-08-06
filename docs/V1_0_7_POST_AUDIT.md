# Multi-Converter V1.0.7 Post-audit Correction Ledger

## Scope and candidate identity

- Base checkpoint: `80a0c3838e48e470d99e6a6e27f44c245509bc84`.
- Development branch: `codex/v1-0-7-post-audit`.
- Development version: `1.0.7`.
- Publication status: not authorized and not release-ready.
- Review date: 2026-08-06.

This programme replaces the application candidates built before the post-audit
changes. Every NSIS, DMG, AppImage, updater archive, signature, checksum and
`latest.json` produced from an earlier checkpoint is obsolete. None may be
relabelled as a V1.0.7 candidate.

## Implementation status

| Lot | Development status | Evidence boundary still open |
| --- | --- | --- |
| 1 — shell and large converter | Implemented | Packaged UI and real very-large conversion run |
| 2 — folder hierarchy | Implemented | Native folder picker/export on all three platforms |
| 3 — editor controls and system fonts | Implemented | Real system-font catalog and PDF embedding on macOS/Linux |
| 4 — direct DOCX | Implemented in source | Word and LibreOffice reopen/visual corpus; packaged cancellation |
| 5 — structural PDF editor | Implemented; corrected Windows engine and installed NSIS path validated locally | User UI acceptance, macOS/Linux 0.4.0 packages and full native corpus |
| 6 — Vellum, documentation and stabilization | In validation; repository check and focused guardrails pass | Remaining aggregate/platform gates and final release baselines |

## Converter and hierarchical export

The top bar keeps the logo next to the product name and makes settings an
independent responsive action. File cards use a three-row virtual window with
complete accessible names. Unsupported entries can be removed together and
are stably sorted after convertible entries in the format step. The output step
mounts only its visible rows and keeps summary, filters, progress and Cancel
outside the scrolling window. Language changes update presentation state only;
they do not restart engine or OCR initialization.

`FileDescription.importOrigin` is optional for IPC compatibility. A folder
origin records only a normalized root identity/name and relative components.
`ExportEntryV1` recreates one collision-resolved root per imported tree while
isolated files remain at destination root. Rust rejects absolute/parent/empty
components, ambiguous aliases, links and reparse points and checks the final
resolved destination boundary. Each conversion job has an isolated temporary
output before the final copy or move.

## Editor controls and fonts

The editor uses compact Vellum-owned comboboxes and popovers instead of native
font-size/color controls. Point size accepts `1..400`, including decimals, and
retains the common presets. Paragraph line height accepts presets plus a
bounded custom value. Text/highlight previews are reversible and do not add
document history until Apply; mixed selections remain mixed. The highlight
icon keeps a black glyph while its indicator reflects the selected color.

The application no longer ships or installs fonts. Windows uses DirectWrite,
macOS CoreText and Linux Fontconfig to return family names only. Physical font
paths never cross IPC. The menu orders the default family, three recent
families and the virtualized alphabetical catalog. Before document-to-PDF,
the exact requested face and `OS/2.fsType` are inspected. A restricted,
bitmap-only, unknown or glyph-incomplete face receives a bounded per-run local
fallback with a visible warning; the editable document is not mutated.

Images have eight resize handles, pointer/keyboard movement and explicit flow,
front/behind-text and layer-step/all controls. Table rows and columns expose
pointer, touch and keyboard resize handles. Finite document-safety bounds remain
at the native persistence boundary; there is no former 30 cm UI cap.

## Direct DOCX boundary

The DOCX pipeline is:

```text
EditorDocumentV1 Tiptap JSON
  -> direct TypeScript mapping
  -> docx.js 9.7.1 in a Vite Web Worker
  -> transferable ArrayBuffer
  -> 1 MiB native chunks
  -> bounded OOXML validation
  -> conflict check and atomic publication
```

The mapping covers rich runs, paragraph spacing/alignment/indents, lists,
links, tables, local inline/block images with real OOXML media relationships
(including header/footer images), page geometry,
headers, footers and page numbers. Table column weights are normalized to the
available page width. The selected font family is written to OOXML but never
embedded. Unsupported structures create a compatibility warning instead of
disappearing silently.

Assets are capped at 4,096 and 128 MiB in aggregate. The generated package is
capped at 128 MiB. Cancel terminates the worker and remains effective during
native flush and validation up to the atomic publication boundary; dropping the
session removes its staging file. Before commit Rust reads every ZIP entry,
rejects path ambiguity,
duplicates, entry/expanded-size and compression-ratio limits, verifies the ZIP
read/CRC path and checks every XML/relationship part for one bounded,
well-formed root. This validation does not replace reopening the exact file in
Microsoft Word and LibreOffice.

## Structural PDF boundary

PDF editing is isolated from Tiptap. `PdfEditorSessionV1` binds a session to the
source SHA-256 and exposes lazy page/object inspection, PDFium renders and typed
`PdfEditPatchV1` operations. The UI keeps only the active page and neighbours
mounted. Text, images, vectors, common annotations, supported AcroForm values
and page operations use the same Vellum selection, palette, eight-handle and
layer vocabulary as the document editor. Scanned pages may request the local
OCR worker and place a text layer without changing the source file.
Editable text is changed directly over its rendered page object: click to edit,
`Ctrl+Enter`/`Cmd+Enter` to apply and `Escape` to cancel. The inspector no longer
duplicates the primary text field; it remains the advanced-property surface.
The in-page preview is backed by the same pending `setText` patch that Save As
passes to the native boundary.

Every write is Save As and atomic. A changed source hash, forbidden permission
or forbidden DocMDP operation is rejected again in Rust. DocMDP 1 is read-only;
level 2 is limited to permitted form/signature operations; level 3 additionally
permits annotations. The application never claims that an edit preserves a
signature. When the permissions block an edit, the UI can explicitly create a
separate unsigned editable copy: the native boundary removes signature and
DocMDP structures atomically, rebases the session on the copy and leaves the
original unchanged. A bounded structural scan reports JavaScript, Launch
actions, XFA, 3D and media as non-editable inspector records without executing
them or exposing their bodies.

The wrapper source is now `0.4.0` while PDFium remains `149.0.7825.0`. The
corrected Windows wrapper is 3,979,776 bytes at SHA-256
`53fc9f3a3b31712603c3a9520f00af2a5e006ec11f88901e92996c290c51000a`.
Its deterministic 5,138,904-byte ZIP has SHA-256
`f90970a82a066affe6c13a62486025ab072f18808637676b5c00c4a397cc0920`.
The installed DLL retained the locked SHA-256
`01be7a757183793f15eb35de9d9da424fc07d24b5560e8c3822f52812b2ad89a`.

An earlier local 0.4.0 candidate was rejected after a real native `setText`
operation changed the requested `Native editor smoke` into corrupted subset-
font text. The corrected writer first tries the existing font, serializes and
reopens the result, then requires exact text equality. On mismatch it replaces
the object with Helvetica only when the requested text is explicitly safe for
WinAnsi, while preserving its matrix, unscaled size, render mode, fill/stroke
and layer position. Unicode outside the proven coverage is rejected with
`PDF_EDITOR_TEXT_UNREPRESENTABLE` and produces no destination rather than a
silently damaged PDF.

The Tauri boundary checks the exact wrapper version `0.4.0` on every request.
Writes use a staging destination, re-hash the source immediately before commit,
reopen and validate the result, then publish it atomically. A stale source hash
is rejected and a pre-existing destination remains protected on failure.
The archive remains unpublished, but two complete
`test:windows:pdfium-native` cycles passed against the installed resources.
Universal macOS and Linux 0.4.0 records remain `pending-native-rebuild` with
unset package measurements. The embedded 0.3.0 manifest and every earlier Phase
8 package are intentionally non-candidates. Download validators fail closed
rather than inventing a URL or hash.

Current explicit limitations pending native PDF corpus evidence:

- AcroForm text, checkbox and radio values are supported; creation/deletion and
  unsafe ComboBox/ListBox mutations are not claimed;
- the current invisible OCR overlay accepts the proven Base14/Latin path;
  broader script preservation requires the rebuilt native corpus;
- the bounded active-content scan and explicit unsigned-copy behavior have
  automated regression evidence; preservation through a modified-and-resaved
  file and independent native reopening remain corpus gates, not release claims.

## Current automated evidence

Evidence already obtained in this worktree includes `npm run check`, 133
frontend unit tests and a Playwright guardrail result of 31 passed and 27
skipped. The complete PDFium wrapper split passed 45 tests
(`16 + 14 + 1 + 4 + 1 + 7 + 2`) against the real Windows DLL. Two native
Windows package cycles passed with the corrected wrapper and installed DLL.
The installed smoke changed text to exactly `Native editor smoke`, reopened it
with the same exact value, preserved the source byte-for-byte and rejected a
stale hash. The local unsigned NSIS is 999,932,692 bytes at SHA-256
`58b66d692e443b573f94b5a222398373052385e1bf8d8a95ef1bc2bd77047ac6`;
its installed application executable is 28,018,176 bytes. No raw executable
hash is asserted because NSIS patches the installed executable.

These results prove the corrected local Windows package path. They do not prove
a user-driven manual acceptance session, macOS/Linux behavior or release
readiness.

The post-audit PDF flow now distinguishes native digital, mixed and scanned
documents inside the PDFium wrapper. Scanned documents are locked read-only
until the user explicitly accepts a full-document local OCR pass. The Tauri
boundary requires every page to have been attempted and accepts only OCR text
layer patches before creating and re-inspecting a managed digitized copy. The
focused Tauri PDF suite passes 12 tests, and preview Playwright regressions pass
both successful digitization-to-editing and cancellation-that-remains-locked.
These preview results prove interface state only; packaged PP-OCRv6 inference
remains governed by the native OCR gates.

On 2026-08-06, Playwright connected to the real Windows Tauri WebView through
its private debugging port without controlling the user's screen. It opened
`Plan ECHO.pdf` (21 pages), clicked the first native text object, changed
`Il faut distinguer deux objectifs :` to
`Il faut distinguer quatre objectifs :`, committed the inline edit, saved a
separate PDF and reopened it through the native commands. The reopened object
contained the exact replacement. The source SHA-256 remained
`80ee1aa9f29e5965844f83b954c51a714fab4c45809af8bb33506845f55719e1`;
the test copy SHA-256 was
`d9c4d76abc54b94787c496e0d8854298024b766100fa9623ac58b7c7766b4d5a`.
The focused preview suite passed 10/10 scenarios and the unit suite passed
136/136 tests.

This Tauri run used the wrapper rebuilt from the current source tree. The
ignored prepared Windows PDFium resource present in this worktree reports
version `0.4.0` but its `--inspect-objects` response omits `contentKind`; it is
therefore stale and is not package evidence. The corrected archive must be
restaged and the NSIS rebuilt before an installed candidate can inherit this
proof.

Still required before a final checkpoint can be called a V1.0.7 candidate:

1. remaining aggregate Rust, OCR and conversion gates beyond the focused pass;
2. native 0.4.0 PDFium/OCR packages and gates on Apple Silicon, Intel and Linux;
3. Word and LibreOffice DOCX structural and visual corpus;
4. signed/encrypted/active-content PDF corpus beyond the installed smoke;
5. user-driven manual PDF editor acceptance;
6. new universal DMG, AppImage and updater artifacts from one final SHA;
7. final cross-platform package baseline and exact 13-asset release-folder check.

No preview, source test or Windows-only result may be promoted into macOS,
Linux, installed-package or release evidence.
