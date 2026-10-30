# Standalone Local Workspace

## Location and ownership

On 2026-10-30 the maintainer requested relocating the independent repository to
`%USERPROFILE%\Développement\Multi-Converter`.
This checkout owns `.git`, the desktop application, `site/`, `branding-kit/`,
the engine inputs and local generated files. Its remote remains
`https://github.com/Amix29/Multi-Converter.git`.

The root checkout stays on `codex/test`. Relocation maintenance is isolated on
`codex/standalone-relocation`; the prior application source remains `8b510138`.
No push, release, dependency upgrade or application-data migration is implied.

## Governance

Read the root `AGENTS.md`, `.agents/rules/`, `V1_0_7_PLAN.md`,
`V1_0_7_VALIDATION.md` and `V1_0_7_AUDIT_FOLLOW_THROUGH.md` from this repository.
The local development rule preserves the existing stack, Vellum Paper design,
quality budgets and evidence boundaries. Repository rules are self-contained;
no parent rules file, stack matrix or shared-skill junction is required.
Earlier integration decisions and old editor worktrees are historical; the
active converter/OCR scope does not restore editing features.

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
