# V1.0.7 Editor Validation

This document tracks the editor gate that must pass before work starts on PP-OCRv6_medium. The complete release scope lives in [`V1_0_7_PLAN.md`](V1_0_7_PLAN.md), and the next workstream is specified in [`V1_0_7_OCR.md`](V1_0_7_OCR.md). The application version remains 1.0.6 until both workstreams are implemented and validated.

## Validation Environment

- Initial validation date: 2026-07-13
- Latest editor UI regression validation: 2026-07-27
- Documentation review: 2026-07-30
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
| Rust formatting | Pass | `npm run fmt:rust:check` |
| Rust Clippy | Pass | `npm run clippy:rust` with warnings denied |
| Rust suite | Pass | 91 passed; 6 heavy matrix tests intentionally ignored by this command |
| Conversion matrix | Pass | 6/6 ignored matrix tests passed through `npm run test:conversions` |
| PDFium wrapper | Pass | 5/5 tests plus Clippy |
| Vite production build | Pass | 107 modules transformed |
| Tauri Windows build | Pass | Release binary, NSIS bundle and updater signature generated locally |

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

Browser-rendered validation used five simulated local drafts, opened the second card menu, opened and cancelled the delete confirmation, and checked the console. The menu action was the topmost element at its centre point. The modal backdrop matched the full `1280 × 720` CSS viewport. The destructive button rendered with an opaque red background and white text. No relevant console warning or error was present.

The focused checks passed:

- `npm run typecheck`;
- `npm run test:editor`;
- `npm run test:ui-layout`;
- `npm run build`;
- `npm run check`.

A Windows release-profile executable was rebuilt without an installer bundle and remained running during a six-second smoke launch. This proves that the executable starts, but it does not replace the manual Tauri office import/export matrix below. The local QA executable was unsigned and must not be treated as a public release artifact.

The detailed visual QA record is available in [`V1_0_7_EDITOR_UI_QA.md`](V1_0_7_EDITOR_UI_QA.md).

## Windows Tauri Observation

The real application was started with `npm start` and the following points were observed in the Tauri WebView:

- the `Convertisseur | Éditeur` selector opened the editor workspace;
- the editor landing page offered new/open document actions and local recents;
- a new document opened with the formatting toolbar, page canvas, header/footer controls, page settings and export controls;
- draft JSON files were written under the local application data editor directory after editing.

One development-only observation remains to reproduce: the first WebView capture was blank until `Ctrl+R`; the complete interface rendered after reload with no console error. This must be checked on a clean second launch and on the packaged binary before the Windows gate is closed.

The automated Tauri office run was stopped when concurrent human input was detected in the Tauri window. This protected the active document from being overwritten, but it means the complete import → edit → export matrix below is still pending. The later browser UI regression pass and executable smoke launch do not close that matrix. OCR work must not begin on the basis of these partial observations.

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

The code, automated Windows gates and reported editor-home regressions are green. The complete real Tauri office round-trip matrix, native file-drop check and clean restart/persistent-asset check remain required before starting OCR. macOS and Linux host validation remain release gates before any multiplatform publication claim.
