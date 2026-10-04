# Document editor ergonomics and Word comparison

Reviewed on 2026-10-04 for the local V1.0.7 development editor.
This review uses the two maintainer screenshots, the current Multi-Converter
source and Microsoft documentation. It is a functional comparison, not a
complete hands-on audit of every Word edition or a claim of Word compatibility.
Word desktop, web and mobile have different capabilities.

## Findings and changes delivered

The screenshot showed a large application header, one long command row and a
color picker that took much of the writing area. Word's supplied ribbon groups
related commands in compact rows with captions. We retain Vellum Paper and
apply that organization to History, Font, Paragraph, Insert and Page layout.
Desktop controls are 28 px high; narrow layouts use 40 px formatting controls,
wrapping groups and a bounded vertically scrollable ribbon.

Active buttons previously retained a light foreground when a hover rule made
their background light. Stable Ink foregrounds and explicit active/hover states
remove that disappearance. Formatting controls keep the current selection on
pointer activation. Local SVGs use consistent strokes and distinct layer arrows.

The document opens at 100%. The zoom slider maps 10–100% onto its left half
and 100–500% onto its right half, with a 1 px marker at the midpoint. A percentage
field allows exact entry; buttons, Ctrl+wheel, Ctrl+plus/minus and Ctrl+0 use the
same bounds. Zoom changes the page, preserves document geometry for pagination
and does not enlarge the ribbon. Wheel zoom tries to retain the document point
under the pointer. The full screen editor fills the application viewport;
F11 toggles it and Escape exits after a dialog or local popover has closed.
It does not change the native operating-system window's full screen state.

The image overlay has been replaced by a contextual Image section in the ribbon.
Select an image to expose eight handles and width/height in cm. Aspect ratio is
locked by default in the dimension fields. Placement is an explicit choice:
in text, in front of text or behind text. Floating images move by dragging the
image itself, or using arrows when its frame has keyboard focus; Shift increases
the keyboard movement. Flow images retain ProseMirror's normal node drag.
Alignment, four layer operations, reset and delete are in the contextual ribbon.
Corner handles preserve proportions by default; Shift changes that constraint,
and Alt resizes around the center. Each ribbon operation starts a separate undo
group. Image assets remain available through autosave so deletion can be undone;
unused assets are pruned when returning successfully to recent documents.

Microsoft documents both keyboard-driven editing and the distinction between
inline and floating images. These supplied the interaction references:
[Word shortcuts](https://support.microsoft.com/en-au/accessibility/word/keyboard-shortcuts-in-word),
[picture placement](https://support.microsoft.com/fr-fr/word/wrap-text-and-move-pictures-in-word)
and [ribbon display](https://support.microsoft.com/en-gb/office/foundations-experiences/show-or-hide-the-ribbon-in-office).
The custom mapping that puts 100% at the center follows the maintainer request.

## Keyboard contract

| Operation | Shortcut | Handling |
| --- | --- | --- |
| Save / Save As | Ctrl+S / Ctrl+Shift+S | Existing local save flow and confirmations |
| Undo / redo | Ctrl+Z / Ctrl+Y or Ctrl+Shift+Z | Tiptap history |
| Bold / italic / underline | Ctrl+B / Ctrl+I / Ctrl+U | Tiptap marks |
| Select, copy, cut, paste | Ctrl+A / C / X / V | Existing editor and clipboard handlers |
| Move/select by words or document ends | Ctrl+arrows, Shift, Ctrl+Home/End | Native editing behavior |
| Left / center / right / justify | Ctrl+L / E / R / J | Explicit app commands |
| Find / replace | Ctrl+F / Ctrl+H | Existing local find/replace row |
| Link | Ctrl+K | Existing link command |
| Page break | Ctrl+Enter | Insert break and continue in a following paragraph |
| Clear character formatting | Ctrl+Space | Unset marks; paragraph layout is retained |
| Document zoom | Ctrl+wheel, Ctrl+plus/minus | 10–500%, 10-point increments |
| Default zoom | Ctrl+0 | 100% |
| Full screen / exit | F11 / Escape | Editor viewport, modal-aware |
| Shortcut help | Ctrl+/ | Accessible in-app help dialog |

Cmd is accepted in place of Ctrl for app commands; native Tiptap/platform
clipboard behavior still applies. Text inputs retain their editing shortcuts.
Shortcuts are scoped to the document editor and do not intercept converter
commands or active dialogs. This list is our supported contract, not a promise
to implement every Word shortcut.

## Functional comparison and priorities

Current states below come from source inspection. Native output fidelity must
be established with the Office matrix in V1_0_7_EDITOR_VALIDATION.md.
Priorities describe proposed follow-up work, not implemented features.

| Area | Current Multi-Converter state | Next work toward practical Word-like editing |
| --- | --- | --- |
| Writing and selection | Common marks, local fonts, sizes, line height, alignment, lists, colors, undo | P1: indentation, paragraph spacing, format painter, visible nonprinting characters |
| Ribbon and discovery | Compact groups, tooltips, shortcut help, contextual image/table tools | P1: selection-specific help; retain stable command locations |
| Styles and structure | Imported heading nodes retained; no heading preset UI by existing decision | P1: design reusable named styles with an explicit product decision; do not silently reintroduce presets |
| Navigation | Local search/replace and page/word totals | P1: results list, current page from scrolling, heading navigation, replace all and search options |
| Page layout | Formats, orientation, persisted margins, headers/footers and page fields | P1: expose margin editing clearly, add fit-page/fit-width; P2: sections, independent headers and columns |
| Images | Local assets, direct floating movement, handles, dimensions, aspect ratio, layers, reset/delete | P1: anchors and movement boundaries; P2: real text wrapping, crop, rotation, captions and alt-text editing |
| Tables | Rows/columns, merge/split, column/row resize | P1: borders, shading, cell alignment; P2: repeated header rows and pagination of large tables |
| References | Links; no bibliography, footnotes or automatic contents model | P2: footnotes/endnotes, captions/cross references, contents and bibliography |
| Review | Undo; no tracked-change or comment data model | P2: local comments, change tracking and accept/reject with explicit import/export fidelity |
| Proofing | No dedicated offline spelling/grammar workflow | P1: select language and evaluate offline spell-check; P2: local dictionaries and correction suggestions |
| Accessibility | Labels, keyboard focus, dialog trapping, zoom and touch controls | P1: screen-reader pass, semantic headings, alternative text and table-header diagnostics |
| File lifecycle | Local drafts, import warnings, confirmed overwrite, direct DOCX, ODT/RTF/PDF paths | P0: complete native round trips, image undo/restart and crash/recovery checks before release |
| Document comparison | One active document, no diff workflow | P2: local side-by-side/diff on copies |
| Mail merge and templates | No mail-merge or reusable template workflow | P3: bounded local data-driven templates after core editing/export fidelity |
| Collaboration and automation | Local-first app, no shared document service or macros | No cloud collaboration or executable macro feature proposed for V1.0.7 |

Named styles support consistent formatting in Word, and heading styles feed its
navigation pane. A style feature therefore needs a document/export contract,
not just additional toolbar buttons:
[styles](https://support.microsoft.com/en-us/word/customize-or-create-new-styles),
[navigation](https://support.microsoft.com/en-us/word/use-the-navigation-pane-in-word).

Word also separates document references, tracked revisions and comparison into
specific workflows. Those require new data models and local persistence before
we can promise them:
[footnotes/endnotes](https://support.microsoft.com/en-us/word/add-footnotes-and-endnotes),
[contents formatting](https://support.microsoft.com/en-us/word/format-or-customize-a-table-of-contents-in-word),
[tracked changes](https://support.microsoft.com/en-us/word/training/track-changes-in-word),
[document comparison](https://support.microsoft.com/en-us/word/compare-document-differences-using-the-legal-blackline-option).
The proofing and merge references are
[Microsoft Editor](https://support.microsoft.com/en-US/Word/check-grammar-spelling-and-more-in-word-for-the-web)
and [mail merge](https://support.microsoft.com/en-US/Support/known-issues/how-to-use-the-mail-merge-feature-in-word-to-create-and-to-print-form-letters-that-use-the-data-from).
Online Word services are reference material only; they are not integrations.

## Acceptance and limits

Automated UI coverage lives in tests/e2e/editor-ergonomics.spec.ts and the
existing desktop/editor/PDF suites. It covers compact multirow controls, icon
contrast, selected text formatting, zoom bounds and stable pagination,
keyboard editing, modal-aware full screen, image dimensions/proportions,
direct floating movement and image deletion undone after autosave.

The new UI does not add crop, rotation, true text wrapping, track changes,
comments, contents generation or a Word-equivalent pagination engine.
Native Windows WebView keyboard/wheel behavior, assets after restart and
DOCX/ODT/RTF/PDF output layout still need a real Tauri/Office acceptance pass.
The structural PDF workspace shares the full screen wording and key handler;
its own image inspector and zoom are otherwise outside this document-editor lot.
