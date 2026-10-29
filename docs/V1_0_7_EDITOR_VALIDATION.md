# V1.0.7 Editor Validation

> Scope superseded on 2026-10-29: document/PDF editing is cancelled.
> Editor code, tests and release requirements below are historical.
> Use `V1_0_7_PLAN.md` and `V1_0_7_VALIDATION.md` for current scope and evidence.

## 2026-10-04 — Writing aids evidence

The writing-aids suite exercises a partial four-character selection through
font search and numeric size changes, checks that only those characters are
formatted, verifies compact list geometry, default/custom line spacing and
keyboard/pointer help, and compares document JSON before/after ¶ toggles.
It also verifies unchanged page count and that Undo reverses document editing
instead of toggling display marks. The complete relevant preview matrix passed
44 tests with 28 intentional platform skips; 141 unit tests passed. A final
targeted confirmation after menu/glyph positioning passed 14 tests with two
intentional skips.
The native WebView and Word/LibreOffice round-trip matrices below remain open;
browser/model evidence does not prove file-system persistence or print/export
fidelity. The Word/Writer review identifies required next work without claiming
a universal minimum certification or feature parity.

This document tracks the editor gate that had to pass before work started on PP-OCRv6_medium. The complete release scope lives in [`V1_0_7_PLAN.md`](V1_0_7_PLAN.md), and the OCR workstream is specified in [`V1_0_7_OCR.md`](V1_0_7_OCR.md). Application metadata is now 1.0.7 for the Phase 8 native candidate; this does not mark the release ready.

## Validation Environment

- Initial validation date: 2026-07-13
- Latest editor UI regression validation: 2026-10-04
- Documentation review: 2026-08-04
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
| 2026-08-04 correction lot | Pass for source/unit, Rust and compiled-preview scope | `npm run check`, Rust tests, targeted editor Playwright and visual measurements; native Office export remains pending |

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

## 2026-08-04 Editor Correction Lot

The maintainer's Windows test build identified a second set of editor and shell
issues. The current implementation addresses them as follows.

### Shell and file cards

- The decorative vertical Coral stripe was removed from the onboarding
  screenshot.
- Converter files are laid out as structured cards with a dedicated identity,
  complete wrapping filename, type, metadata, status and action row. Long names
  are no longer intentionally reduced to a few characters.
- OCR and removal actions remain inside their card and primary pointer targets
  use the 44 px minimum.

### Document workspace and formatting

- **Focus mode** places the editor shell over the exact viewport. Escape exits
  the mode and returns focus to its trigger.
- The formatting bar uses labelled local SVG icons. Alignment, image insertion,
  table, link and other ambiguous actions expose explicit accessible names and
  tooltips.
- At narrow widths, the toolbar scrolls horizontally with 44 px previous/next
  controls instead of clipping tools or widening the page.
- Paragraph-heading presets were removed from the UI. Imported `h1`–`h6`
  nodes remain schema-compatible so opening an existing document is not
  destructive.
- Font size accepts any valid value from 1 to 400 pt, including decimal input;
  suggestions remain available but are not the only permitted values.
- Text color is independent from highlight color. Highlight exposes an
  explicit no-highlight action and its toolbar glyph reflects the selected
  color, returning to the default Ink color when no highlight is active.
- The toolbar enumerates installed system families without installing,
  embedding or downloading fonts. It orders the system default, three recent
  names and the virtualized alphabetical catalogue. PDF embedding follows
  OpenType `OS/2.fsType`; DOCX keeps the chosen family name.

### Images and tables

- A selected local image has explicit move and resize handles. Keyboard arrows
  move it by a bounded step, Shift uses the larger step, and the image can
  return to normal text flow.
- Four layer actions are available: send to back, step backward, step forward
  and bring to front. Persisted offsets and `z-index` values are bounded by the
  Rust editor contract.
- Selected image controls and the resize handle use 44 px targets.
- Table columns expose resize handles. Context controls add/delete rows or
  columns, merge/split cells and delete the table; their mobile targets are
  also 44 px.

### Recent documents, saving and export

- A 520 ms long press starts recent-document multi-selection. Keyboard users
  can enter the same mode explicitly; Escape leaves it. Batch deletion remains
  behind a Vellum confirmation dialog and retains failed items selected.
- New editor sessions select Markdown as the default export format.
- An untitled document cannot be exported until a non-placeholder title is
  entered. The accepted title becomes the current draft title and therefore
  the proposed output filename.
- Slow export displays a modal Vellum progress state. Source overwrite approval
  is also an accessible in-app dialog; the WebView's unstyled
  `window.confirm()` prompt is no longer used.
- Save/Save As adopts the chosen destination stem as the document title when
  it is a new association, so the visible title and stored source stay aligned.
- DOCX, RTF and PDF generation now writes one rich ODT intermediate, normalizes
  it through the strict local LibreOffice ODT path and converts the normalized
  ODT to the requested target. The same-format normalization remains an
  intentional compatibility step.

### Evidence boundary

`npm run check`, the Rust tests and the targeted compiled-preview E2E passed.
The preview checks covered complete card names, focus viewport geometry,
toolbar overflow/navigation, 44 px mobile controls, text/highlight formatting,
image movement/resizing/layers, table resizing, title gating, export progress,
in-app overwrite confirmation and long-press batch deletion. There was no
unintentional horizontal page overflow in the inspected states.

The UI measurements remain Chromium-preview evidence, not native Tauri proof.
Separately, a corrected Windows engine probe using bundled LibreOffice
26.2.3.2 completed rich ODT normalization in 10.593 s, normalized ODT-to-PDF
in 11.102 s (62,348 bytes) and normalized ODT-to-DOCX in 11.713 s (8,943
bytes). PDFium confirmed two landscape pages with exploitable text and the
rendered pages retained the table, image, header, footer and pagination. DOCX
inspection confirmed the non-uniform column ratios, horizontal and vertical
merges, one exact embedded PNG, page fields, manual page break, margins,
landscape layout, text styling and justification. Reopening that DOCX through
LibreOffice produced a two-page PDF with the same text and no observable visual
loss. These are real local engine and output-structure receipts; the full
packaged Tauri export interaction remains pending.

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

## 2026-10-04 Ergonomics Evidence

The current document-editor UI adds the compact multirow ribbon, familiar
shortcuts/help, full screen wording/F11, 10–500% zoom with centered 100%, and
contextual/direct image editing described in
[V1_0_7_EDITOR_WORD_REVIEW.md](V1_0_7_EDITOR_WORD_REVIEW.md).
Image deletion remains undoable after autosave because unused assets are pruned
only when the document closes successfully.

Application/test types, 653 i18n keys in six languages, 139 unit tests,
editor/layout/source contracts and both frontend build modes passed.
The combined browser editor/PDF/desktop matrix passed 37 tests with 27
intentional platform skips. Screenshots were inspected locally.
These checks do not close the native Office and restart-persistence matrix.

## Current Gate Status

Status: **not yet closed**.

The Phase 5 automated Windows gate and the reported editor-home regressions are
green. First and second extracted-package launches no longer reproduce the
blank WebView observation. The complete installed Tauri Office round-trip
matrix, native file drop and clean-profile restart/persistent-asset checks
remain required before the Windows feature gate can close. macOS and Linux host
validation remain release gates before any multiplatform publication claim.
