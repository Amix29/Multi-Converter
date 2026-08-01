# Multi-Converter Decisions

## 2026-07-30 — Owned Atelier IA project

**Decision:** move the complete Multi-Converter repository to
`projets/multi-converter/` and register it as an owned desktop project.

**Reason:** the Atelier must become the local workspace and entry point for the
project without absorbing its Git history or source code into the portal.

**Consequences:** Multi-Converter remains an independent repository. The portal
integration is limited to project metadata, its local logo and validated
installed executable paths.

## 2026-07-30 — Existing desktop stack retained

**Decision:** retain Tauri 2, React, TypeScript, Vite and Rust.

**Reason:** the existing architecture matches the desktop entry in the Atelier
stack matrix and already supports the required local file-system and engine
integration. A migration would add risk without solving a confirmed need.

**Consequences:** npm remains the project's pinned package manager because this
is an established public repository with working npm release and validation
automation. This is a documented compatibility exception to the Atelier
default of pnpm; changing package managers is out of scope for the workspace
move.

## 2026-07-30 — Preserve the active V1.0.7 working state

**Decision:** preserve the existing uncommitted `codex/test` development tree
exactly during the physical move and layer only the Atelier integration files
on top.

**Reason:** the tree already contains the editor implementation, updated
documentation and release-contract work. Committing, stashing, resetting or
rewriting it as part of a location change would conflate separate work and
risk losing user changes.

**Consequences:** the Atelier transition remains visible among the current
working-tree changes. No commit, merge or push is performed by the move.

## 2026-07-30 — Atelier rules remain authoritative

**Decision:** project rules contain only constraints specific to
Multi-Converter. Workspace architecture, documentation, Git, security, design,
quality and stack rules are inherited from Atelier IA and are not repeated.

**Reason:** duplicated rules consume context, drift independently and can make
the project appear to override the workspace.

**Consequences:** the redundant `atelier-integration` project rule was removed.
`AGENTS.md` now states the precedence explicitly and indexes only the remaining
project-specific rules.

## 2026-07-30 — Consolidate the website and branding kit

**Decision:** integrate the former standalone branding kit and marketing-site
folders into this repository as `branding-kit/` and `site/`.

**Reason:** the desktop application, its public website and its brand sources
belong to one product and should be maintained, documented and versioned
together without becoming separate projects inside the Atelier.

**Consequences:** `site/` no longer has a nested Git repository. Only its
source, configuration and public media were imported; dependencies, caches,
logs and generated exports remain reproducible and excluded. The former
one-commit site history was preserved in a verified external Git bundle during
the migration.

## 2026-07-30 — Retain the existing static site stack

**Decision:** retain Next.js 16, React and static export for the migrated
marketing site.

**Reason:** the site is already implemented and validated on this stack. The
Atelier stack matrix defaults a new static landing page to Astro, but rewriting
the existing site during a physical consolidation would add risk without a
confirmed product benefit.

**Consequences:** this is a documented compatibility exception, not a default
for future landing pages. The site remains serverless at runtime, owns its
lockfile under `site/` and is checked independently with
`npm run site:check`.

## 2026-07-31 — Close the workspace transition locally

**Decision:** record the Atelier governance, marketing site, branding kit and
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
