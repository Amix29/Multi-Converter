# Release Engineering

Keep public artifacts, updater metadata and platform claims aligned with verified builds.

## When this applies

- GitHub Actions, signing, packaging, release notes, tags, assets or publication.
- Engine or model archive staging.

## Rules

- **CRITICAL**: read the checklist for every platform included in a release.
- Use `codex/test` for unreleased experiments; keep `main` for reviewed stable work.
- Tauri updater signatures do not mean a macOS build is Apple-signed or notarized.
- Build and verify macOS packages on macOS and Linux packages on Linux x64.
- Release folders contain exactly the assets required by `AGENTS.md` and the selected platform validator.
- Do not publish generated engine archives, checksums or model/runtime inputs without maintainer approval and verified licenses.
- Public release notes and updater notes are English-only and describe only behavior verified for the exact version.
- A small number of emojis is encouraged in release notes when it improves scanning.
- Do not describe planned V1.0.7 OCR or an open editor matrix as released.

## Sources

- `docs/RELEASE_CHECKLIST_WINDOWS.md`
- `docs/RELEASE_CHECKLIST_MACOS.md`
- `docs/RELEASE_CHECKLIST_LINUX.md`
- `docs/THIRD_PARTY_ENGINES.md`
- `docs/V1_0_7_VALIDATION.md`
