# Multi-Converter Decisions

## 2026-11-07 — Profile the Windows LibreOffice payload without changing its engine

Keep the published engine manifest immutable as a source-of-origin contract.
Derive a separately hash-locked headless payload by filtering compressed ZIP
records, preserving all conversion libraries, filters, fonts, document-language
data and notices. Bundle only the derived archive. Its runtime cache is keyed
by the derived hash so older installations and development checkouts are not
overwritten. Do not switch OCR models/runtimes, drop formats or add network
dependencies as a size optimization. Native parity and byte/size checks precede
adoption; see [the execution ledger](ENGINE_REDUCTION_EXECUTION.md).

## 2026-11-05 — Native title bar follows the application's appearance

**Decision:** preserve native window decorations and synchronize them with the
Svelte preference, using resolved `--bg` / `--fg` tokens rather than a separate
native palette. A small, main-window-only command validates RGB input and
applies Tauri's theme plus the documented Windows 11 DWM caption/text colors.
Selecting System clears the native override. Requests are serialized and
duplicate media events suppressed; a failed update does not poison later choices.

The DWM binding is local to the Windows implementation; existing dependencies,
Cargo manifest and lockfile are retained. Unsupported custom-color attributes
fall back to native light/dark appearance. Native controls, resizing and docking
remain owned by the OS. See the
[Microsoft attribute contract](https://learn.microsoft.com/en-us/windows/win32/api/dwmapi/ne-dwmapi-dwmwindowattribute)
and the [native appearance evidence](audits/2026-11-05/native-titlebar/validation.json).

## 2026-11-01 — Measured deferred format controls

**Decision:** load format-selection primitives when a target is selected while
keeping the format screen and its view state mounted. This removes the measured
19–26 ms cold-preview overhead without adding caches or a state framework.
Seven alternating paired contexts measure startup at 118.44 ms versus React
115.52 ms, settings 69.18 versus 366.42 ms and format selection 45.85 versus
58.64 ms. These are preview measurements; native startup/RSS is not inferred.
Total JS/CSS grows 11.9% raw / 12.3% gzip for accessible primitives and safe
rendering; the startup gap is 2.5%, below the mandate's investigation threshold.
The full UI and both native WebKit probes pass after this boundary change.

## 2026-11-01 — Svelte execution and build dependency hardening

**Decision:** pin Svelte 5.57.3, its Vite plugin 7.3.1, svelte-check 4.7.7,
Tailwind/plugin 4.3.3, Bits UI 2.20.2 and Lucide Svelte 1.66.0. Retain Vite 8,
TypeScript 6, Node 24/npm 11 and the existing Tauri/Rust dependencies.
Use selected shadcn-svelte 1.7.2 registry sources (nova), customized locally;
remove unused generated primitives rather than maintaining duplicate dialogs.

**Build-only remediation:** the Vite Svelte plugin reaches deepmerge 4.3.1,
affected by GHSA-gcqx-w48m-w2h4 with no upstream fixed release at inspection.
A small MIT-preserving local fork filters dangerous own keys on both operands
at every level. A direct file dependency plus npm's matching override makes the
fork portable across clean Windows/Linux/macOS installs. Regression tests verify
the actual installed resolution, nested inputs, prototypes, arrays and symbols.
This is a real patch, not an advisory suppression; revisit when upstream fixes it.

**Design:** the additive four action roles preserve the external 56-token
schema. Existing brand anchors and CSS remain canonical. Buttons use warm-white
action text, density is explicit, and reduced motion targets interactions.
The marketing site remains untouched. Runtime and installed proof are tracked
in [the execution ledger](MIGRATION_SVELTE_EXECUTION.md).

## 2026-11-01 — Desktop Svelte migration architecture approved

**Decision:** the maintainer explicitly approved Rust + Tauri 2 + Svelte 5 +
TypeScript + Vite, with Tailwind CSS 4, shadcn-svelte/Bits UI and the existing
brand system. The migration concerns the desktop application only; `site/`
keeps its current Next.js/React stack. See the French
[execution mandate](MANDAT_MIGRATION_SVELTE.md) for scope, lots and acceptance.

**Consequences:** this decision authorizes the desktop framework change and
bounded improvements to design-system consistency. It supersedes the earlier
React-retention decision for that migration, while retaining the native backend,
local PP-OCRv6_medium runtime, data protection and platform boundaries. Exact
compatible dependency versions are pinned during implementation. Existing
stack rules describe the current implementation and must be reconciled when
execution begins; they do not negate this explicit maintainer approval.

**Current evidence:** Tailwind 4.3.3 passed isolated Ubuntu compatibility tests.
Those tests do not validate Svelte/shadcn integration or a migrated application.
The subsequent execution request started the source migration in the dedicated
`codex/migrate-svelte` worktree; the React checkpoint remains isolated for comparison. No release, push or
external design-library publication is authorized by this decision.

## 2026-11-01 — Approved product identity and readable action labels

**Decision:** adopt the maintainer's original Multi-Converter graph-paper
identity in both desktop themes, with exact light `#c86a34` and dark `#4d8445`
brand anchors. This supersedes earlier Vellum Paper visual decisions. Use dense
sans-serif headings, rounded panels, offset shadows and glass limited to the
navigation panel after scrolling. Preserve the converter/OCR workflow.

**Reason:** the maintainer rejected the initial design mismatch, native-looking
selectors, insufficient motion and dark labels on colored buttons. Dedicated
action backgrounds allow warm-white labels with measured contrast above 4.5:1
without changing the reference anchors.

**Consequences:** desktop and catalogue share brand tokens and select styles.
System/light/dark preference stays local; reduced motion and keyboard access
remain required. `--action-*` roles drive colored primary buttons; raw-accent
foreground values are not primary-button labels. Open Design is a reusable
personal library entry, not a community publication or an app release. See the
[adoption ledger](APP_DESIGN_SYSTEM_ADOPTION.md) and its dated receipts for proof.

## 2026-10-30 — macOS 15 And Later On Apple Silicon

After native Mach-O inspection found a 15.0 minimum in the available libvips
runtime, the maintainer explicitly selected **macOS 15 and later**. V1.0.7 Mac
configuration, documentation and validation use that minimum and arm64 target.
Windows and Linux remain supported. Historical releases keep their original
platform metadata. Static compatibility checks do not substitute for macOS 15
installed acceptance; the available development Mac runs 26.6.2.

## 2026-10-30 — Continue The Approved Audit On Available Native Hosts

Continue on `codex/audit-follow-through` from `41459c23`, preserving the converter/
OCR scope and Apple Silicon-only future Mac policy. Explicit stream copy must
preserve every supported track or fail; it cannot silently re-encode. Integrated
image conversions must expose profile/depth/metadata loss and reject silently
flattened multi-image inputs. Native resource reservations are conservative
admission estimates, not a promise of an OS-level RSS cap.

Use the authorized Mac only for bounded temporary work; copy durable evidence
back to the project. Its existing application is historical, so engine probes
cannot certify the new application. Ubuntu WSL uses native tools and a separate
Linux checkout, never Windows node_modules. Follow V1_0_7_AUDIT_FOLLOW_THROUGH.md
for checks, artifacts and the remaining authorized work.

## 2026-10-30 — Audit Approved; Apple Silicon macOS Only

The maintainer approved the comprehensive conversion/OCR audit recommendations,
including contextual quality profiles. V1.0.7 retains Windows x64 and Linux x64
and retires Intel macOS. New Mac app/engine/OCR packages target Apple Silicon
only; updater metadata must reject Intel entries. Historical V1.0.6 universal
downloads and evidence remain unchanged.

Implementation runs on `codex/converter-audit-apple-silicon` before integration
into `codex/test`. Follow V1_0_7_APPROVED_IMPLEMENTATION.md for current proof and
outstanding work. Approval does not authorize publication or a remote push;
source tests do not substitute for installed/native platform acceptance.

## 2026-10-29 — Conversion And OCR Only

**Decision:** remove the document and structural PDF editors at the maintainer's
request. Keep all conversion formats and local `PP-OCRv6_medium` OCR.

**Consequences:** remove editor workspaces, drafts UI, editor IPC/types, native
editor/font modules, rich-text dependencies, translations and editor-only tests.
Old user drafts/assets are left untouched. Update CI and installed acceptance
to the retained converter/OCR scope. Source wrapper editing modes are removed;
its published-engine dependency graph stays pinned until a reviewed engine
rebuild. No release, engine-fingerprint rewrite or remote push is authorized.

**History:** older editor/Word decisions below are superseded for the active
product; their evidence describes previous development checkpoints only.


## 2026-10-04 — Visible selection and writing aids

**Decision:** retain a view-only highlight while font/size inputs have focus;
use 240 px font menus with 28 px rows and 224 px virtualized viewports. Display
numeric paragraph line height, including the existing 1.45 default, and a
recognizable spacing icon. Keep legacy automatic values readable without
migrating documents. Use bundled Lucide icons (ISC with Feather MIT notices),
consistent delayed tooltips, and a ¶ toggle for nonprinting marks.

**Reason:** selection became invisible during typography changes, oversized
menus obscured the page, an empty grid column clipped Auto, and some symbols
and controls lacked a discoverable explanation. Numeric commits now distinguish
keyboard suggestions from pointer hover and avoid recursive blur commits.

**Consequences:** no new document attributes, cloud dependency or runtime icon
fetch. Formatting marks and retained highlights are decorations, excluded from
JSON/export/history. Styles, navigation, proofing and export fidelity remain
separate gaps in the practical baseline documented in the Word/Writer review;
no universal word-processor feature certification is claimed.

## 2026-10-04 — Compact document ribbon and direct image editing

**Decision:** preserve Vellum Paper while arranging commands in compact,
labelled, multiple-row groups. Replace the image overlay with a contextual
ribbon and direct dragging for floating images. Keep document zoom view-local,
with 10–500% bounds and 100% at the slider midpoint. Rename focus mode to full
screen mode and provide scoped keyboard commands and help.

**Reason:** the maintainer's Word comparison showed oversized chrome, hidden
commands and confusing image movement. Active-button hover styling also caused
an apparent icon disappearance. A local toolbar change addresses these issues
without changing the document schema or native asset authority.

**Consequences:** 28 px desktop formatting controls become 40 px on narrow
layouts. Image actions form distinct undo groups; autosave retains local image
assets until successful document closure so deletion can be undone. Modal
keyboard handling takes priority over editor shortcuts. Advanced Word
capabilities remain explicitly proposed in
[V1_0_7_EDITOR_WORD_REVIEW.md](V1_0_7_EDITOR_WORD_REVIEW.md), subject to native
format fidelity and the existing V1.0.7 release gates.

## 2026-07-30 — Local workspace registration (historical)

**Decision:** move the complete Multi-Converter repository to
`projets/multi-converter/` and register it as an owned desktop project.

**Reason:** a shared local workspace served as the entry point for the
project without absorbing its Git history or source code into the portal.

**Consequences:** Multi-Converter remains an independent repository. The portal
integration is limited to project metadata, its local logo and validated
installed executable paths.

## 2026-07-30 — Existing desktop stack retained

**Decision:** retain Tauri 2, React, TypeScript, Vite and Rust.

**Reason:** the existing desktop architecture already supports local file-system and engine
integration. A migration would add risk without solving a confirmed need.

**Consequences:** npm remains the project's pinned package manager because this
is an established public repository with working npm release and validation
automation. Changing package managers is out of scope for a workspace move.

## 2026-07-30 — Preserve the active V1.0.7 working state

**Decision:** preserve the existing uncommitted `codex/test` development tree
exactly during the physical move and layer only the workspace integration files
on top.

**Reason:** the tree already contains the editor implementation, updated
documentation and release-contract work. Committing, stashing, resetting or
rewriting it as part of a location change would conflate separate work and
risk losing user changes.

**Consequences:** the workspace transition remained visible among the then-current
working-tree changes. No commit, merge or push is performed by the move.

## 2026-07-30 — Shared workspace rules (historical, superseded 2026-10-30)

**Decision:** project rules contain only constraints specific to
Multi-Converter. Workspace architecture, documentation, Git, security, design,
quality and stack rules were inherited from the parent workspace.

**Reason:** duplicated rules consume context, drift independently and can make
the project appear to override the workspace.

**Consequences:** the redundant integration rule was removed. At that checkpoint
`AGENTS.md` indexed project-specific additions. Current standalone rules replace
that former dependency; see the 2026-10-30 decision below.

## 2026-07-30 — Consolidate the website and branding kit

**Decision:** integrate the former standalone branding kit and marketing-site
folders into this repository as `branding-kit/` and `site/`.

**Reason:** the desktop application, its public website and its brand sources
belong to one product and should be maintained, documented and versioned
together as one independent product repository.

**Consequences:** `site/` no longer has a nested Git repository. Only its
source, configuration and public media were imported; dependencies, caches,
logs and generated exports remain reproducible and excluded. The former
one-commit site history was preserved in a verified external Git bundle during
the migration.

## 2026-07-30 — Retain the existing static site stack

**Decision:** retain Next.js 16, React and static export for the migrated
marketing site.

**Reason:** the site is already implemented and validated on this stack.
Rewriting the existing site during a physical consolidation would add risk without a
confirmed product benefit.

**Consequences:** this is a documented compatibility exception, not a default
for future landing pages. The site remains serverless at runtime, owns its
lockfile under `site/` and is checked independently with
`npm run site:check`.

## 2026-07-31 — Close the workspace transition locally

**Decision:** record the workspace governance, marketing site, branding kit and
the current unfinished V1.0.7 development checkpoint together in local commit
`1be6b840` on `codex/test` after validation.

**Reason:** the transition rules and documentation depend on the active editor
contracts, commands and package state. A transition-only commit would have
left an incoherent snapshot with documented V1.0.7 paths that were not present
in that commit.

**Consequences:** the commit is a development checkpoint, not V1.0.7 release
evidence. V1.0.7 remains blocked by the real Tauri editor matrix, OCR and the
platform release gates. The commit is local and is not pushed without explicit
authorization. Generated `output/` and `release-direct/` artifacts were not
included and are ignored at the repository root without deleting the retained
local files. The former standalone site history remains recoverable from the
verified external Git bundle retained by the maintainer.

## 2026-08-01 — Keep One Rust Crate And Refactor By Domain

**Decision:** keep the Tauri backend as one Rust crate and organize it through
the flow `commands -> business domains -> local infrastructure`. Introduce a
shared primitive only when it removes demonstrated duplication; keep the
persistent OCR supervisor separate from one-shot engine processes.

**Reason:** the former root, conversion and ODT modules mixed Tauri adaptation,
domain orchestration, engine details, filesystem operations and tests. Focused
modules make those responsibilities reviewable and independently testable
without changing the mature conversion stack or introducing a new crate and
dependency boundary.

**Consequences:** all public commands, serialized contracts, formats, engine
versions, resources, fallback order, persistent schemas and V1.0.6 metadata
remain compatible. Handwritten Rust now has a 500-non-blank-line hard guardrail
and an approximately 300-line soft target. Phase 4 ends as a local checkpoint;
it is not pushed, merged, published or treated as V1.0.7 release evidence for
unvalidated platforms and installed-package scenarios.

## 2026-10-30 — Standalone workspace and repository-owned rules

**Decision:** move the complete repository to the maintainer's standalone
`Développement/Multi-Converter` directory, remove its former portal entry and
make repository rules authoritative without parent-file or shared-skill links.

**Reason:** the maintainer explicitly requested an autonomous workspace.
The earlier integration decisions above are historical and superseded
for workspace ownership and governance.

**Consequences:** preserve Git history, remotes, local engine/build inputs,
generated candidates and dirty historical worktrees. Keep the desktop/site/brand
boundaries, established stack and Vellum Paper design. Repair linked-worktree
metadata after the physical move; never reset or prune preserved work. Source
relocation does not migrate installed user data or imply publication. See
`LOCAL_WORKSPACE.md` and the current audit handoff for checks and recovery.
# 2026-11-07 — Windows direct engine resources

After the first 15.4% setup reduction was judged insufficient, use a conversion-only
LibreOffice profile without spellchecking/thesaurus data, preserving hyphenation,
fonts, filters, locales and notices. Version and hash all registry overlays;
independently audit their XML semantics. Install Office and the unchanged locked
OCR runtime directly, then compress the entire NSIS payload with solid LZMA and
a 128 MiB dictionary. Keep all five PP-OCRv6_medium models unchanged and offline.
Split Windows compilation from bundling to avoid copying full resource trees into
the Cargo output. Preserve previous installers by move. No Linux/macOS build or
user-cache cleanup is authorized by this change. Evidence and measurements:
[engine reduction ledger](ENGINE_REDUCTION_EXECUTION.md).
