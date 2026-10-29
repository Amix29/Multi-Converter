# Multi-Converter Documentation

## Current Product State

- Published stable release: **V1.0.6**
- Platforms: Windows x64, universal macOS and Linux x64
- Repository surfaces: desktop application, static marketing site and branding kit
- Development release: **V1.0.7**
- Local integration branch: **`codex/test`**; cleanup developed on **`codex/remove-file-editor`**; V1.0.7 remains unpublished and its release gate is open
- V1.0.7 objectives:
  - local `PP-OCRv6_medium` OCR for PDF-to-text conversion and copying text from images.

## V1.0.7 Source Documents

| Document | Status | Purpose |
| --- | --- | --- |
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

- [`ARCHITECTURE.md`](ARCHITECTURE.md) defines the desktop, site, branding,
  conversion, OCR and Atelier IA boundaries.
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

- The Atelier rules in [`../../../AGENTS.md`](../../../AGENTS.md), its indexed
  rules and [`../../../Stack.md`](../../../Stack.md) are authoritative.
- Project rules contain only Multi-Converter-specific additions.
- A duplicated or conflicting project rule must be removed in favor of the
  Atelier rule.

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
