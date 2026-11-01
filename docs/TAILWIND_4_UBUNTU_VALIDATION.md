# Tailwind 4 Ubuntu feasibility — 2026-11-01

## Result and decision boundary

**PASS for the isolated CSS compatibility criteria below.** Tailwind CSS and its
CLI **4.3.3** compiled with native Linux Node **24.16.0**. The generated stylesheet
passes on the tested Ubuntu 22.04 and 24.04 WebKitGTK engines, including a real
minimal Tauri **2.12.5** window on Ubuntu 24.04.

This supports choosing Tailwind 4 for the proposed desktop migration. It does
not implement or approve the final Svelte/shadcn-svelte migration. The marketing
site is explicitly outside the requested migration scope. Multi-Converter's
current frontend, backend, dependency locks and release gate are unchanged.

**Subsequent maintainer decision, 2026-11-01:** the desktop migration architecture
is now approved and its [execution mandate](MANDAT_MIGRATION_SVELTE.md) is
prepared. Implementation has not started. This later approval does not expand
the compatibility or application evidence established by the tests below.

## Current runtime evidence

| Environment | Actual runtime | Modes | Scenarios | Assertions |
| --- | --- | --- | --- | --- |
| Ubuntu 22.04.5 userspace in an isolated chroot on WSL2 | WebKitGTK 2.50.4, Ubuntu package `2.50.4-0ubuntu0.22.04.1` | Normal and reduced motion | 16 | 416 passed, 0 failed |
| Ubuntu 24.04.3 WSL2 | WebKitGTK 2.52.6, Ubuntu package `2.52.6-0ubuntu0.24.04.1` | Normal and reduced motion | 16 | 416 passed, 0 failed |
| Ubuntu 24.04.3 WSL2 | Actual minimal Tauri 2.12.5 binary linked to WebKitGTK 2.52.6 | Normal motion | 8 | 208 passed, 0 failed |

Total: **40 scenarios, 1,040 successful assertions, zero failed assertions**.
These are 26 criteria repeated across the scenario matrix, not 1,040 distinct
product tests. Every run exercises light and dark themes at actual viewport
widths **375, 768, 1024 and 1440**, with height 840. Forty viewport captures
were generated; four representative captures are retained with the versioned
receipt. Screenshots capture the viewport after focus/dialog checks, so narrow
views can be vertically scrolled.

The Ubuntu 22.04 userspace was extracted from the official Ubuntu Base archive,
checked against the SHA-256 fetched from the official HTTPS directory:
`242cd8898b33ea806ef5f13b1076ed7c76f9f989d18384452f7166692438ff1a`.
Its packages came from the Jammy repositories, including updates/security.
No Noble WebKit libraries were injected into that userspace.

## Observable criteria

All criteria are **PASS** on the named runs:

- Native viewport width, no horizontal overflow, spacing and responsive grids.
- Shared CSS theme variables, warm-white action text and Tailwind dark variants.
- Actual color/alpha values for `color-mix()`, OKLCH gradient styles and borders.
- Rounded corners, normal/custom shadows and ring composition.
- Individual translate/rotate utilities, blur and backdrop blur computed styles.
- Container queries and actual noninheritance of an `@property` registration.
- Disabled opacity and a visible focus outline after native keyboard input.
- `prefers-reduced-motion` exposed by GTK, with Tailwind disabling the transition
  property when reduced motion is enabled. Actual media-query values are saved.
- Native HTML dialog opening/closing and no captured JavaScript errors.

The feature report also detects `CSSStartingStyleRule`; it does not measure
animation frame timing or establish complete support for every Tailwind utility.
Four screenshots were visually inspected: the wide/light and narrow/dark Tauri
views, and wide/dark and narrow/light Ubuntu 22.04 WebKit views. No horizontal
clipping or missing tested visual effect was observed.

## Proof limits

- Ubuntu 22.04 is an isolated real Jammy userspace sharing the WSL2 kernel,
  rather than a clean physical desktop or a booted Ubuntu 22.04 VM.
- The native engines render under Xvfb/X11 with software graphics. Wayland,
  real GPU/driver behavior and desktop integration are not established.
- The root-owned chroot fixture disables WebKit's process sandbox for this
  isolated harness only. This is not a production configuration change and
  does not validate production sandbox behavior.
- The Tauri fixture was compiled and executed on Ubuntu 24.04. It was not run
  on Ubuntu 22.04: its ELF requires GLIBC 2.39. The separate Jammy WebKit run
  establishes CSS behavior there, not Tauri binary/package compatibility.
- Svelte, Bits UI and shadcn-svelte components were not installed or tested.
  Their integration, focus restoration and actual product dialogs require
  their own next-stage checks.
- No conversions, OCR, AppImage, installed acceptance or release validation ran.
- Older/unpatched WebKitGTK installations remain **NOT PROVEN**. Do not infer
  support for every Ubuntu 22.04 installation from the OS name alone or treat
  the tested WebKit version as a measured minimum-version threshold.

Tailwind's official compatibility documentation requires modern browser engines.
Before adopting it, document the supported Linux runtime policy and retain a
WebKitGTK check in the UI validation path. These results remove the observed
CSS feasibility blocker; they do not close the V1.0.7 release gate.

## Receipts and reproduction

- [Summary and source SHA-256 inventory](audits/2026-11-01/tailwind4-ubuntu/summary.json).
- [Ubuntu 22.04 normal](audits/2026-11-01/tailwind4-ubuntu/ubuntu-22.04.json)
  and [reduced motion](audits/2026-11-01/tailwind4-ubuntu/ubuntu-22.04-reduced.json).
- [Ubuntu 24.04 normal](audits/2026-11-01/tailwind4-ubuntu/ubuntu-24.04.json)
  and [reduced motion](audits/2026-11-01/tailwind4-ubuntu/ubuntu-24.04-reduced.json).
- [Actual Tauri run](audits/2026-11-01/tailwind4-ubuntu/tauri-ubuntu-24.04.json).
- [Reproduction instructions](audits/2026-11-01/tailwind4-ubuntu/reproduce/README.md).

Full local output remains in ignored `tmp/tailwind4-ubuntu/results/` and in
`/home/ryadb/tailwind4-ubuntu-probe/results` on Ubuntu. The rootfs and native build
cache are retained there; the chroot test processes and mounts were released.
The pre-existing `src-tauri/Cargo.toml` modification was preserved. No remote
push, publication or framework replacement was performed.

The initial fixture needed two test corrections: native keyboard input before
asserting `:focus-visible`, and checking `transition-property: none` rather than
assuming `transition-duration` becomes zero. The screenshot bridge also needed
`python3-gi-cairo`. The final fixture was rerun across all five runs above.

Official references:
[Tailwind compatibility](https://tailwindcss.com/docs/compatibility),
[Tailwind CLI](https://tailwindcss.com/docs/installation/tailwind-cli),
[Ubuntu Base](https://cdimage.ubuntu.com/ubuntu-base/releases/22.04/release/),
[Tauri WebViews](https://v2.tauri.app/reference/webview-versions/).
