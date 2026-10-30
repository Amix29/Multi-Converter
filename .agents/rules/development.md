# Standalone Development

Multi-Converter owns its desktop application, marketing site and branding kit.

- Keep desktop React/TypeScript/Vite/Tauri 2/Rust, the existing static Next.js
  site and the exact Node/npm versions declared in the repository. Record
  architectural or dependency decisions in `docs/DECISIONS.md`; moving the
  repository does not authorize a framework or package-manager migration.
- Desktop, `site/` and `branding-kit/` remain separate responsibilities within
  one repository. Each area uses repository-owned rules and build configuration.
- Keep the desktop's Vellum Paper foundation, vendored tokens in
  `src/styles/vendor/vellum-tokens.css` and focused styling described in
  `docs/ARCHITECTURE.md`. Preserve keyboard access, visible focus, accessible
  labels, reduced motion and narrow-window behavior when changing the UI.
  Target WCAG 2.2 AA, coherent SVG icons and layouts checked at 375, 768, 1024
  and 1440 pixels. Use measurements before adding caches or performance layers.
- Use a dedicated worktree and a `codex/` branch for substantial changes.
  Preserve dirty trees and untracked files. Integrate verified unreleased work
  locally on `codex/test`; keep `main` stable. Push and publication require
  explicit authorization.
- Give each module one responsibility. Aim for 300 logical lines; extract the
  touched responsibility before exceeding the enforced 500-line source budget.
  Keep generated/vendor code isolated and reuse the existing domain boundaries.
- Apply `docs/SECURITY.md` and the product constraints: local/private processing,
  bounded untrusted input, validated IPC/filesystem boundaries and no secrets
  in source or generated evidence.
- Run checks appropriate to the changed behavior and distinguish static,
  browser, native-host, installed-package and published-release evidence.
- Update the affected documentation and recovery ledger alongside material
  changes, including workspace moves. Finish with `git diff --check` and report
  only checks actually executed.

See `docs/LOCAL_WORKSPACE.md` for the standalone location and worktree recovery.
