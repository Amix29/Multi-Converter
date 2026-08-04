# V1.0.7 Editor Validation

This document tracks the editor gate that had to pass before work started on PP-OCRv6_medium. The complete release scope lives in [`V1_0_7_PLAN.md`](V1_0_7_PLAN.md), and the OCR workstream is specified in [`V1_0_7_OCR.md`](V1_0_7_OCR.md). Application metadata is now 1.0.7 for the Phase 8 native candidate; this does not mark the release ready.

## Validation Environment

- Initial validation date: 2026-07-13
- Latest editor UI regression validation: 2026-07-31
- Documentation review: 2026-07-31
- Host: Windows x64
- Application: Tauri development app and Windows release bundle
- LibreOffice: 26.2.3.2, bundled local engine
- Runtime ODT XML parser: quick-xml 0.41.0
- Privacy: all tested editor storage and conversions remained local

## Automated Results

| Gate | Result | Evidence |
| --- | --- | --- |
| Repository contracts | Pass | `npm run check` |
| Editor contracts and pagination | Pass | `npm run test:editor` |
| TypeScript and i18n | Pass | Included in `npm run check`; 415 keys in 6 languages |
| Frontend workflow unit tests | Pass | 44 Vitest tests, including format selection/grouping, concurrency, transitions and preview state |
| Compiled-preview editor flows | Pass | 8 routed Playwright scenarios: autosave/recents, refresh failure, stacking, hostile HTML, responsive states, keyboard focus and Escape |
| Rust formatting | Pass | `npm run fmt:rust:check` |
| Rust Clippy | Pass | `npm run clippy:rust` with warnings denied |
| Rust suite | Pass | 95 passed; 6 heavy matrix tests intentionally ignored by this command |
| Conversion matrix | Pass | 6/6 ignored matrix tests passed through `npm run test:conversions` |
| PDFium wrapper | Pass | 5/5 tests plus Clippy |
| Vite production build | Pass | Production adapter selected; exact bundle measurements and the raw-total target miss live in `REFACTOR_BASELINE.md` |
| Tauri Windows build | Pass | Final local executable and NSIS bundle generated; these are not release artifacts |

The editor-specific Rust tests cover bounded XML parsing, forbidden DTD/custom entities, encrypted manifests, ZIP traversal, style inheritance cycles, atomic writes, strict `mc-asset://` references and a rich ODT round trip with an image, page break, landscape layout, header, footer and page fields.

The contract suite rejects `@tiptap-pro/*`, rejects Office-to-HTML routing for DOCX/ODT/RTF, rejects `editor.getHTML()` as an office export source and verifies that image insertion uses the asset commands.

## Editor Home And Ergonomics Validation

The editor home now includes:

- a dedicated `Convertisseur | Éditeur` mode selector;
- new-document, open-document and drag-and-drop entry points;
- a local recent-document grid;
- rename, duplicate and delete actions for recent drafts;
- a confirmation dialog before draft deletion.

The delete action removes the editor draft and its local assets, not the imported source file. The dialog states this explicitly.

The following UI regressions were reproduced and corrected:

| Regression | Cause | Correction | Result |
| --- | --- | --- | --- |
| The recent-document menu was covered by a card on the next row | Animated cards created separate stacking contexts | The card with an open menu receives `is-menu-open` and `z-index: 40` | Pass |
| Editor dialogs covered only the transformed workspace area | Fixed dialogs were rendered inside an animated ancestor | Rename, delete, header and footer dialogs render through a React portal in `document.body` | Pass |
| The destructive confirmation button was nearly invisible | Neutral modal button CSS overrode the danger style | The neutral selector now excludes `.editor-danger-button` | Pass |
| Mobile `Prepare conversion` was covered by feedback | Feedback used an independent floating corner | Feedback now renders in the topbar navigation flow | Recorded pass in compiled preview |
| Returning from a document could show stale recents | The landing screen could appear before save/list refresh completed | Close waits for autosave and recent refresh; either failure keeps the document open | Recorded pass in compiled preview |

Browser-rendered validation used five simulated local drafts, opened the second card menu, opened and cancelled the delete confirmation, and checked the console. The menu action was the topmost element at its centre point. The modal backdrop matched the full `1280 × 720` CSS viewport. The destructive button rendered with an opaque red background and white text. No relevant console warning or error was present.

The focused checks passed:

- `npm run typecheck`;
- `npm run test:editor`;
- `npm run test:ui-layout`;
- `npm run build`;
- `npm run check`.

A Windows release-profile executable was rebuilt without an installer bundle and remained running during a six-second smoke launch. This proves that the executable starts, but it does not replace the manual Tauri office import/export matrix below. The local QA executable was unsigned and must not be treated as a public release artifact.

The detailed visual QA record is available in [`V1_0_7_EDITOR_UI_QA.md`](V1_0_7_EDITOR_UI_QA.md).

## Phase 2 Frontend And HTML Boundary

The editor frontend is now split into landing, active document, canvas,
toolbar, command row, dialogs, local assets, search and HTML sanitization
modules. Paper is the only active Vellum theme; compact controls surround a
neutral print-oriented document surface.

The compiled-preview scenarios verify that:

- an edited document is autosaved before the preview recent list is rendered;
- a simulated recent-list refresh failure leaves the active document open and
  exposes the error;
- menus remain above later animated cards and dialogs cover the viewport;
- Escape closes editor and application dialogs, and focus returns to the
  triggering control;
- hostile imported and pasted HTML loses scripts, embedded content, event
  handlers, dangerous links, active CSS, remote images and unbounded table
  spans before Tiptap renders it;
- Base64 images pasted into the document body or header/footer are removed;
- the feedback action no longer floats above the mobile conversion workflow.

Separately, static contracts and the implemented import path keep accepted
document-import image data behind `editorStoreAsset` and rewrite it to
`mc-asset://` before insertion. Real persistence of those assets is still a
native check.

These are browser-preview assertions over an in-memory API. They do not prove
that a draft, recent list or `mc-asset://` image survives a real Tauri restart.
The native checks below remain mandatory.

The final 15-step Windows gate passed on 2026-07-31 after the last CSS/test
corrections. The status ledger records 15/15 passed steps in 647,789 ms. The
production bundle and artifact measurements are recorded in
`REFACTOR_BASELINE.md`; the bundle raw-total objective remains honestly marked
as missed.

## Windows Tauri Observation

The real application was started with `npm start` and the following points were observed in the Tauri WebView:

- the `Convertisseur | Éditeur` selector opened the editor workspace;
- the editor landing page offered new/open document actions and local recents;
- a new document opened with the formatting toolbar, page canvas, header/footer controls, page settings and export controls;
- draft JSON files were written under the local application data editor directory after editing.

Phase 5 rechecked the exact 26,734,080-byte executable extracted from its final
local NSIS candidate. Both the first and second launches rendered the complete
interface immediately without `Ctrl+R`; the earlier development-only blank
capture was not reproduced. This is current-profile extracted-package evidence,
not the still-required installed clean-profile proof.

The Phase 5 exact candidate opened the native Windows file picker. File
selection was stopped when concurrent human input was detected, protecting the
active desktop and existing documents. The complete import → edit → export
matrix below therefore remains pending. Browser UI checks and an
extracted-package launch do not close it.

## Manual Office Matrix

Run each row in the packaged or development Tauri application, never only in Vite.

| Scenario | ODT | DOCX | RTF | PDF export |
| --- | --- | --- | --- | --- |
| Import rich multi-page source | Pending | Pending | Pending | Not applicable to this import-only row |
| Preserve styles, tables and merged cells | Pending | Pending | Pending | Pending visual check |
| Load and persist local images after restart | Pending | Pending | Pending | Pending visual check |
| Edit repeated header and footer | Pending | Pending | Pending | Pending visual check |
| Preserve page number on multiple pages | Pending | Pending | Pending | Pending visual check |
| Change margins and orientation | Pending | Pending | Pending | Pending visual check |
| Save As and reopen | Pending | Pending | Pending | Not applicable |
| Confirm overwrite of imported source | Pending | Pending | Pending | Not applicable |
| Detect an external source conflict | Pending | Pending | Pending | Not applicable |
| Keep original intact after forced failure | Pending | Pending | Pending | Pending |

For every completed row, record the source fixture, output SHA-256, LibreOffice version, a screenshot of the repeated header/footer and any compatibility warning. Add fixtures containing accents, an image header, a numbered footer, a multipage table, a manual page break, landscape layout and one unsupported embedded object.

## Gate Status

Status: **not yet closed**.

The Phase 5 automated Windows gate and the reported editor-home regressions are
green. First and second extracted-package launches no longer reproduce the
blank WebView observation. The complete installed Tauri Office round-trip
matrix, native file drop and clean-profile restart/persistent-asset checks
remain required before the Windows feature gate can close. macOS and Linux host
validation remain release gates before any multiplatform publication claim.
