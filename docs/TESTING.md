# Testing Matrix

This document describes the current desktop release test split by platform. The published baseline is V1.0.6 on Windows x64, universal macOS and Linux x64. V1.0.7 is in development with the Tiptap editor and local `PP-OCRv6_medium` OCR; see `V1_0_7_PLAN.md` for scope and `V1_0_7_VALIDATION.md` for the combined gate. Use this document to avoid false confidence from checks that ran on only one operating system.

Historical V1.0.5 and V1.0.6 status commands remain documented where release workflows still use their recorded evidence. They are not the current V1.0.7 completion gate.

## Windows x64

Windows x64 is one of the current V1.0.6 public platforms and remains the primary local development gate. Use the grouped command when you want the same Windows validation sequence as the GitHub `Build` workflow:

```powershell
npm run test:windows:ci
```

That command intentionally refuses non-Windows hosts and runs:

```powershell
npm audit --omit=dev
npm audit
npm run prepare:bundled-engines
npm run check
npm run test:ui:preview
npm run fmt:rust:check
npm run clippy:rust
npm run audit:rust
npm run validate:engines
npm run test:rust
npm run test:conversions
npm run test:pdfium-wrapper
npm run clippy:pdfium-wrapper
npm run build
npm run tauri:build
```

These 15 steps include both production-only and complete installed dependency
audits. `npm run check` contains the unit, source-contract, production-config
and secret-leak checks; the separate Playwright step then exercises the
compiled frontend in Chromium. During a long local run, the wrapper writes
progress to `tmp/windows-ci-gate-status.json`. If a terminal session times out
while `tauri:build` or NSIS is still running, inspect that file and the running
processes before starting another full gate.

Before publishing Windows assets, prepare a clean release folder and run:

```powershell
npm run validate:release-assets -- --version X.Y.Z --dir "$env:LOCALAPPDATA\Temp\mc-release-assets\vX.Y.Z" --platform windows
```

## Dependency Audits

Run package and Rust dependency audits before release:

```powershell
npm audit --omit=dev
npm audit
npm run audit:rust
```

Both npm audits should finish with no known vulnerabilities. The first makes
the production dependency boundary explicit; the second also covers the local
build and test toolchain.

`npm run audit:rust` runs Cargo Audit against `src-tauri/Cargo.lock` without advisory exceptions and fails on denied vulnerabilities. The former build-time `wayland-scanner 0.31.10` dependency was updated to `0.31.11`, which removed the vulnerable `quick-xml 0.39.4` parser and allowed the two temporary RustSec exceptions to be deleted.

Cargo Audit does not fail on warning categories unless `--deny warnings`, `--deny unmaintained`, `--deny unsound` or `--deny yanked` is added. Do not report this as "no RustSec warnings" unless that stricter command also passes.

For the current V1.0.6 baseline and V1.0.7 development tree, the expected Rust audit state is:

- 0 reported vulnerabilities;
- allowed warning categories from transitive Tauri/Linux GTK-related crates and a few unmaintained utility crates, including the remaining `glib 0.18.5` unsoundness warning;
- follow-up review needed when Tauri, Wry or Linux support dependencies are upgraded.

## Secret Leak Scan

Run this before commits, release notes, release assets or the final Codex Security pass:

```bash
npm run test:secret-leaks
```

The scan checks tracked file paths and tracked text files for credential file names, private key blocks, common service tokens, accidental long secret assignments, Apple signing key/certificate/profile filenames, private test repository references and maintainer-local Windows paths. It reports only the file, line and pattern name; it does not print the matched secret value.

## Production Config Check

Run this before publishing code or building release assets:

```bash
npm run test:production-config
```

This check keeps frontend environment exposure narrow. In particular, Vite must expose only `VITE_` variables to client code; broad prefixes such as `TAURI_` are not allowed because maintainer machines and CI can carry signing or release secrets in `TAURI_*` variables.

## Marketing Site

Install the site dependencies once, then run its complete gate from the
repository root:

```bash
npm --prefix site install
npm run site:check
npm --prefix site audit --omit=dev
```

The site gate runs TypeScript checking, the static Next.js export, screenshot
optimization and the SEO audit. Generated `site/.next/`, `site/out/`,
`site/output/` and `site/node_modules/` content is not source and must remain
ignored.

The 2026-07-30 production dependency audit passes with zero known
vulnerabilities after resolving Next.js `16.2.12`, PostCSS `8.5.25` and one
deduplicated Sharp `0.35.3` instance. See `../SECURITY.md` for the maintained
dependency boundary.

Changes to the Pages pipeline must update
`.github/workflows/deploy-pages.yml`. GitHub reads workflows only from the
repository-level `.github/workflows/` directory; the workflow executes its npm
steps inside `site/` and uploads `site/out`.

## Frontend Guardrails

Use the fast unit suite while changing pure frontend logic:

```bash
npm run typecheck:tests
npm run test:unit
```

The dedicated TypeScript project covers `tests/**/*.ts`,
`playwright.config.ts` and `vitest.config.ts`; the application `tsconfig.json`
continues to cover `src` only.

Vitest currently exercises the DOM-independent editor pagination planner,
including empty input, overflow, forced page breaks, oversized blocks and
invalid measurements. Add pure logic here rather than extending a source-text
contract with behavior that can be executed directly.

Use the compiled-preview behavior suite after changing application flows,
responsive layout or editor dialogs:

```bash
npx playwright install chromium
npm run test:ui:preview
```

Playwright builds the frontend, serves `dist` on `127.0.0.1:4173`, and runs the
same scenarios in desktop Chromium and a 390 x 844 mobile viewport. Reports,
traces and failure screenshots are written under `output/playwright/` and stay
local.

The preview API is an in-memory browser simulation. These tests do not prove
native Tauri file access, real conversion output, durable editor persistence,
sidecars, updater behavior, OCR or packaging. Keep Rust, conversion, host and
packaging gates for those responsibilities.

Run both focused guardrail suites with:

```bash
npm run test:guardrails
```

## Local Refactor Measurements

Capture a structured local engineering snapshot without recording user
content or sending measurement telemetry:

```powershell
npm run measure:baseline -- --output test-results/phase-1-baseline/current.json --gate-status tmp/windows-ci-gate-status.json
```

Pass `--artifact <exact-path>` to include a known installer or executable.
The report counts software source only within configured repository folders,
reports raw and gzip frontend bundle sizes, keeps engine sizes separate, and
can summarize a Windows gate status ledger. Generated JSON remains ignored.
Detected artifacts and engine folders reflect the current machine state, so
compare reports only when the same preparation command and artifact boundary
were used.

On Windows, an opt-in startup proxy can measure process launch to the first
responsive top-level window and sample process memory:

```powershell
npm run measure:windows-runtime -- -ExecutablePath "<exact-exe-path>" -Runs 5
```

The first sample is labelled `first` and later samples `repeat`; this is not a
controlled cold-start benchmark. A responsive window handle is only a startup
proxy, not proof that conversion, editor or interaction work is ready. Memory
figures cover the launched root process and do not include WebView2 or engine
child processes. The script itself does not read user content or send
telemetry, but it launches Multi-Converter with its normal local profile and
does not isolate the app from configured updater checks. See
`REFACTOR_BASELINE.md` for the fixed Phase 1 boundary and interpretation rules.

## Document Editor

Run the editor contract tests after changing the Tiptap setup, document model, pagination, autosave commands or editor navigation:

```bash
npm run test:editor
npm run test:unit
npm run test:ui-layout
npm run typecheck
```

`npm run test:editor` verifies that all Tiptap packages stay on one exact
open-source version, rejects `@tiptap-pro/*`, checks the shared
frontend/backend command contract and forbids Office-to-HTML routing.
`npm run test:unit` executes the DOM-independent pagination planner. The Rust
suite covers local draft paths, atomic writes, the bounded ODT parser, hostile
XML/archive inputs, `mc-asset://` validation, rich ODT round trips, page layout,
headers, footers and numbering.

After an editor UI change, also run the Vite preview and verify:

- the landing screen, mode switching, document creation, text entry and autosave state;
- HTML drag and drop on the editor landing area, including the visible drag-active state, unsupported extensions and the one-document limit;
- recent-document rename, duplicate and delete actions;
- deletion cancellation and the confirmation text explaining that the original source is not removed;
- a recent-document menu opened on an upper grid row with enough cards to create a second row;
- the open menu remains above later cards and its destructive item remains visible and clickable;
- rename, delete, header and footer dialogs cover the full viewport rather than being constrained by the animated editor workspace;
- destructive buttons keep a readable danger background and text contrast;
- keyboard focus, reduced-motion behavior, console output and a 390 px viewport without horizontal overflow.

`npm run test:ui-layout` contains regression contracts for editor drop routing, the active recent-card stacking layer, React portal dialogs and destructive-button styling.

Vite uses a simulated local API. Opening, saving, importing, native Tauri file drops and exporting real files must be checked through `npm start` or `npm run tauri:dev`.

To inspect the compiled frontend rather than the development module graph, run
the automated preview suite or build and serve `dist` manually:

```bash
npm run test:ui:preview
npm run build:frontend
npm run preview:test
```

Before starting the OCR work, run the Windows Tauri editor matrix for ODT, DOCX and RTF: import a rich multi-page document, edit body/header/footer/table/image/page settings, save as each office format, export PDF, reopen the office outputs, restart the app, and test overwrite confirmation plus an external-source conflict. Record the engine versions, output hashes, screenshots and every anomaly in `docs/V1_0_7_EDITOR_VALIDATION.md`. A Vite-only result is not valid evidence for this matrix.

Persistent editor JSON must contain only `mc-asset://<uuid>` image references. Tests should reject Base64, Blob URLs, file paths and remote URLs; manual restart testing must confirm that the associated image bytes remain available after the WebView Blob URLs have been revoked and recreated.

Editor PDF import must remain unavailable until the PP-OCRv6_medium integration is implemented. Do not describe PDF export or office round trips as platform-complete until the real conversion matrix has passed on that platform.

## V1.0.7 OCR Gate

OCR is specified in `V1_0_7_OCR.md` but is not implemented yet. There is currently no runnable OCR test command, and documentation must not pretend otherwise.

When OCR implementation begins:

- add a dedicated OCR contract command;
- include it in `npm run check`;
- add real-model integration coverage to the Rust/Tauri test path;
- record the exact model/runtime version, origin, SHA-256 and installed size;
- ensure tests run offline and fail if a network fallback is attempted.

Minimum automated coverage:

- native-text, scanned and mixed PDFs;
- PDF page rasterization and page order;
- PNG, JPEG, WebP, TIFF and BMP;
- French accents and reviewed multilingual fixtures;
- TXT, Markdown and HTML serialization;
- OCR result to Tiptap JSON;
- explicit image-text clipboard result;
- progress and cancellation;
- corrupt/password-protected inputs;
- source, pixel, page, time and memory limits;
- temporary-file cleanup and original-file integrity.

Minimum real Tauri coverage on Windows:

1. disconnect network access;
2. launch the packaged application;
3. convert native, scanned and mixed PDFs to each advertised text target;
4. copy recognized text from each advertised image format;
5. open a scanned PDF in the editor and export the edited document;
6. cancel a multipage OCR job;
7. restart and repeat without model download;
8. record output hashes, screenshots, timings, peak memory and warnings.

Windows OCR validation is required before the version bump. Equivalent real host tests remain required on macOS and Linux before publishing V1.0.7 packages for those platforms.

## macOS Code Checks

macOS Rust checks and host validation must run on macOS. Do not treat a failed Windows cross-check as a product failure when it fails before Multi-Converter code on a Darwin-only C/Objective-C dependency.

`npm run test:macos-packaging` is a static contract test and may run on any OS. `npm run test:macos:host` is different: it must run on a real macOS host or a GitHub Actions `macos-latest` runner, and it intentionally fails on Windows and Linux.

When GitHub Actions minutes are unavailable and no real Mac is connected, keep using the static contract checks only:

```bash
npm run test:macos-packaging
npm run test:github-workflows
```

Those checks prove the gates are still strict. They do not prove that macOS conversions work.

The GitHub `Build` workflow runs a `macOS code check` job on `macos-latest` for both:

- `aarch64-apple-darwin`
- `x86_64-apple-darwin`

Pushes that modify only Markdown/docs files skip the full `Build` workflow to conserve GitHub Actions minutes. Pushes to the persistent `codex/test` branch also skip the expensive `Build` jobs unless the repository variable `MC_ENABLE_CODEX_TEST_BUILD` is set to `1`; use that variable or `workflow_dispatch` when a maintainer intentionally wants the full build from the test branch.

All `Build` and `Release` jobs check out with `lfs: false`. Platform sidecars and advanced engines must come from the verified preparation or staging paths used by each job; a release gate must not depend on the repository Git LFS budget.

That job intentionally runs code and contract checks that do not require unreleased local engine binaries:

```bash
npm run validate:embedded-manifest
npm run validate:i18n
npm run typecheck
npm run test:release-notes
npm run test:macos-packaging
npm run test:github-workflows
npm run test:release-assets
npm run test:bundled-engines-platform
npm run test:ui-layout
npm run test:repository-metadata
npm run test:run-tauri
npm run fmt:rust:check
node scripts/prepare-tauri-ci-sidecars.mjs --target <darwin-target>
node scripts/cargo-test-temp.mjs check --manifest-path src-tauri/Cargo.toml --target <darwin-target>
node scripts/cargo-test-temp.mjs clippy --manifest-path src-tauri/Cargo.toml --target <darwin-target> --all-targets -- -D warnings
```

`prepare-tauri-ci-sidecars.mjs` is compile-only CI scaffolding. It creates small placeholder sidecar files and an empty bundled-engine resource directory so the Tauri build script can evaluate `externalBin` and resources during `cargo check`, `cargo clippy` and native unit tests. It must not be used for DMG packaging or conversion validation.

The same workflow also runs a separate `macOS host unit tests` job on `macos-latest`:

```bash
node scripts/prepare-tauri-ci-sidecars.mjs --target host
npm run test:rust
npm run test:pdfium-wrapper:compile
npm run clippy:pdfium-wrapper
```

This job proves the Rust unit tests run on a real macOS runner and that the PDFium wrapper compiles and lints there. It intentionally does not run the PDFium wrapper runtime tests until a macOS PDFium library is staged.

## macOS Conversion Matrix

Do not claim that all macOS conversions work from the `macOS code check` or `macOS host unit tests` jobs. Those jobs are compile/unit gates only.

Full macOS conversion validation is the manual `macOS Conversion Matrix` workflow. It runs as a two-architecture matrix on Apple Silicon (`macos-latest`) and Intel (`macos-15-intel`), refuses CI placeholder sidecars, requires real Apple Silicon and Intel FFmpeg/ffprobe sidecars, requires `macos-universal` manifest entries for PDFium, LibreOffice, Pandoc and libvips, prepares the bundled engines, runs real macOS host validation, runs the PDFium wrapper runtime tests with a macOS PDFium library, and then runs:

```bash
npm run test:macos:conversions
```

That script ultimately runs:

```bash
npm run prepare:bundled-engines
npm run test:macos:host
npm run test:pdfium-wrapper
npm run test:conversions
```

Historical v1.0.5 two-architecture `macOS Conversion Matrix` evidence is recorded in `docs/V1_0_5_VALIDATION.md`. V1.0.6 superseded that evidence and is the current public baseline. Rerun the two-architecture matrix after any conversion, sidecar, engine, manifest, editor, OCR or packaging change before making a new macOS conversion claim. If the real macOS stack is missing or incomplete, this gate must fail instead of allowing release notes or status updates to say that all macOS conversions were tested.

Use `npm run prepare:ffmpeg-engine:macos` only with maintainer-approved Apple Silicon and Intel archives plus SHA-256 checksums. A source may be one combined archive containing both `ffmpeg` and `ffprobe`, or separate `FFMPEG_MACOS_*` and `FFPROBE_MACOS_*` archives with separate SHA-256 values. `npm run prepare:macos-upstream-engines` also requires pinned checksums for PDFium, LibreOffice and Pandoc through `PDFIUM_MACOS_UNIVERSAL_ARCHIVE_SHA256`, `LIBREOFFICE_MACOS_AARCH64_DMG_SHA256`, `LIBREOFFICE_MACOS_X86_64_DMG_SHA256`, `PANDOC_MACOS_AARCH64_ARCHIVE_SHA256` and `PANDOC_MACOS_X86_64_ARCHIVE_SHA256`. Use `npm run prepare:libvips-engine:macos` only with two already-portable libvips runtime trees. These scripts are strict packaging gates; they are not CI placeholders and should fail when the inputs are missing, unpinned or still linked to machine-local package manager paths.

The `macOS libvips Runtime` workflow builds native Homebrew-derived libvips runtime archives on Apple Silicon and Intel runners, rewrites their dynamic links to portable `@rpath` links, smoke-tests the native `vips copy` path, and uploads the two archives as GitHub Actions artifacts. On the persistent `codex/test` branch it is also push-runnable when the workflow or runtime builder changes and the `MC_ENABLE_MACOS_LIBVIPS_RUNTIME` repository variable is set to `1`, so libvips portability can be tested before those workflow files are merged to `main`. Leave that variable disabled for ordinary docs/status/package-metadata changes to avoid spending macOS runner minutes. Its `arch` input can retry one architecture, but complete macOS validation still requires both archives.

Do not set `output_release_tag` unless a maintainer intentionally wants a public prerelease tag to receive those runtime archives. Prefer passing the successful `macOS libvips Runtime` run ID as `libvips_runtime_run_id` to `macOS Engine Staging`; that keeps the handoff inside GitHub Actions artifacts. When a reviewed test release tag is used instead, pass it as `libvips_release_tag` for the engine staging workflow after reviewing dependency licenses.

When GitHub Actions minutes are unavailable, use a real Mac or self-hosted macOS runner instead. After collecting both libvips runtime archives and both FFmpeg archives/checksums, run local staging on macOS:

```bash
npm run prepare:macos-local-engines -- \
  --libvips-aarch64-archive /path/to/libvips-macos-aarch64.tar.gz \
  --libvips-x86_64-archive /path/to/libvips-macos-x86_64.tar.gz \
  --host-check
```

This command prepares FFmpeg/ffprobe from the configured `FFMPEG_MACOS_*` archive variables, prepares PDFium/LibreOffice/Pandoc from upstream sources after verifying the required SHA-256 values, extracts the two local libvips archives, packages `macos-universal` engine ZIPs, temporarily stages an embedded manifest containing only advanced macOS engines for local validation, seeds `engine-sources/.bundled-engine-cache` with every generated macOS archive, runs `npm run prepare:bundled-engines`, then restores the committed `src-tauri/engines-manifest.json` by default. Add `--conversions` only on a real Mac that should run the full conversion matrix. Use `--keep-generated-manifest` only when a maintainer explicitly wants to review and commit the exact advanced engine set; do not commit generated engine archives or bundled engine outputs without approval.

For GitHub Actions validation with staged release inputs, upload real sidecars to the tag passed as `sidecar_release_tag`, and upload `engines-manifest.json` plus the referenced macOS engine ZIPs to the tag passed as `engine_release_tag`. The workflows download those assets with `gh release download`, verify their SHA-256 checksums, write only advanced macOS engines into the embedded manifest, then seed `engine-sources/.bundled-engine-cache` so release assets can be tested without relying on public unauthenticated download URLs.

The `macOS Engine Staging` workflow can produce those staged assets as a GitHub Actions artifact without creating a release. On `codex/test`, it is also push-runnable when the repository variable `MC_ENABLE_MACOS_ENGINE_STAGING` is set to `1`; push runs read the explicit FFmpeg/ffprobe URLs, SHA-256 values, upstream PDFium/LibreOffice/Pandoc SHA-256 values and libvips source from `MC_*` repository variables. The manual workflow can still publish to a public test release when `output_release_tag` is intentionally provided. It always requires explicit FFmpeg archive URLs/checksums, upstream engine checksums and either a libvips runtime run ID or a libvips release tag; it does not select FFmpeg sources automatically.

Before building a DMG on macOS, also run:

```bash
npm run test:macos:host
```

That host-only check verifies Xcode Command Line Tools, `lipo`, both Darwin Rust targets, executable permissions, Apple Silicon/Intel/universal FFmpeg and ffprobe sidecar architectures, the universal sidecars' `-version` smoke tests, and bundled-engine validation for `macos-universal`.

`npm run tauri:build:macos` intentionally refuses Windows/Linux hosts before invoking Tauri. A universal DMG must be built on macOS, with staged macOS sidecars and engines.

After building the final DMG on macOS, run:

```bash
npm run verify:macos-dmg -- --version X.Y.Z --dmg path/to/Multi-Converter_X.Y.Z_macos-universal.dmg
```

That DMG verification also runs only on macOS. It mounts the DMG, checks `Multi-Converter.app`, verifies the app version, confirms the app executable and FFmpeg/ffprobe sidecars are universal `arm64 + x86_64` binaries, smoke-tests the bundled sidecars with `-version`, rejects stale Windows-only bundled engine resources, rejects bundled engine metadata that is not `macos-universal`, and runs `codesign --verify --deep --strict`.

## macOS DMG Validation

A macOS release is not ready from code checks alone. The release DMG must be built and tested on macOS using `docs/RELEASE_CHECKLIST_MACOS.md`.

For the published V1.0.6 baseline, run:

```bash
npm run status:v1.0.6
```

The command writes `tmp/v1.0.6-status.json`. The committed V1.0.6 evidence is complete and the status should report `releaseReady: true`.

The V1.0.5 status command and `docs/V1_0_5_VALIDATION.md` are retained only for historical reproducibility. In its then-current preparation state, `releaseReady` remained false until the old clean-Mac and Linux AppImage receipts were recorded; that statement is not the current product status.

For V1.0.7, create a version-specific status command and validation document only after the editor and OCR implementations expose real, testable gates. That future gate must require the editor Office matrix, packaged `PP-OCRv6_medium` fixtures, platform packaging, manual host tests and final security evidence. Do not reuse the V1.0.6 success as V1.0.7 proof.

## Linux x64

Linux support is tested separately from Windows and macOS so a green Windows build cannot imply Linux readiness.

Use this gate on GitHub Actions or a Linux x64 host for compile, unit and contract coverage:

```bash
npm run test:linux:ci
```

That gate intentionally uses compile-only Tauri sidecar placeholders and must not be described as real conversion validation. It runs Linux packaging contracts, staged Linux engine release asset tests, workflow contracts, TypeScript/i18n checks, Rust formatting, Linux target `cargo check`, Linux target Clippy, native Rust unit tests and PDFium wrapper compile/lint checks.

On Ubuntu hosts, install the Linux build dependencies first:

```bash
sudo apt-get install -y libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev libdbus-1-dev libssl-dev libxdo-dev librsvg2-dev build-essential pkg-config patchelf
```

Then run the Linux environment preflight:

```bash
npm run test:linux:environment
```

This preflight checks that Linux Node/npm/Rust tooling, Rust formatting/lint components, `pkg-config`, required native development packages and the Linux Tauri CLI native binding are available before slower compilation starts. In WSL, use a checkout under the WSL Linux filesystem with Linux-installed Node/npm/Rust tooling and Linux-installed `node_modules`; Windows-mounted checkouts or tools from `/mnt/c` are rejected because they can create hybrid builds. Running Linux npm installs in the same Windows checkout can replace Windows optional native packages, so prefer a separate WSL checkout or reinstall Windows dependencies afterwards.

When real Linux sidecars have been downloaded with matching `.sha256` files, stage them before host or conversion validation:

```bash
npm run prepare:linux-sidecars -- --asset-dir "<folder-containing-linux-sidecars>"
```

This helper verifies the checksums, rejects compile-only placeholders, rejects non-ELF and non-x86_64 ELF files, rejects extra files in the asset directory, copies the binaries into `src-tauri/binaries` and smoke-tests `-version` on Linux x64.

If the Linux sidecar release assets do not exist yet, prepare them first from maintainer-approved Linux x64 binaries:

```bash
npm run prepare:linux-sidecar-release-assets -- \
  --ffmpeg "<path-or-https-url-to-ffmpeg>" --ffmpeg-sha256 "<sha256>" \
  --ffprobe "<path-or-https-url-to-ffprobe>" --ffprobe-sha256 "<sha256>" \
  --out-dir "<clean-output-folder>"
```

The manual `Linux Sidecar Staging` workflow runs the same check on Ubuntu 22.04, uploads a `linux-sidecar-assets` artifact and can optionally upload the four expected sidecar files to a test release for the later `Linux AppImage Build` workflow. The later AppImage workflow rejects extra files in that sidecar artifact directory before staging the sidecars.
Inputs must be raw Linux x64 executables or maintainer-approved `.zip`, `.tar.gz`, `.tgz` or `.tar.xz` archives that contain the expected executable name. AppImages are rejected for sidecar staging, and local inputs must stay outside the output directory because that directory is cleaned before assets are written.

Use this host gate only on Linux x64 with real `ffmpeg-x86_64-unknown-linux-gnu` and `ffprobe-x86_64-unknown-linux-gnu` sidecars staged:

```bash
npm run test:linux:host
```

`npm run test:linux:host` refuses non-Linux hosts, rejects compile-only placeholder sidecars, smoke-tests the real sidecars with `-version`, and validates Linux bundled engines with `MULTI_CONVERTER_ENGINE_PLATFORM=linux-x64` and `MULTI_CONVERTER_REQUIRE_ADVANCED_ENGINES=1`. The bundled-engine validator also rejects Linux FFmpeg/ffprobe sidecars that are not x86_64 ELF files and obvious Windows/macOS binary paths in Linux advanced-engine manifests, including in smoke-skipped contract checks.

Run the full Linux conversion proof only after those real sidecars are staged:

```bash
npm run test:linux:conversions
```

This wrapper refuses non-Linux hosts, requires Linux `pdfium`, `libreoffice`, `pandoc` and `libvips` advanced engine manifest entries, prepares Linux bundled engines in strict mode, runs the strict host gate, then runs the complete conversion matrix through `npm run test:conversions`. A Linux release must not claim complete document/PDF/image conversion coverage from FFmpeg sidecars alone.

Build the public Linux package only on Linux:

```bash
npm run tauri:build:linux
```

Verify the built release-named AppImage before upload:

```bash
npm run verify:linux-appimage -- --version X.Y.Z --appimage Multi-Converter_X.Y.Z_linux-x64.AppImage --signature Multi-Converter_X.Y.Z_linux-x64.AppImage.sig
```

This verification extracts the AppImage without launching the UI, checks the AppDir structure, verifies bundled FFmpeg/ffprobe sidecars, rejects obvious Windows/macOS-only bundled files, rejects foreign-platform FFmpeg/ffprobe sidecars without relying on filename extensions and cryptographically verifies the updater signature against the configured Tauri updater public key.

The manual `Linux AppImage Build` GitHub Actions workflow is the normal CI handoff for producing release-named Linux artifacts. It accepts Linux sidecars from either `sidecar_release_tag` or `sidecar_staging_run_id`, but not both. The release tag or the `linux-sidecar-assets` workflow artifact must contain:

- `ffmpeg-x86_64-unknown-linux-gnu`
- `ffmpeg-x86_64-unknown-linux-gnu.sha256`
- `ffprobe-x86_64-unknown-linux-gnu`
- `ffprobe-x86_64-unknown-linux-gnu.sha256`

It also accepts Linux advanced engines from either `engine_release_tag` or `engine_staging_run_id`, but not both. The release tag or the `linux-engine-assets` workflow artifact must contain `engines-manifest.json` plus verified Linux `pdfium`, `libreoffice`, `pandoc` and `libvips` ZIP assets. Use `npm run prepare:linux-engine-sources` to validate reviewed Linux x64 `.zip`, `.tar.gz`, `.tgz` or `.tar.xz` source-tree archives with SHA-256 checks, `npm run package:linux-engines` to package them, then `npm run prepare:linux-engine-release-assets` to stage those assets into the embedded manifest and bundled-engine cache for a build. That staging helper rejects non-advanced Linux engine entries, duplicate advanced entries, missing required advanced entries and unexpected advanced entries.

When preparing Linux engine source trees from upstream downloads, `npm run prepare:pdfium-engine:linux`, `npm run prepare:libreoffice-engine:linux`, `npm run prepare:pandoc-engine:linux` and `npm run prepare:libvips-engine:linux` can generate the PDFium, LibreOffice, Pandoc and libvips source trees on Linux x64. PDFium, LibreOffice and Pandoc require explicit upstream SHA-256 environment values; libvips packages the Ubuntu `libvips-tools` runtime and verifies its copied dynamic libraries and modules. The manual `Linux Engine Staging` workflow can run these helpers when the upstream SHA-256 inputs and `libvips_apt_runtime=true` are provided instead of matching source-tree archive inputs, then `npm run prepare:linux-engine-sources -- --allow-existing` revalidates all source trees before packaging.

The manual `Linux Sidecar Staging` workflow can produce the required sidecar assets from explicit executable/archive URLs and checksums before the AppImage workflow. It installs `tar`, `unzip` and `xz-utils` before extraction. Accepted archive formats are `.zip`, `.tar.gz`, `.tgz` and `.tar.xz`. On `codex/test`, it is push-runnable only when `MC_ENABLE_LINUX_SIDECAR_STAGING=1` and the four `MC_FFMPEG_LINUX_X64_*` / `MC_FFPROBE_LINUX_X64_*` repository variables are set.

The manual `Linux Engine Staging` workflow performs that source validation and packaging on Ubuntu 22.04. It installs `tar`, `unzip`, `xz-utils`, `zip`, Debian package tools and `libvips-tools`, requires reviewed Linux runtime inputs for PDFium, LibreOffice, Pandoc and libvips, accepts `.zip`, `.tar.gz`, `.tgz` and `.tar.xz` source trees, uploads a `linux-engine-assets` artifact and can optionally upload the staged ZIPs plus `engines-manifest.json` to a test release. PDFium, LibreOffice and Pandoc may use upstream SHA-256 inputs instead of source-tree archive inputs; libvips may use `libvips_apt_runtime=true` instead of a source-tree archive. When `Linux AppImage Build` consumes a staging run ID, it verifies that the referenced run name and conclusion are exactly `Linux Sidecar Staging|success` or `Linux Engine Staging|success` before staging those artifacts.

On the persistent `codex/test` branch it is also push-runnable when `MC_ENABLE_LINUX_APPIMAGE=1` and either `MC_LINUX_SIDECAR_RELEASE_TAG` or `MC_LINUX_SIDECAR_STAGING_RUN_ID` provides the sidecars, plus either `MC_LINUX_ENGINE_RELEASE_TAG` or `MC_LINUX_ENGINE_STAGING_RUN_ID` provides the advanced engines. Its push paths include the AppImage verifier, shared ELF parser, shared FFmpeg version contract helper and shared updater signature verifier, so changes to binary-shape, version or signature validation can be tested before publication. The workflow installs the Linux Tauri dependencies, stages the downloaded sidecars through `npm run prepare:linux-sidecars`, stages advanced engines through `npm run prepare:linux-engine-release-assets`, rejects CI placeholders through `npm run test:linux:conversions`, builds the AppImage with updater signing credentials, normalizes release asset names with `npm run prepare:linux-release-artifacts`, verifies the release-named AppImage with `npm run verify:linux-appimage`, and uploads the `linux-release-artifacts` workflow artifact.

`npm run prepare:linux-release-artifacts` rejects AppImage sources that are not x86_64 ELF files and unversioned source names. Normalize from the Tauri-generated versioned AppImage, not from the stable alias. The shared ELF parser is covered by `npm run test:elf` and by the Linux sidecar, AppImage and release-asset tests.

The Linux public installer is the x64 AppImage. Release assets must use:

- `Multi-Converter_X.Y.Z_linux-x64.AppImage`
- `Multi-Converter_linux-x64.AppImage`
- `Multi-Converter_X.Y.Z_linux-x64.AppImage.sig`
- `Multi-Converter_X.Y.Z_linux-x64.AppImage.sha256`

`latest.json` must include the Tauri updater platform key `linux-x86_64` pointing to the versioned AppImage and using the exact signature content from `Multi-Converter_X.Y.Z_linux-x64.AppImage.sig`.

The manual GitHub `macOS DMG Build` workflow builds and verifies the universal DMG on Apple Silicon (`macos-latest`), uploads the release-named artifact, then downloads and verifies that same artifact on Intel (`macos-15-intel`). Use it for test-repository validation before copying the verified artifact into a public release.

When the GitHub `Release` workflow is started with `include_macos=true`, it runs `macOS DMG verification` jobs on Apple Silicon (`macos-latest`) and Intel (`macos-15-intel`) before the Windows release job republishes the final asset set. If either macOS DMG verification fails, the release publication job does not run.

The GitHub `Release` workflow first runs a lightweight `release-preflight` job before allocating release runners. For every release, it validates the GitHub release body through `scripts/validate-release-notes.mjs`, the same shared rules used by release asset validation. For Windows-only runs, it rejects accidental macOS DMG and Linux AppImage mentions. For Linux runs, it requires the versioned Linux x64 AppImage name, enabled Linux automatic-update wording and positive Linux AppImage verification wording before publication.

For macOS or Linux publication of the current baseline, the same preflight also runs:

```bash
npm run status:v1.0.6 -- --require-ready
```

That gate requires the recorded V1.0.6 two-architecture macOS matrix and DMG verification, clean-Mac receipt, Linux AppImage build/conversion/verification/smoke evidence and final security evidence. The README macOS and Linux rows must point to the final public installers. The README must also include a `## macOS Installation` section that names the universal DMG, Apple Silicon, Intel, the Apple signing/notarization status, the `Open Anyway` path when the build is not Apple-signed or notarized, and updater behavior. The shared release-note validator checks the corresponding platform wording before publication.

Final V1.0.6 security evidence is structured in `docs/V1_0_6_VALIDATION.md`. A future V1.0.7 status gate must point to V1.0.7 evidence and must include the editor and OCR security scope; previous-version evidence is not sufficient.

The minimum manual DMG smoke test is:

- mount the final downloaded DMG;
- drag the app to Applications;
- confirm the unsigned/not-notarized Gatekeeper warning;
- open through `System Settings > Privacy & Security > Open Anyway`;
- launch a second time;
- verify file selection;
- verify at least one FFmpeg audio/video conversion;
- verify document/PDF/image paths only when the matching macOS engines are included.

## PDFium Wrapper Tests

`npm run test:pdfium-wrapper` runs real PDFium runtime tests and must have a native PDFium library available. The wrapper script auto-detects the bundled Windows `pdfium.dll` when it exists. On other platforms, set `MULTI_CONVERTER_TEST_PDFIUM_LIBRARY` to a native `libpdfium` file before using the runtime test.

Use `npm run test:pdfium-wrapper:compile` only when the goal is compile-only validation. Do not present that compile-only check as proof that PDF rendering works on the platform.

## Release Asset Tests

Use `scripts/test-release-assets.mjs` for fixture-based release asset checks. It covers:

- Windows-only release asset shape;
- combined Windows + macOS universal DMG plus macOS updater asset shape;
- Windows and Darwin updater metadata matching the selected release asset set;
- macOS release-note requirements for Apple signing/notarization status and enabled macOS automatic updates.

Use `scripts/test-bundled-engines-platform.mjs` to verify that bundled engine validation rejects stale resources from the wrong platform, such as Windows-only advanced engines left in a macOS release build folder.

## UI Smoke Checks

After UI changes, run:

```bash
npm run test:ui-layout
npm run build
```

For visual QA in dev preview, use:

```text
http://127.0.0.1:1420/?mockUpdate=1&mockWelcomeSeen=1
```

This shows the update reminder and feedback launcher together without the welcome dialog, so the floating-corner layout can be inspected directly.

For the editor recent-document regression state, create at least five mock drafts, return to the editor home, open the action menu on the second card, then open and cancel the delete confirmation. Do not press the final destructive action unless the document is a disposable test draft.
