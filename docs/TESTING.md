# Testing Matrix

This document describes the current desktop release test split by platform. The published baseline is V1.0.6 on Windows x64, universal macOS and Linux x64. V1.0.7 is in development with conversion and local `PP-OCRv6_medium` OCR; see `V1_0_7_PLAN.md` for scope and `V1_0_7_VALIDATION.md` for the combined gate. Use this document to avoid false confidence from checks that ran on only one operating system.

Historical V1.0.5 and V1.0.6 status commands remain documented where release workflows still use their recorded evidence. They are not the current V1.0.7 completion gate.

## Editor Removal (2026-10-29)

Document/PDF editing is cancelled. The frontend suite retains conversion,
large-list, settings, update and OCR interactions, plus a regression for the
legacy saved editor preference. `test:editor` and editor-only suites are removed.
The Windows installed acceptance protocol now requires 66 converter/OCR/installer
scenarios. Old 101-scenario receipts do not prove the new candidate.
The PDFium wrapper retains native-text inspection and page-rendering tests.

## Svelte migration checks

The desktop now uses Svelte 5. `npm run typecheck` invokes svelte-check with
warnings treated as failures; `build` and both frontend build modes use it.
`check` also runs the patched build-merge regression and the canonical design
contract/contrast/source-index checks. Source budgets include `.svelte` files.
The migration UI suite adds Bits UI keyboard/typeahead, six persisted languages,
system/explicit themes, twenty-cycle overlay teardown and both-theme captures.
See `MIGRATION_SVELTE_EXECUTION.md` for measured platform evidence and open gates.

## Windows x64

### Installed footprint

The NSIS post-install hook runs an installer-only Rust helper as the installing
user. Its compiled file list comes from the desktop and Windows resource maps.
It requests Windows Overlay Filter XPRESS16K on eligible packaged files of
at least 32 KiB. The application reads its ordinary bytes directly, including
the five full-precision OCR modules. Restored FP32 model hashes are checked.
The helper measures the resulting storage for the Installed Apps estimate.
Locked, read-only, multiply-linked or redirected files may keep their original
allocation. A filesystem without WOF can still run the app.

To compare a baseline and a candidate, install them into separate directories
on the same Windows volume. Exercise the installed Tauri conversion and OCR
commands using an isolated WebView profile and temporary directory. Close the
apps before measuring. Use Python 3.12+ and include first-use data in the audit:

```powershell
python tools/windows-footprint/verify.py --baseline "<old install>" --installed "<new install>" --cache "<new WebView profile>" --cache "<app temp>" --report footprint.json
python tools/windows-footprint/compare.py --baseline "<old install>" --installed "<new install>" --output "<new results folder>" --pairs 8
```

The audit checks the SHA-256 of each application file, reverses model storage
in memory and compares all five ONNX hashes with the official source lock.
It records Windows file allocation and a separate cluster-rounded bound. Both
must stay below 750,000,000 bytes including supplied caches. The paired benchmark
checks rendered and recognized outputs and records individual elapsed times.
Run timing comparisons sequentially on an idle machine. Repeat the size and
integrity audit after a repair or an update of the reference installation.

### Engine-size profiles

`npm run test:engine-profiles` validates selective ZIP copying, bounded metadata
reading, original-file preservation, dictionary policy and unsafe/duplicate path
rejection. The canonical Windows engine validator checks the prepared direct
profile and every retained OCR runtime/model file against the embedded locks.
The original `windows-headless-v1` archive remains a historical reproducible lot;
Windows packaging keeps `windows-conversion-direct-v3` Office data in the v3
tree and uses `windows-native-ocr-v1` under `windows-x64/native-v1/ocr` for OCR.
The previous OCR runtime and model trees remain provenance/recovery inputs.
The [native worker guide](../tools/ocr-runtime/native-worker/README.md) describes
explicit source preparation; its five official FP32 ONNX files are stored with
an invertible byte shuffle and restored/hash-checked in memory before inference.

`npm run prepare:windows-resources` stages immutable resources through hardlinks
or decodes each required ZIP entry once on a fresh host. `--check` is read-only
and required before bundling. `python tools/engine-profiles/audit-dictionary-profile.py`
independently checks dictionary XML semantics, including all retained hyphenation
nodes. This Python audit is not a build dependency.

`python -X utf8 tools/engine-profiles/audit-ui-profile.py` separately proves
that the frozen v3 byte-range edits preserve every non-UI XML component and
root attribute. Profile tests reject altered source/output hashes and unsafe
ranges. Both independent audits read source archives without extracting trees.

On Windows, `test:ocr:corpus` prefers the prepared native worker/model pair,
then the preserved v3 pair when the native profile is absent;
`MULTI_CONVERTER_OCR_CORPUS_EXECUTABLE` overrides it explicitly and
`MULTI_CONVERTER_OCR_CORPUS_REPORT` preserves previous reports. All five model
hashes remain pinned. The ignored Rust test
`prepared_direct_ocr_verifies_without_archive_extraction` hashes the complete
direct tree; `MULTI_CONVERTER_OCR_TEST_ROOT` enables an isolated upgrade overlay.
Only the retired runtime/model files listed in the selected compiled profile
may remain, each at its original size/SHA-256. Modified or unknown leftovers and
mixed native/legacy model/runtime markers fail. The original global locks and
the other platforms remain unchanged. `test-lifecycle.py` exercises the real
worker's cancellation/retry, malformed/oversized requests and source/output
protection; run native worker Rust tests and Clippy separately from app gates.
`audit-runtime-imports.py` checks normal/delayed PE imports and rejects MSVC
resolved only from the host. The lifecycle probe also verifies actual loaded
Microsoft/ONNX module paths. `prepare-microsoft-runtime.py` decodes the pinned
signed source package without running its installer; see the worker guide.

`verify:windows-engine-package` hashes every decoded file without extracting
the installed tree. Its executable comparison reproduces only Tauri 2.11.2's
unique `__TAURI_BUNDLE_TYPE_VAR_UNK` to `NSS` marker patch, then checks the
entire resulting SHA-256. Tests reject ambiguous markers and other mutations.
For native OCR it also reconstructs each of the five packaged ONNX models in
memory and checks the full original official SHA-256, without a model cache.
Container CRC and cryptographic updater-signature checks are separate gates.
None of these checks replaces installed GUI or actual updater acceptance.

`npm run test:libreoffice-profile:native` requires Windows x64 and an original
LibreOffice tree matching the pinned source archive. Set
`MULTI_CONVERTER_LO_REFERENCE` when the matching tree is outside source staging.
It uses the prepared direct profile by default and SHA-verifies its complete
file set before and after PDF/DOCX/DOC/ODT/RTF/HTML/TXT text and paginated raster
comparison. The optional historical ZIP path CRC-verifies retained files and
creates a hardlink-only view. Python bytecode writes are disabled. It never
falls back to copying a full engine if hardlinks are unavailable. This is direct
engine parity evidence, not installed-application acceptance.

The ignored Rust test `prepared_libreoffice_profile_streams` reads every entry
using the runtime's ZIP library into a sink, without creating an extracted tree.
See [the execution ledger](ENGINE_REDUCTION_EXECUTION.md) for measured results.

For the 2026-11-01 interface checkpoint, use
[`APP_DESIGN_SYSTEM_ADOPTION.md`](APP_DESIGN_SYSTEM_ADOPTION.md) for manual
system/light/dark, custom-menu, scroll navigation and reduced-motion steps.
Its dated receipts separate adoption tests from the later button-label color
correction. A responsive Tauri development window only proves startup; it does
not replace native visual review or the installed acceptance matrix below.

Windows x64 is one of the current V1.0.6 public platforms and remains the primary local development gate. Use the grouped command when you want the same Windows validation sequence as the GitHub `Build` workflow:

```powershell
npm run test:windows:ci
```

That command intentionally refuses non-Windows hosts and runs:

```powershell
npm audit --omit=dev
npm audit
npm run audit:python
npm run prepare:pdfium-engine
npm run package:pdfium-engine
npm run prepare:bundled-engines -- --asset-dir dist-engines-advanced
npm run check
npm run test:ui:preview
npm run fmt:rust:check
npm run clippy:rust
npm run audit:rust
npm run audit:ocr-runtime
npm run validate:engines
npm run test:rust
npm run test:conversions
npm run test:bundled-engine-archive
npm run test:pdfium-wrapper
npm run clippy:pdfium-wrapper
npm run test:ocr:runtime
npm run test:ocr:corpus
npm run build
npm run tauri:build
```

These 22 steps include production-only, complete npm, Python and OCR supply-chain
audits. `npm run check` contains the unit, source-contract, production-config
and secret-leak checks; the separate Playwright step then exercises the
compiled frontend in Chromium. During a long local run, the wrapper writes
progress to `tmp/windows-ci-gate-status.json`. If a terminal session times out
while `tauri:build` or NSIS is still running, inspect that file and the running
processes before starting another full gate.

The Cargo check/test/lint wrapper omits staging packaged resources into its temporary
target directory. Conversion tests execute the real source-staged binaries;
production Tauri builds still copy the full configured resources. This avoids
duplicating large assets for Rust checks without substituting for installer tests.
`test:conversions` also runs a local HTTP control against FFmpeg/ffprobe: the
unrestricted control must fetch a segment, while the production protocol whitelist
must reject it with zero HTTP requests and unchanged source bytes.

### Installed Windows native evidence

The automated gate does not prove the installed NSIS lifecycle or native UI
interactions. Phase 5 adds a machine-checked evidence ledger for those checks:

```powershell
npm run test:windows:native -- --self-test
npm run test:windows:native -- --init `
  --run-id phase-5-final `
  --installer "<exact-setup.exe>" `
  --installed-executable "<installed-multi-converter.exe>" `
  --profile-isolation dedicated `
  --package-mode installed `
  --network-mode offline
```

Initialization records the exact installer, installed executable, source
commit and engine-resource fingerprints. It creates 66 pending scenarios in
the ignored directory `test-results/phase-5-windows-native/<run-id>/`.

For a scenario that consumes a source file, capture the before hash first:

```powershell
npm run test:windows:native -- --begin converter.ffmpeg-ffprobe --source "<fixture>"
```

After performing the interaction in the installed application, record a
non-sensitive screenshot, output or log and every required native executable:

```powershell
npm run test:windows:native -- --complete converter.ffmpeg-ffprobe `
  --status pass `
  --artifact "output=<converted-file>" `
  --process "<installed-ffmpeg.exe>" `
  --process "<installed-ffprobe.exe>" `
  --note "Offline installed conversion completed"
```

Use `--manifest "<manifest.json>"` for a run other than the newest one. The
final command fails until every scenario passes and every artifact still
matches its recorded SHA-256 value:

```powershell
npm run test:windows:native
```

The validator rejects a non-Windows/non-x64 run, a profile other than
`dedicated`, a package mode other than `installed`, an online run, changed source bytes, missing process identities
and new `multi-converter-*` temporary entries after failure or cancellation.
Evidence stays local and ignored. Do not place document text, private filenames
or recognized OCR content in notes or committed documentation.

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

Vitest covers format selection, conversion workflow state, export hierarchy,
large batches and deterministic conversion fixtures.

The dedicated TypeScript project covers `tests/**/*.ts`,
`playwright.config.ts` and `vitest.config.ts`; the application `tsconfig.json`
continues to cover `src` only.

Use the compiled-preview behavior suite after changing application flows,
responsive layout or OCR dialogs:

```bash
npx playwright install chromium
npm run test:ui:preview
```

Playwright builds the explicit browser-preview bundle, serves `dist` on
`127.0.0.1:4173` and routes scenarios to the relevant Chromium project. The
desktop project covers conversion cancellation, failure/retry/export, settings,
feedback, keyboard focus, large lists and responsive widths. OCR covers copy,
empty results, cancellation/retry and legacy saved-mode startup. The mobile
project performs a real touch on Prepare conversion at 390 x 844. Reports,
traces and failure screenshots are written under `output/playwright/` and stay
local.

Production and preview builds intentionally have different API boundaries:

```bash
npm run build:frontend
npm run build:frontend:preview
```

The first is the normal Tauri production bundle and must exclude browser mock
fixtures. The second opts into the in-memory preview adapter. Static Windows CI
contracts lock the two commands and keep the packaged build out of preview
mode. Inspect the production output again whenever this selection boundary
changes.

The responsive scenario checks 375, 768, 1024 and 1440 CSS-pixel widths. It
also checks a 720 CSS-pixel viewport as the deterministic headless equivalent
of the usable width at 200% zoom on a 1440-pixel display; it is not a native
browser-zoom measurement. To retain the five local Vellum review captures:

```powershell
$env:MC_CAPTURE_VELLUM = "1"
npm run test:ui:preview
```

The preview API is an in-memory browser simulation. These tests do not prove
native Tauri file access, real conversion output,
sidecars, updater behavior, OCR or packaging. Keep Rust, conversion, host and
packaging gates for those responsibilities.

Run both focused guardrail suites with:

```bash
npm run test:guardrails
```

## Rust Backend Guardrails

Run the focused structural and command-contract checks before a slower Rust or
Windows gate:

```bash
npm run test:rust-structure
npm run test:rust-contracts
```

`test:rust-structure` scans handwritten Rust under `src-tauri/src`,
`src-tauri/build.rs` and `tools/`. It rejects any file above 500 non-blank lines
and reports files above the approximately 300-line refactor target without
treating that softer target as a failure. Generated dependencies, prepared
engines, resources and build outputs are outside the scan.

`test:rust-contracts` locks the Tauri composition root, the exact registered
command names and signatures, and the emitted conversion/OCR event sites. Rust
unit tests separately characterize serialized conversion, conversion and OCR contracts,
complete format/engine routing, fallbacks, process behavior and representative
outputs. They also exercise concurrent no-replace conversion publication,
concurrent export-name reservation, process-tree timeouts, bounded folder
walks, and DOCX/EPUB entry-count, expanded-size, compression-ratio, duplicate
and unsafe-name rejection. Both scripts are included in `npm run check` and
`npm run test:guardrails`.

## Local Refactor Measurements

Capture a structured local engineering snapshot without recording user
content or sending measurement telemetry:

```powershell
npm run measure:baseline -- --output test-results/phase-4-baseline/refactor-baseline-after.json --gate-status tmp/phase-4-windows-ci-gate.json
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
proxy, not proof that conversion, OCR or interaction work is ready. Memory
figures cover the launched root process and do not include WebView2 or engine
child processes. The script itself does not read user content or send
telemetry, but it launches Multi-Converter with its normal local profile and
does not isolate the app from configured updater checks. See
`REFACTOR_BASELINE.md` for the fixed phase boundaries and interpretation rules.

## V1.0.7 OCR Gate

The Windows reference implementation and its exact evidence are specified in
`V1_0_7_OCR.md`. Run the repository contract gate with:

```powershell
npm run test:ocr
```

This command is included in `npm run check` and validates the committed lock,
offline worker contract, five-model configuration, resource packaging and
clipboard capability. It does not perform inference. After preparing the
ignored model and runtime artifacts, run the real packaged-sidecar smoke test:

```powershell
npm run test:ocr:runtime
npm run test:ocr:corpus
npm run test:bundled-engine-archive
```

Phase 6 adds deterministic supply-chain, corpus and budget commands:

```powershell
npm run test:ocr:lock
npm run audit:ocr-runtime
npm run audit:python
npm run test:source-structure
npm run measure:phase-6
```

`test:ocr:corpus` validates the committed 40-case manifest and its input,
expected-output and provenance hashes before inference. It observes established
remote TCP connections for the OCR worker while the normal machine network
remains active. It does not disconnect the computer and it is not a packet
capture. A source-built PDFium wrapper may be supplied through
`MULTI_CONVERTER_TEST_PDFIUM_RENDER` and
`MULTI_CONVERTER_TEST_PDFIUM_LIBRARY`, but such a run is not evidence for a
different historical engine archive shipped in an installer.

The corpus command currently covers seven clean languages, rotation, low
contrast, perspective and blank output on one persistent CPU worker. Its
per-language results must remain visible; a passing aggregate must not erase a
weaker fixture. The bundled-engine archive command performs the intentionally
heavy real extraction of the prepared 1.5 GB LibreOffice tree and checks its
launcher; it is separate from the normal unit suite. Rust OCR unit tests are
part of the normal Rust suite. PDFium runtime tests need
`MULTI_CONVERTER_TEST_PDFIUM_LIBRARY` set to the real platform library. Preview
OCR fixtures validate UI behavior only and are never runtime evidence.

Minimum automated coverage:

- native-text, scanned and mixed PDFs;
- PDF page rasterization and page order;
- PNG, JPEG, WebP, TIFF and BMP;
- French accents and reviewed multilingual fixtures;
- TXT, Markdown and HTML serialization;
- explicit image-text clipboard result;
- progress and cancellation;
- cancellation during runtime extraction, manifest walking/hashing, model
  verification, PDF preparation and worker execution, followed by a clean
  retry with no late result from the cancelled job;
- corrupt/password-protected inputs;
- source, pixel, page, time and memory limits;
- temporary-file cleanup and original-file integrity.

Minimum real Tauri coverage on Windows:

1. keep the machine network available and launch the packaged application;
2. observe the application and OCR worker processes for remote connections;
3. convert native, scanned and mixed PDFs to each advertised text target;
4. copy recognized text from each advertised image format;
5. verify scanned PDF conversion output and original-file integrity;
6. cancel a multipage OCR job;
7. restart and repeat without any model or engine download;
8. record output hashes, screenshots, timings, peak memory, warnings and the
   exact limitation of the network observation method.

The current real Tauri development-runtime checks cover a clean French image,
native/scanned/mixed PDFs, cancellation, worker crash and
retry. The 2026-08-04 corrected packaged Windows fixture matched its reviewed
text exactly (100%), and the same checkpoint passed the 40-case corpus at 100%
clean mean and 99.76% difficult mean. The local
unsigned Windows NSIS build passes with compressed OCR and LibreOffice
resources, but the installed behavior matrix is still required before release.
Equivalent real host tests remain required on macOS and Linux before publishing
V1.0.7 packages for those platforms.

## macOS Code Checks

From V1.0.7, macOS supports Apple Silicon only. Windows x64 and Linux x64 remain
supported. Historical V1.0.6 universal evidence and filenames remain unchanged.
The current work/evidence ledger is V1_0_7_APPROVED_IMPLEMENTATION.md.

npm run test:macos-packaging and npm run test:github-workflows are static
contracts runnable on Windows. They never establish native Mac readiness.
The Build workflow checks aarch64-apple-darwin and runs host unit tests on
macos-latest. Rust is pinned to 1.96.0. The regular quality jobs also run for
codex/test pushes without MC_ENABLE_CODEX_TEST_BUILD opt-in. Docs-only pushes
still skip full builds. Build/release checkouts keep lfs: false.

Compile-only sidecar placeholders are allowed in code/unit jobs and forbidden
in native conversion and packaging gates. Run npm run fmt:rust:check, native
check/Clippy, frontend typechecks and static contracts before the host gate.

## macOS Conversion Matrix

The macOS Conversion Matrix workflow runs on Apple Silicon (macos-latest),
requires actual ARM FFmpeg/ffprobe and reviewed macos-aarch64 advanced engines,
rejects placeholders, checks checksums and binary architectures, prepares
bundled engines and runs npm run test:macos:host, PDFium runtime tests and
npm run test:conversions. A missing engine makes this gate fail.

Use reviewed SHA-256 inputs for ARM FFmpeg/ffprobe, LibreOffice and Pandoc;
PDFium comes from the locked native ARM upstream archive and Rust wrapper.
macOS libvips Runtime builds one portable ARM runtime, validates dynamic links
and smoke-tests native execution. No Intel input, lipo synthesis or Rosetta
fallback belongs in the new chain.

npm run prepare:macos-local-engines can prepare and package those inputs. It
restores the embedded manifest unless --keep-generated-manifest is intentional.
Only a real ARM Mac can run npm run test:macos:conversions.

Historical two-architecture macOS Conversion Matrix receipts for V1.0.5/1.0.6
are retained as dated evidence; they do not validate the current ARM packages.
See RELEASE_CHECKLIST_MACOS.md for exact native input and acceptance steps.

## macOS DMG Validation

The committed V1.0.6 evidence is complete in its historical ledger, with
`releaseReady: true` for that published baseline only. A new V1.0.7 conversion
and OCR gate is required; previous receipts do not validate current changes.

Build npm run tauri:build:macos on Apple Silicon with target aarch64-apple-darwin.
The final user installer is Multi-Converter_X.Y.Z_macos-aarch64.dmg, plus the
identical stable alias Multi-Converter_macos-aarch64.dmg. The updater archive
is Multi-Converter_X.Y.Z_macos-aarch64.app.tar.gz with a real .sig, using only
darwin-aarch64 in latest.json. Intel/universal updater entries must be rejected.

Run npm run verify:macos-dmg against the exact final downloaded DMG. Verify app
structure, signature, native arm64 binaries, versions and all bundled resources.
Then run native installed-package conversion/OCR and the clean-Mac Gatekeeper
first-launch/second-launch protocol. Ad-hoc signing and Tauri updater signatures
do not establish Apple Developer ID signing or notarization.

## Linux x64

Linux support is tested separately from Windows and macOS so a green Windows build cannot imply Linux readiness.

Use this gate on GitHub Actions or a Linux x64 host for compile, unit and contract coverage:

```bash
npm run test:linux:ci
```

That gate intentionally uses compile-only Tauri sidecar placeholders and must not be described as real conversion validation. It runs Linux packaging contracts, staged Linux engine release asset tests, workflow contracts, TypeScript/i18n checks, Rust formatting, Linux target `cargo check`, Linux target Clippy, native Rust unit tests and PDFium wrapper compile/lint checks.

On Ubuntu hosts, install the Linux build dependencies first:

```bash
sudo apt-get install -y libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev libdbus-1-dev libssl-dev libxdo-dev librsvg2-dev libfbclient2 build-essential pkg-config patchelf
```

Then run the Linux environment preflight:

Use native Node 24.x/npm 11.x. Both Cargo and rustc must meet the application's
declared Rust minimum; the preflight checks their versions independently.
An old system Cargo beside current rustc/rustfmt/Clippy is not a valid toolchain.

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

The macOS DMG Build workflow builds and verifies the Apple Silicon DMG on macos-latest and uploads the exact release-named artifact. Native user acceptance remains required before public release.

When Release is started with include_macos=true, macOS DMG verification runs on Apple Silicon before publication. A failed native verification blocks the release job.

The GitHub `Release` workflow first runs a lightweight `release-preflight` job before allocating release runners. For every release, it validates the GitHub release body through `scripts/validate-release-notes.mjs`, the same shared rules used by release asset validation. For Windows-only runs, it rejects accidental macOS DMG and Linux AppImage mentions. For Linux runs, it requires the versioned Linux x64 AppImage name, enabled Linux automatic-update wording and positive Linux AppImage verification wording before publication.

For macOS or Linux publication of the current baseline, the same preflight also runs:

```bash
npm run status:v1.0.6 -- --require-ready
```

That gate requires the recorded V1.0.6 two-architecture macOS matrix and DMG verification, clean-Mac receipt, Linux AppImage build/conversion/verification/smoke evidence and final security evidence. The README macOS and Linux rows must point to the final public installers. The README must also include a `## macOS Installation` section that names the universal DMG, Apple Silicon, Intel, the Apple signing/notarization status, the `Open Anyway` path when the build is not Apple-signed or notarized, and updater behavior. The shared release-note validator checks the corresponding platform wording before publication.

Final V1.0.6 security evidence is structured in `docs/V1_0_6_VALIDATION.md`. A future V1.0.7 status gate must point to V1.0.7 evidence and must include the conversion and OCR security scope; previous-version evidence is not sufficient.

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

The current post-audit Windows development evidence is 40/40 wrapper tests with
the real locked DLL, 10/10 focused Tauri PDF tests, 20/20 frontend PDF tests and
eight structural-PDF Playwright scenarios. This includes active-content
inspection, explicit unsigned-copy creation and consecutive Save As regression
coverage. It is not installed NSIS, macOS, Linux or independent corpus evidence.

## Windows PDFium Engine Staging And Native Proof

`tools/pdfium-windows-x64.lock.json` is the sole Windows x64 PDFium provenance
input. Run `npm run prepare:pdfium-engine`, then
`npm run package:pdfium-engine`. Two independent package runs must produce the
same `pdfium-compatible-windows-x64.zip` SHA-256. Validate the three clean
staging assets with:

```powershell
npm run validate:pdfium-engine-release -- --dir "<asset-folder>"
```

Only after the authorized engine prerelease exists and the lock has been moved
from `unpublished` to a reviewed public URL, validate a cache-empty public
download with:

```powershell
npm run validate:pdfium-engine-release -- --download
```

The validator checks exact asset names, manifest metadata, hashes, x64 PE
payloads, archive paths, wrapper `0.4.0`, `--check`, `--inspect-text` on a native
PDF, and `--render` on a scanned page with PNG decoding. While the lock remains
`unpublished`, `--download` is expected to fail closed instead of inventing a
release URL. The `Windows PDFium Engine Staging` workflow performs the same
locked preparation twice on Windows and uploads an Actions artifact; it does
not publish a GitHub release by itself.

For installed-resource evidence, first build the NSIS from the publicly
validated manifest, then run:

```powershell
npm run test:windows:pdfium-native -- --installer "<exact-setup.exe>" --run-id "<evidence-id>"
```

The harness silently installs the same candidate into an isolated directory,
locates PDFium only under the installed resources, runs runtime health and the
40-case OCR corpus, uninstalls, reinstalls and repeats a smoke test. Evidence is
written below ignored `test-results/phase-7-pdfium-native/`. The network stays
active; process connection sampling is an observation, not an offline or packet
capture claim. This focused harness does not replay or validate the 101 manual
Phase 5 scenarios.

## Phase 8 Native Package Gates

Phase 8 introduces two host-only evidence commands:

```bash
npm run test:macos:native -- --package "<Multi-Converter.app>" --run-id "<id>"
npm run test:linux:native -- --package "<AppImage>" --run-id "<id>"
```

Their `--self-test` modes validate only the harness contract and may run on
Windows. Real evidence must come from the package extracted from the DMG or the
exact AppImage on its native runner. `OCR Runtime Staging` builds the official
CPU workers for Windows x64, Apple Silicon and Linux x64. The historical Phase 8 package
used PDFium 149.0.7825.0 with wrapper 0.3.0. The post-audit staging workflow
builds wrapper 0.4.0 with Rust 1.96.0 and the committed Cargo lock, runs the
runtime tests and strict Clippy, and emits package evidence separately from the
engine asset. Its macOS and Linux package measurements remain
`pending-native-rebuild`; null native hashes must not be replaced by Windows
values or estimates. Downstream workflows verify the staging workflow name,
success conclusion and exact head commit before use.

The macOS conversion and DMG workflows require the ARM OCR archive and one
shared model copy. The Linux AppImage workflow requires only Linux x64. They
run the OCR corpus with active-network process observation, package verification
and two launch smokes. Internal Phase 8 artifacts intentionally omit public
stable aliases; Phase 9 creates aliases only in the final clean release folder.
CI evidence can close Phase 8 for sequencing, but it does not replace the
clean-machine Gatekeeper, native picker/drop or final downloaded-package
receipts required for publication.

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

This shows the update reminder and the topbar feedback action together without
the welcome dialog. Feedback must remain in normal navigation flow; only the
update reminder and transient notices use floating presentation.

## Compact Windows installer verification

After the normal `npm run tauri:build`, run
`npm run verify:windows-engine-package -- --installer "<setup.exe>" --report "<receipt.json>"`
on Windows with 7-Zip available. It checks solid LZMA/128 MiB, rejects nested
Office/OCR ZIPs and missing/unexpected engine resources, then hashes every
application resource decoded directly from the exact installer. Office uses
its pinned aggregate; OCR uses the embedded runtime/model locks. The remaining
engines, executable and notices are compared with source bytes. No installed
engine tree is created. This checks payload integrity, not GUI installation,
updater behavior on an installed app or a public release. Updater signatures
and Windows Authenticode status are separate checks.
