# Standalone Local Workspace

## Location and ownership

On 2026-10-30 the maintainer requested relocating the independent repository to
`%USERPROFILE%\Développement\Multi-Converter`.
This checkout owns `.git`, the desktop application, `site/`, `branding-kit/`,
the engine inputs and local generated files. Its remote remains
`https://github.com/Amix29/Multi-Converter.git`.

The root checkout stays on `codex/test`, with functional UI source `853aa081`.
Current design/documentation maintenance uses `codex/app-design-system`.
Relocation used `codex/standalone-relocation`; the earlier native candidate
source was `8b510138`. Documentation-only HEADs may follow the functional source.
No push, release, dependency upgrade or application-data migration is implied.

## Governance

Read the root `AGENTS.md`, `.agents/rules/`, `V1_0_7_PLAN.md`,
`V1_0_7_VALIDATION.md` and `V1_0_7_AUDIT_FOLLOW_THROUGH.md` from this repository.
The local development rule preserves the existing stack, approved product design,
quality budgets and evidence boundaries. Repository rules are self-contained;
no parent rules file, stack matrix or shared-skill junction is required.
Earlier integration decisions and old editor worktrees are historical; the
active converter/OCR scope does not restore editing features.

The active design contract is `branding-kit/08_design-system/DESIGN.md`.
The desktop imports its tokens through `src/styles/design-system.css`, including
dedicated `--action-*` roles for warm-white labels on colored primary buttons.
The old vendor palette remains historical. See
[the UI handoff](APP_DESIGN_SYSTEM_ADOPTION.md) for current checks and test steps.

## Worktrees and local artifacts

Use `git worktree list --porcelain` from the new root to find all checkouts.
Three historical worktrees live in the root's ignored `.worktrees/` directory.
Their branches, dirty files and
untracked sources are preserved; they are not merged, reset or removed.
Existing external Codex worktrees retain their locations and have their Git
links repaired to the new common repository. Previously missing worktree
records stay recoverable and are not pruned as part of the move.

Final application-source `8b510138` NSIS/AppImage/DMG candidates are kept under
the root checkout's ignored `tmp/local-audit-8b510138/`; their versioned receipts
remain in `docs/audits/2026-10-30/`. Build caches and old candidates already in
the original checkout move with it. The empty pre-existing destination and
former empty root container are preserved as local relocation backups. The
disabled shared-skill junction was archived outside the repository.

The installed application, user files, preferences, drafts from older versions
and OCR caches are independent of the source directory and stay in place.
No compatibility junction is created at the former repository location.

## Validation

Relocation checks passed for all six checkouts, including unchanged HEAD/status
and SHA-256 verification of 66 modified/untracked historical source files.
The three final candidate hashes and the origin remote are unchanged; the
former root no longer exists. All 120 local links in the changed documentation
resolve within this repository. The former portal's real registry and catalogue
route pass with the other two project objects unchanged and no removed entry.

`npm run check` passed from both the maintenance worktree and the relocated
primary checkout. `npm run build:frontend` passed from the new root. The staged
secret-leak scan, documentation-name scan and `git diff --check` also pass.
See the audit follow-through ledger and the versioned relocation receipt.

## Svelte migration integration — 2026-11-01

The Svelte desktop source at `adf7b8ce` is integrated locally on `codex/test`.
The implementation worktree on `codex/migrate-svelte` remains available for
reproduction, React-file recovery and later installed acceptance. Do not remove
its local staged engines or candidates as part of routine cleanup.

The 39 modified/untracked initial documentation files match preserved checkpoint
`9b26001d`. Their recoverable stash is
`ef19e736dfed79522a14ee768054884378970d2f` (message `pre-svelte-docs-preserved-2026-11-01`).
They are already represented by the migrated history; blindly applying the stash
would restore obsolete status text. The original Cargo.toml bytes are unchanged.
See [the integration receipt](audits/2026-11-01/svelte-migration/local-integration.json)
and [execution ledger](MIGRATION_SVELTE_EXECUTION.md). No push/publication occurred.

## Windows native OCR integration — 2026-11-08

Application source `2e907a86` is fast-forwarded locally from
`codex/migrate-svelte` to the primary `codex/test` checkout. The pre-existing
Cargo.toml bytes remain unchanged; no push or publication occurs. See
[the integration receipt](audits/2026-11-08/engine-lot4/source-integration-dll-closure.json).

The separately locked native OCR profile is available in both checkouts through
547 NTFS hardlinks. Only eight mutable JSON metadata files (166,757 bytes) are
copied to isolate later explicit preparation; the exact profile verifies from
the primary checkout too. See
[resource staging](audits/2026-11-08/engine-lot4/integration-resources.json).
Original OCR/runtime/engine sources and previous v2/v3 profiles are retained.
The preceding native profile is moved to `windows-x64/native-before-msvc-closure/ocr`
in the primary checkout, retaining its immutable hardlinked payload without
copying it. Its original staging receipt is preserved separately. The real
worker lifecycle passes from the accented primary path with all observed
Microsoft/ONNX runtime modules loaded locally.

Before rebuilding, the lot 3 setup/signature and source application binary were
moved to preserved directories under the existing Tauri build cache. Their
original hashes match the
[relocation receipt](audits/2026-11-08/engine-lot4/artifact-preservation.json).
The task-created incomplete NSIS research counter is recoverable from Recycle
Bin; it is not an accepted installer. User application data and installed
applications are untouched. Final lot 4 measurements and proof limits live in
[the execution ledger](ENGINE_REDUCTION_EXECUTION.md).
