# Application design-system adoption — 2026-11-01

## Scope and current checkpoint

The maintainer requested the approved Multi-Converter design in both desktop
themes, followed by better selectors, micro-interactions and glass navigation
based on the product website. This work uses `codex/app-design-system` and
integrates verified changes locally on `codex/test`.

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

## Validation status

The [machine-readable receipt](audits/2026-11-01/application-design-system.json)
records the final current checks:

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
