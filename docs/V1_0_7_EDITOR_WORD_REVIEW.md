# Document editor ergonomics and Word comparison

> Scope superseded on 2026-10-29: document/PDF editing is cancelled.
> Editor code, tests and release requirements below are historical.
> Use `V1_0_7_PLAN.md` and `V1_0_7_VALIDATION.md` for current scope and evidence.

Reviewed on 2026-10-04 for the local V1.0.7 development editor.
This review uses the maintainer screenshots, the current Multi-Converter
source and Microsoft/LibreOffice documentation. It is a functional comparison, not a
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
pointer activation. Bundled Lucide SVGs use consistent strokes; the page-break
icon is a local adaptation. ISC and Feather MIT notices ship with the frontend.

Text selection remains painted with a Vellum highlight while font-search or
numeric inputs have focus. Native selection resumes on returning to the page.
The font list uses a 240 px panel, 28 px rows and a 224 px virtualized viewport.
Line spacing has its own icon, numeric suggestions and the existing 1.45 default;
legacy Auto/normal values remain readable without migrating documents. Typed
values take priority over hovered suggestions. A delayed tooltip surface covers
labelled editor buttons, inputs and selects, with explanations for common tools,
shortcut hints when applicable and keyboard-focus support.

The ¶ command displays spaces (·), nonbreaking spaces (°), tabs (→), hard breaks
(↵) and paragraph endings (¶). Decorations have zero layout width, do not change
document JSON or undo history, and are excluded from exports. This follows the
editing purpose described in [Word display options](https://support.microsoft.com/en-au/word/word-options-display)
and [Writer formatting marks](https://help.libreoffice.org/latest/en-US/text/swriter/01/03100000.html).

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
| Formatting marks | Ctrl+Shift+8 | View-only toggle; no document changes |
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
| Writing and selection | Common marks, local fonts, sizes, numeric line height, retained selection, ¶ marks, alignment, lists, colors, undo | P1: indentation, paragraph spacing, format painter |
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

## Is there a minimum word-processor standard?

No universal mandatory feature checklist was identified in the primary sources
reviewed. [OASIS OpenDocument conformance](https://docs.oasis-open.org/office/OpenDocument/v1.3/os/part1-introduction/OpenDocument-v1.3-os-part1-introduction.html)
concerns document formats and their producers/consumers.
[ECMA-376 / ISO/IEC 29500](https://ecma-international.org/publications-and-standards/standards/ecma-376/)
defines OOXML representation and packaging. Supporting a format does not certify
Word-equivalent editing, complete fidelity or a particular set of UI commands.

The following is an engineering acceptance baseline for this product, inferred
from common Word workflows and the [official Writer guides](https://documentation.libreoffice.org/en/english-documentation/writer).
It is not an ISO certification or a claim that these applications use the same
minimum requirements. Named styles and paragraph spacing are supported workflows
in [Writer's styles guide](https://books.libreoffice.org/en/WG252/WG2509-WorkingWithStyles.html)
and the [26.2 introductory guide](https://books.libreoffice.org/en/GS262/GS26204-StylesTemplatesHyperlinks.html).

| Practical acceptance area | Current status | Missing acceptance work |
| --- | --- | --- |
| Reliable writing, selection, clipboard and undo | Implemented; selection remains visible in typography menus | Native WebView clipboard/caret acceptance |
| Discoverable controls, shortcuts, zoom and ¶ marks | Implemented in this development UI | Screen-reader and native keyboard pass |
| Character and paragraph formatting | Fonts, sizes, colors, alignment, lists and line spacing | Indentation, tabs/stops, spacing before/after and format painter |
| Reusable structure and navigation | Heading nodes retained on import; local find/replace | Style UI, heading navigation and advanced search |
| Page layout and visual objects | Pages, orientation, headers/footers, images and table editing | Explicit margins, real wrapping, crop and stronger table layout |
| Save/reopen and interoperable output | Local drafts and export paths implemented | Native Office round trips and visual corpus remain release gates |
| Proofing, accessibility and printing | Some accessibility foundations and PDF export | Local proofing, diagnostic tools and a dedicated print workflow |
| Advanced publishing/review | Links and basic document structure | Contents, references, comments, tracked changes and templates |

The first seven areas form a useful everyday baseline, with the documented
gaps still open. Advanced publishing/review is a later capability tier.
Multi-Converter remains an editor under development, not a Word/Writer peer.

## Acceptance and limits

Automated UI coverage lives in tests/e2e/editor-writing-aids.spec.ts,
tests/e2e/editor-ergonomics.spec.ts and the
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
