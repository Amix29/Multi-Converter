# Multi-Converter Design System — updated 2026-11-01

Current functional source checkpoint: `853aa081`, integrated locally on
`codex/test`; current maintenance branch: `codex/app-design-system`. The latest
recorded synchronization is the
[button-label receipt](audits/2026-11-01/button-label-contrast.json): all 34
package files match, with no export differences and an identical design body.
It supersedes older export hashes recorded below.

## Approved direction

The maintainer supplied reference screenshots and approved the original product
identity: subtle graph paper, dense bold sans-serif headings, rounded panels and
small offset shadows. The exact anchors are `#c86a34` in light mode and `#4d8445`
in dark mode. The early editorial/serif direction was superseded by this decision.

The canonical design contract is
[`DESIGN.md`](../branding-kit/08_design-system/DESIGN.md). Its token stylesheet,
native JSON index, component fixture, logos, SVG textures and six standalone
previews live together in `branding-kit/08_design-system/`. Shared dimensions and
component behavior remain consistent between modes.

## Open Design registration

The system is named **Multi-Converter** in the personal Open Design library.
The stable internal id is `user:multi-converter-paper`; the suffix predates the
approved visual correction and does not prescribe its palette or typography.
Its editing project is `ds-multi-converter-paper`. Library status `published`
means reusable inside the personal workspace; it is not a community publication
or a Multi-Converter application release.

The native MCP connection and official client were used to create the record
and its managed editing workspace. The generic code importer initially produced
neutral fallback tokens, so the complete validated package was authored into
the newly created agent-managed package and workspace. Their metadata and
workspace ownership stay controlled by the native API. The obsolete neutral
outputs were archived with a backup, not deleted. The superseded automatic
token review was rejected. Native readback/export verifies the final files.

Open Design 0.26.1 serves its showcase from `system/kit.html`, independently
of the manifest's preview cards. This entry and `system/kit.dark.html` now
contain the self-contained branded catalogue; the generic SaaS fallback is
replaced. All five focused cards were also exercised through its native static
endpoint. The editing project opens `components.html`.

To inspect it: **Systèmes de design → Vos systèmes → Multi-Converter**.
The showcase and dedicated palette, typography, spacing, button and input
previews use the approved styles. Their theme switch operates inside the
catalogue and does not change the converter's preferences.

## Evidence and limits

- The official Open Design manifest validator accepts the package.
- All 56 shared `TOKEN_SCHEMA` values, including 26 required A1 values, are
  explicit. Both theme maps are provided and token references resolve.
- Component indexes and the native token JSON use Open Design's derivation
  functions. The coverage report is not a fabricated design-quality score.
- Browser checks cover light/dark at 320, 375, 768, 1024 and 1440 pixels,
  progression, cancellation, profile choice, the OCR dialogue, focus restoration,
  the mobile menu and reduced motion. Preview interactions use fictitious files.
- Automated accessibility checks and measured text/foreground pairs are recorded
  in the audit receipt. They do not establish full WCAG conformance or installed
  native application acceptance.
- Native package readback and export are compared to the source files. The
  receipt records the exact file count and hashes after final synchronization.

The initial [validation receipt](audits/2026-10-31/open-design-system-validation.json)
records 30 matching native files, zero export differences, both native theme
renders, 10 viewport/theme checks, zero automated accessibility violations and
36 measured semantic text pairs. The light secondary text was darkened to
remain readable over grid intersections. Automated patterned-background checks
remain incomplete; the receipt explicitly limits the contrast measurements.

Initial registration used `codex/open-design-system`; current maintenance uses
`codex/app-design-system`, integrated locally on `codex/test`. No application
release or remote Git push is implied.
The 2026-11-01 [application adoption](APP_DESIGN_SYSTEM_ADOPTION.md) imports this
token source into the converter and adds system/light/dark preferences. That
ledger records its own UI checks. Updated menus, micro-interactions and glass
navigation also improve the reference catalogue; historical receipts above
describe the original registration, not the later package revision.

The current [2026-11-01 receipt](audits/2026-11-01/application-design-system.json)
records 34 matching package files and the improved native previews. Selects,
section reveals, button feedback and the scroll-dependent glass panel were
checked in both modes; the application uses the same brand/control sources.

The subsequent button correction uses warm-white `#fffdf7` text with dedicated
`--action-*` backgrounds: light `#b05a2b`, dark `#45763d`, plus deeper hover/press
shades. Its six measured pairs exceed 4.5:1; the brand anchors remain unchanged.
Use these action roles for primary buttons, not the dark raw-accent foreground.
