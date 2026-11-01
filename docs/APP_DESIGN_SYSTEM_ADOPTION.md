# Application design-system adoption — 2026-11-01

## Current Svelte continuation

Functional source `adf7b8ce` ports the approved identity into Svelte, applies
DS-01–DS-07 consistency fixes and validates the components in both themes on
Chromium, WebKitGTK and system macOS WKWebView. See
[MIGRATION_SVELTE_EXECUTION.md](MIGRATION_SVELTE_EXECUTION.md) for measured proof
and remaining installed-package gates. The following adoption checkpoint is
historical React evidence; it is retained for traceability.

## Historical scope and React checkpoint

The maintainer requested the approved Multi-Converter design in both desktop
themes, followed by better selectors, micro-interactions and glass navigation
based on the product website. This work uses `codex/app-design-system` and
integrates verified changes locally on `codex/test`.

Historical functional source: **`853aa081`**, locally integrated on `codex/test`.
The broader UI adoption is `547b4bd4`; the button-label correction is `853aa081`.
Documentation-only commits may follow these source checkpoints. V1.0.7 is
unpublished, and existing installed-package candidates predate these changes.

The desktop now imports the approved brand token source directly. Existing
component aliases and dimensions are adapted locally; the old vendor palette
is no longer imported. Appearance offers system, light and dark preferences,
saved locally. System changes are followed only when system mode is selected.

Quality/media selectors use keyboard-operable menus with pointer selection,
arrow/Home/End navigation, typeahead, commit/cancel and retained trigger focus.
The catalogue receives the same control treatment. Navigation contents remain
visible at the top; its panel is transparent, then becomes a blurred surface
after scrolling. Movement uses short opacity/transform transitions, with
reduced-motion and opaque/forced-color fallbacks. No conversion engine or OCR
behavior is changed by this work.

## UI adoption evidence — `547b4bd4`

The [machine-readable receipt](audits/2026-11-01/application-design-system.json)
records the checks for the adoption checkpoint:

- Both app themes at 320, 375, 768, 1024 and 1440 pixels, with no horizontal
  overflow; exact approved accent values and working select/keyboard behavior.
- Theme persistence after reload, system preference changes, reduced motion,
  and actual list scrolling activating/deactivating the navigation panel.
- Catalogue selects at the same five widths, glass panel opacity 0 at the top
  and 1 after scrolling, constant 18 px blur and no JavaScript errors.
- Automated accessibility checks report zero violations in the checked app and
  catalogue states. Patterned-background color contrast remains incomplete;
  this does not establish full WCAG conformance.
- TypeScript, 408 translation keys in six languages, 56 unit tests, UI-layout,
  source-structure and production configuration checks pass.
- Both preview and production frontend builds pass, as do repository metadata,
  the staged secret scan and whitespace checks.
- Final compiled-preview browser regressions: 12 passed and 10 intentional
  desktop/mobile project skips. Existing conversion, OCR, cancellation, focus,
  large-list and 200% zoom coverage remains passing.
- The final Open Design export matches all 34 package source files. Both
  showcase modes and the five focused native cards render without failed
  requests or script errors. Original registration receipts are historical.

`python scripts/build-design-previews.py` rebuilds the self-contained previews
and source hash index. The shared control CSS is imported by the app; it is
not duplicated. No new animation dependency or remote font was introduced.

Browser preview uses mock conversion APIs and does not prove native conversion
or OCR acceptance. This source/UI checkpoint does not rebuild or republish an
installed package. Existing platform release acceptance remains open.

## 2026-11-01 — Warm-white button labels

The maintainer rejected dark text on colored buttons. Primary actions now use
warm-white `#fffdf7` labels, with dedicated deeper action backgrounds:
light `#b05a2b`, dark `#45763d`. Hover and pressed shades remain darker.
The reference anchors `#c86a34` and `#4d8445` are unchanged. Shared `--action-*`
tokens drive both the converter and Open Design; secondary neutral buttons
keep their readable dark/light foreground. The
[six measured action pairs](audits/2026-11-01/button-label-contrast.json)
exceed 4.5:1. Rendered state and
native-package readback checks accompany this correction.

For this later CSS-only correction, production frontend build, UI-layout and
staged secret checks passed. All six state/theme pairs were rendered in the
standalone catalogue using shared action tokens. The earlier full browser/unit
suite remains evidence for the adoption checkpoint; it was not rerun for this
color-only adjustment. The latest package readback is in the button receipt,
which supersedes the earlier archive hash while retaining 34 matching files.

## Manual review and next steps

Windows native development startup through `npm start` was observed after the
button correction: a responsive `Multi-Converter` window opened. No complete
native visual acceptance, conversion/OCR acceptance or new installer is claimed.
The user's manual review remains unrecorded; the launch is a dated observation,
not a promise that the process remains open.

To resume UI review:

1. Run `npm start` from the standalone repository root.
2. Open **Paramètres → Apparence**; compare **Clair**, **Sombre** and **Système**.
   Confirm persistence after restart and system-following only in system mode.
3. Import a suitable image/media file, choose an output and inspect the quality
   or media selector. Verify arrows, Home/End, typeahead, Enter, Escape and focus.
4. Compare the navigation panel at the top and after actual page/list scrolling;
   its contents stay reachable. Check hover/press feedback and reduced motion.
5. Confirm warm-white labels on colored primary actions in both themes. Neutral
   secondary controls retain their theme-appropriate text.

Before release, rebuild packages from the final integrated source and complete
the remaining canonical, native-host and installed acceptance gates in
[`V1_0_7_VALIDATION.md`](V1_0_7_VALIDATION.md). Earlier `8b510138` candidate
receipts do not validate the interface introduced here.

## Documentation reconciliation — 2026-11-01

The entry-point documentation, plan, validation ledger, implementation handoff,
workspace guide, testing guide and decision log now identify the same functional
source checkpoint and current design. Documentation checks pass: 105 local
links in 11 changed Markdown files, repository metadata and whitespace checks.
This reconciliation changes documentation only; no application/runtime tests
were rerun for it. Source and installed-package proof remain scoped above.
