# Multi-Converter Documentation

## Current Product State

- Published stable release: **V1.0.6**
- Published V1.0.6 platforms: Windows x64, universal macOS and Linux x64
- V1.0.7 targets: Windows x64, Apple Silicon macOS 15+ and Linux x64
- Repository surfaces: desktop application, static marketing site and branding kit
- Development release: **V1.0.7**
- Desktop source now uses Svelte 5 + Tailwind 4 + shadcn-svelte/Bits UI with the
  existing Rust/Tauri backend. [Execution and evidence](MIGRATION_SVELTE_EXECUTION.md),
  [parity matrix](MIGRATION_SVELTE_PARITE.md). The site is unchanged.
- Windows application checkpoint **`2e907a86`** includes the native OCR worker and title-bar themes. The selected compact installation profile is **`f15a30a1`**. The [validation ledger](V1_0_7_VALIDATION.md) records installed measurements and remaining release gates.
- Current interface: approved light/dark design, system appearance preference,
  custom selectors, micro-interactions, scroll-dependent glass navigation and
  warm-white primary-button labels. See the
  [design adoption ledger](APP_DESIGN_SYSTEM_ADOPTION.md).
- V1.0.7 objectives:
  - local `PP-OCRv6_medium` OCR for PDF-to-text conversion and copying text from images.

## Comprehensive Audit — 2026-10-29

[Full audit and prioritized roadmap](AUDIT_COMPLET_2026_10_29.md) (French):
conversion/OCR scope, 25 reviewed screenshots, engine fidelity, security,
dependencies, performance, distribution and acceptance criteria.
Audited integration: `codex/test` at `98726742`. Verdict: **Block** for release;
no product fixes were applied by this audit. Raw evidence is in
[`audits/2026-10-29/`](audits/2026-10-29/).

## V1.0.7 Source Documents

| Document | Status | Purpose |
| --- | --- | --- |
| [`MIGRATION_SVELTE_EXECUTION.md`](MIGRATION_SVELTE_EXECUTION.md) | Source migrated, installed acceptance open | Lots, current proofs, measurements and recovery |
| [`MIGRATION_SVELTE_PARITE.md`](MIGRATION_SVELTE_PARITE.md) | Current parity matrix | Functional coverage and A01–A12 limits |
| [`MANDAT_MIGRATION_SVELTE.md`](MANDAT_MIGRATION_SVELTE.md) | Executed at source level; acceptance tracked separately | Desktop-only migration, design-system corrections, phased work and measurable acceptance |
| [`APP_DESIGN_SYSTEM_ADOPTION.md`](APP_DESIGN_SYSTEM_ADOPTION.md) | Active UI checkpoint | Both runtime themes, selectors, motion, glass navigation and validation boundaries |
| [`V1_0_7_APPROVED_IMPLEMENTATION.md`](V1_0_7_APPROVED_IMPLEMENTATION.md) | Active, implementation/validation in progress | Approved audit changes, Apple Silicon decision, current checks and remaining work |
| [`V1_0_7_AUDIT_FOLLOW_THROUGH.md`](V1_0_7_AUDIT_FOLLOW_THROUGH.md) | Active continuation | Stream copy, image fidelity/resource budgets, real Mac probes, Linux preparation and remaining audit work |
| [`V1_0_7_PLAN.md`](V1_0_7_PLAN.md) | Active source of truth | Complete V1.0.7 scope, sequencing and release gates |
| [`V1_0_7_POST_AUDIT.md`](V1_0_7_POST_AUDIT.md) | Active, validation in progress | Six-lot correction implementation and proof limits |
| [`V1_0_7_VALIDATION.md`](V1_0_7_VALIDATION.md) | Active, overall gate blocked | Current conversion, OCR and platform release ledger |
| [`V1_0_7_EDITOR_VALIDATION.md`](V1_0_7_EDITOR_VALIDATION.md) | Historical, cancelled on 2026-10-29 | Editor implementation and real Tauri validation |
| [`V1_0_7_EDITOR_UI_QA.md`](V1_0_7_EDITOR_UI_QA.md) | Historical, cancelled on 2026-10-29 | Historical editor regressions and Vellum Paper responsive evidence |
| [`V1_0_7_EDITOR_WORD_REVIEW.md`](V1_0_7_EDITOR_WORD_REVIEW.md) | Historical, cancelled on 2026-10-29 | Word comparison, compact ribbon, keyboard/zoom and contextual image editing; proposed follow-up priorities |
| [`V1_0_7_OCR.md`](V1_0_7_OCR.md) | Active, broader gate open | OCR behavior, architecture, security and test contract |
| [`REFACTOR_BASELINE.md`](REFACTOR_BASELINE.md) | Active | Phase 1 measurements and Phase 2 refactor budgets |
| [`TESTING.md`](TESTING.md) | Active | Commands and platform validation procedures |
| [`THIRD_PARTY_ENGINES.md`](THIRD_PARTY_ENGINES.md) | Active | Engine licensing, checksums, notices and packaging rules |

## Project Architecture

- [`TAILWIND_4_UBUNTU_VALIDATION.md`](TAILWIND_4_UBUNTU_VALIDATION.md) records the
  isolated Tailwind 4 compatibility tests before a desktop-only Svelte migration
  decision. It does not change the active framework or release readiness.
- [`OPEN_DESIGN_SYSTEM.md`](OPEN_DESIGN_SYSTEM.md) records the approved light/dark
  identity, its native Open Design registration and validation evidence.
- [`ARCHITECTURE.md`](ARCHITECTURE.md) defines the desktop, site, branding,
  conversion, OCR and standalone repository boundaries.
- [`LOCAL_WORKSPACE.md`](LOCAL_WORKSPACE.md) records the standalone location,
  preserved worktrees and relocation checks.
- [`SECURITY.md`](SECURITY.md) documents the local desktop threat model, the
  conversion/OCR boundaries and the enforced Tauri CSP. Repository
  vulnerability reporting remains in [`../SECURITY.md`](../SECURITY.md).
- [`DECISIONS.md`](DECISIONS.md) records the workspace consolidation, retained
  stacks and handling of the active V1.0.7 development tree.
- [`../site/README.md`](../site/README.md) documents the static site commands
  and Pages publication path.
- [`../branding-kit/README.md`](../branding-kit/README.md) indexes the reusable
  brand sources and their web-ready copies.

## Rule Hierarchy

- Repository [`AGENTS.md`](../AGENTS.md) and `.agents/rules/` are authoritative.
- Development rules and design references are maintained locally.
  Historical integration decisions and audit context remain historical records.

## Release Documentation

- `RELEASE_CHECKLIST_WINDOWS.md`, `RELEASE_CHECKLIST_MACOS.md` and `RELEASE_CHECKLIST_LINUX.md` describe platform publication gates.
- `RELEASE_HANDOFF_V1.0.6.md`, `RELEASE_NOTES_V1.0.6_*` and `V1_0_6_VALIDATION.md` are the published V1.0.6 record.
- V1.0.5 files are historical evidence. They must not be used as the current V1.0.7 status.
- Final V1.0.7 release notes do not exist yet and must not be written as completed until the remaining V1.0.7 gates pass.

## Documentation Rules

- Distinguish implemented behavior from planned behavior.
- Do not claim OCR is available before real packaged `PP-OCRv6_medium` inference passes.
- Document/PDF editing was cancelled on 2026-10-29; editor reports below are historical.
- Keep the authorized development metadata synchronized at `1.0.7`; this does not authorize a release.
- Keep public release notes in English.
- Keep user files and recognized OCR text local and private.
