# Multi-Converter V1.0.7 Validation

## 2026-11-08 — Native conversion and OCR test coverage

On Windows x64 at `aaf914d4`, the standard Rust suite passed 203 tests and
skipped 15. The separate conversion matrix passed all 11 native groups and
the local HTTP control. The integrated PNG-to-WebP test checked the actual
format, every decoded RGBA pixel and source preservation. The FFmpeg audio
and video cases counted decoded frames in each required track.

The complete OCR corpus passed 40 cases on 20 distinct synthetic input files
with 19 worker requests. All five format cases passed after real Rust image
normalization and OCR of each complete three-line image. Accuracy uses the
documented case and whitespace normalization. Seven clean-language images
supply the 21 clean text-block cases.

Two temporary negative controls exercised the assertions. Substituting the
PNG encoder for the WebP encoder failed the file-format assertion. Changing
2026 to 2099 in the JPEG reference failed the OCR threshold at 98.52%.
Both modifications were reversed before the complete runs. These tests
exercised local source engines. Installed GUI acceptance remains open.

## 2026-11-08 — Windows installed footprint below 750 MB

The Windows x64 candidate combines the application from `2e907a86` with
installer source `f15a30a1`. It stores eligible packaged files of 32 KiB or
more with per-file XPRESS16K. Windows serves the original
bytes on demand. The temporary installer helper needs standard user rights.
The mechanism is documented by [Microsoft](https://learn.microsoft.com/en-us/windows/win32/api/wofapi/nf-wofapi-wofsetfiledatalocation).

| Measurement on the same Windows NTFS volume | Decimal MB |
| --- | ---: |
| Lot 4 reference installation, Windows file allocation | 1,334.08 |
| Selected installation, including uninstaller | 628.80 |
| Selected installation after native use, with measured data | 640.39 |
| Independent cluster-rounded estimate after native use | 648.45 |
| Selected NSIS download | 341.64 |

The installed files occupy **705,282,048 fewer bytes (52.87%)**. Both copies
expose approximately 1.32 GB of logical file contents. The first-use total
includes the separate WebView2 profile, managed temporary files, current app
logs and recovery state. Prior development engine caches and the system's
shared WebView2 runtime are outside that measurement. The test used separate
installation directories on the current Windows account.

The SHA-256 comparison confirmed **10,462 byte-identical payload files**,
including the application, all conversion engines, dictionary and model files.
Two legal notices differed only in checkout line endings. NSIS generated
the uninstaller for each package.
Every FP32 model restored to its official SHA-256. The installed worker passed
all **40 OCR cases**, and all **11 native conversion groups** passed against
the corresponding source engines.

Six conversions passed through the installed Tauri backend, covering WebP,
native/scanned PDF extraction, RTF to PDF, FLAC to WAV and HTML to Markdown.
Five outputs had identical bytes. Rendering the LibreOffice PDF from each
installation produced identical page pixels. The updater signature for NSIS
SHA-256 `672c232ba32d1f93e94edb2df7191aeb41af61b5b393ab71eeb18fae1f23ce5e`
verified with the configured public key. The installer has no Authenticode signature.

In eight alternating pairs, starting the worker and recognizing a French image
took a median of 4.205 s with this candidate and 3.965 s with the reference.
A second profile at `747b83e7` kept the application's, OCR's and libvips'
original file storage and occupied 730.72 MB after use. Its separate ten-pair
series also showed a 254 ms median increase over the reference. These results
cannot isolate a 240 ms cost due to OCR compression. The maintainer accepted
the observed timings and selected the lighter candidate, saving another 90.33 MB.

A focused six-pair comparison of the two profiles measured median worker
startup at **691 vs 683 ms**, first recognition at **3,089 vs 3,031 ms** and
second recognition on the same worker at **2,660 vs 2,803 ms** (compact first).
Both installations returned the same French text in every run. These are
same-host observations with a shared OS cache.

Upgrading the original lot 4 setup directly to the selected candidate produced
the same **628,800,048 bytes** of Windows file allocation as a fresh install.
All 10,464 application payload files in the upgraded and fresh copies matched
by SHA-256. The upgrade receipt lists the previously exercised profile's data
separately from the upgraded program directory.

The [measurement receipt](audits/2026-11-08/windows-installed-footprint.json)
contains the Windows allocation figures, restored hashes, native workload
samples and installation receipts. The [reproduction procedure](TESTING.md#installed-footprint)
uses the installed executable and its local engines. Full release acceptance
and publication remain open.

## 2026-11-08 — Native Windows OCR and 341.52 MB private setup verified

The Windows source mapping now uses the separately locked native CPU profile;
the global original runtime/model identities and other platforms are unchanged.
All five official full-precision ONNX modules and the original dictionary remain
enabled. The 542-file runtime is 24,637,577 bytes, and the encoded model tree
is 11 files / 184,084,883 bytes. Every model is restored only in memory and
checked against its compiled official SHA before inference. No Python runtime,
model-download feature or diagnostic DLL override is used by the shipped worker.

The aligned worker passes all 40 cases at 100% clean/difficult accuracy; the
encoded-model standalone variant repeats this with 104 network samples and
zero observed remote connections. UVDoc's diagnosed 512x512 pre-resize is fixed:
3,420,000 output pixel components match the reference exactly. Linear resize
and cubic perspective crop have independent strict OpenCV pixel comparisons.
The initial Japanese failure was rejected without text corrections or weaker
thresholds. DLL/notices are verified against the pinned official PyPI wheel;
original and Rust dependency notices are retained.

Source `2e907a86` passes the canonical check, 203 Rust tests (15 default
ignores), app/worker Clippy, 11 real conversion groups, negative HTTP control,
direct-profile integrity, worker unit/lifecycle tests and all four Rust audits.
ZIP 8.6 blocked the first candidate; the vendored upstream manifest now pins
the fixed ZIP 9.0.0 without advisory exceptions or OCR source changes.
The exact rebuilt worker SHA begins `95ade536`; its full 40-case corpus is
100% clean/difficult, with 108 network samples and zero remote connections
observed. Maximum sampled working set is 233,357,312 bytes; speed/memory
sampling during a concurrent build is not a controlled comparative benchmark.
PDFium's seven native CLI tests, nine engine-profile tests, source budgets,
staged license hashes and preparation-tool reproduction also pass.
The PE import audit identified a missing host-provided MSVCP140_1.dll and now
passes with the pinned Microsoft DLL included. Real module paths confirm local
loading of all five observed Microsoft/ONNX DLLs, repeated from the accented
integration checkout; seven PE normal/delayed import checks pass. This does not
establish a clean-OS or installed-GUI launch.
See [final gates](audits/2026-11-08/engine-lot4/validation-gates.json) and
[supplemental evidence](audits/2026-11-08/engine-lot4/supplemental-gates.json).

The native release application and frontend build pass. The exact NSIS is
**341,519,995 bytes / 341.52 MB**, **31.59%** below lot 3 and **65.84%** below
the original. It meets the requested **350,000,000-byte ceiling**. All
**10,464 files / 1,317,504,996 logical bytes** are decoded/hash-verified without
extracting the engine tree; all five stored ONNX files restore to their exact
official SHA. Container CRC and cryptographic updater signature checks pass.
Authenticode is `NotSigned`. See [the final receipt](audits/2026-11-08/engine-lot4/windows-candidate.json)
and [payload audit](audits/2026-11-08/engine-lot4/windows-payload.json).
The 326,987,635-byte research archive is fully decoded/hash-checked but contains
the rejected first scalar worker, so it is not a distributable setup. The
interrupted NSIS counter and the DLL-diagnostic partial NSIS are rejected.
The 1.32 GB decompressed logical payload is not an installed physical-size measurement. No GUI installation,
public release, Linux/macOS preparation or user-cache cleanup is performed.
See [the evolving lot 4 ledger](ENGINE_REDUCTION_LOT4.md).

Session closeout: [handoff and outstanding acceptance](SESSION_HANDOFF_2026_11_08.md).
The 341.52 MB setup is compressed. Approximately 1.32 GB describes verified
logical content for a fresh install, not measured allocation on disk. Actual
installed size and upgrade leftovers/cache size remain unmeasured. No installed
acceptance or user-cache cleanup has been performed as part of this size audit.

## 2026-11-07 — Engine reduction lot 3: slim OCR and Office UI resources

Application source `1c066776` keeps all five offline models and original
inference/conversion binaries. The Windows OCR distribution retains 4,990 files
and 612,271,290 bytes; Office retains 9,654 files and 606,614,990 bytes. Source
artifacts, distribution locks and the preceding v2 tree remain separate.

The complete 40-case native OCR corpus passes, with all 40 normalized texts
identical to the reference (clean 100%, difficult 99.76%). Network observation
records 296 samples and zero remote worker connections. Office comparison
passes PDF/DOCX/DOC/ODT/RTF/HTML/TXT with exact text/page/200-DPI raster parity.
An independent XML audit preserves all 3,198 non-UI nodes across 123 transformed
locale registries. The final Office tree hash is unchanged after conversions.

Canonical check, nine engine-profile tests, 202 Rust tests (15 ignored by
default), Clippy with warnings denied, production frontend/native release build,
all 11 conversion groups and the negative HTTP media control pass. Real native
OCR integrity tests pass on both a fresh slim tree and an upgrade overlay with
all 2,256 retired original files present. Only exact original paths/sizes/SHA
are allowed as leftovers; modified or unknown data fail. A default-path worker
probe also passes using the prepared v3 profile with zero archive extraction.

The final NSIS setup is **499,243,548 bytes / 499.24 MB**, **2.69%** below
lot 2 and **50.06%** below the original. All **14,922 files /
1,905,642,479 bytes** are decoded to hash consumers without a disk
extraction. Container CRC and cryptographic updater-signature checks pass;
Authenticode is `NotSigned`. The executable hash comparison reproduces only
Tauri 2.11.2's unique UNK-to-NSS bundle marker patch and hashes every byte.

The 300 MB target is not reached. Stop at this validated profile; no model
quantization, format/font removal or unproven engine replacement is adopted.
The rejected same-version OpenCV headless trial saved only 235,520 raw bytes;
its temporary files were moved to Recycle Bin, with originals preserved.
No installed GUI/updater acceptance, public release or new Mac/Linux package
is claimed. See [the lot report](ENGINE_REDUCTION_LOT3.md) and
[final receipt](audits/2026-11-07/engine-lot3/windows-candidate.json).

## 2026-11-07 — Engine reduction lot 2: direct resources and solid compression

Source gates and native validation pass for `windows-offline-direct-v2`:
200 Rust tests passed (15 heavy/platform tests ignored by default), Clippy with
warnings denied, canonical check, five engine-profile tests, and production
frontend build. A real Rust integrity gate also verifies every OCR runtime/model
file from the direct resource tree without extracting any archive. The OCR
smoke from that location reaches 100% character accuracy on the controlled
French sentence and uses the same five local modules.

Office reference/candidate comparison passes all seven formats at 200 DPI,
including exact text/page/raster parity and a final hash proving the resource
tree did not change. An independent XML audit preserves all non-spell/thesaurus
registry semantics and 43 hyphenation data files. A dedicated hyphenation
negative-control fixture was non-conclusive and is not counted as proof.

One concurrent Rust run exceeded a five-second timing assertion; the isolated
test and full serial suite passed afterwards. Packaging caught generated Python
caches and MAX_PATH; cache creation is disabled and a short packaging-only
junction avoids long paths without removing OCR files. The native NSIS setup is
**513,064,488 bytes** (48.68% below the original, 39.34% below lot 1).
All 17,178 application resource files (2,029,601,083 bytes) are decoded into
SHA-256 consumers and matched to source/pinned hashes without extracting a tree.
The complete container test and updater signature verification pass. Native
Authenticode status is `NotSigned`. The candidate is not installed-GUI accepted.
The separate 512,075,710-byte stream estimate remains historical. See the
[final artifact receipt](audits/2026-11-07/engine-reduction/windows-solid-candidate.json).
The 40-case OCR corpus is not repeated for these byte-identical weights/runtime.
No Windows installed-GUI acceptance, public release or Mac/Linux build is claimed.
See [the execution ledger](ENGINE_REDUCTION_EXECUTION.md).

## 2026-11-07 — Engine reduction lot 1: Windows LibreOffice profile

The deterministic Windows profile preserves all conversion binaries/filters,
document-language data and notices. Its archive is 328,694,744 bytes versus
483,796,141 bytes originally; expanded runtime is 1,142,267,215 bytes. Source
and output have separate locks, and the derived-hash cache preserves older
installed runtimes. OCR resources and all other engines remain unchanged.

Native reference/profile comparison passes PDF, DOCX, DOC, ODT, RTF, HTML and
TXT on a controlled multilingual, three-page fixture: exact text/page/raster
comparison at 200 DPI for paginated outputs. The final profile adds one retained
copyright file and passes a renewed 9,888-file CRC validation and PDF smoke.
The real Rust ZIP reader streams the entire profile to a sink without extraction.
Canonical check, 199 Rust tests (14 ignored), all 11 heavy conversion groups,
media offline control, formatting and Clippy pass. See
[the execution ledger](ENGINE_REDUCTION_EXECUTION.md) and its dated receipts.

The Windows NSIS build passes: 845,749,678 bytes versus 999,648,595 bytes,
a measured 153,898,917-byte / 15.4% reduction. The updater signature is
cryptographically verified; Authenticode remains NotSigned. Final resource
checks confirm the profiled Office archive and unchanged OCR runtime/model
hashes. See the [package receipt](audits/2026-11-07/engine-reduction/windows-candidate.json).
The standard engine preparer reuses the verified archive without extracting
another tree. No installed-application acceptance, public release, new OCR
inference corpus or Mac/Linux package is claimed; the previous setup is preserved.

## 2026-11-07 — Engine/package size audit, no product optimization

Read-only NSIS input inventory measures 1,405,904,795 bytes before installer
compression; the current setup remains 999,648,595 bytes. ZIP central-directory
inspection identifies LibreOffice and OCR pruning candidates without extracting
them. PE/COFF inspection plus streaming compression confirms 62,005,682 bytes
of Pandoc symbol/string tables, but only about 4.80 MB of compressed difference
in a prefix simulation, which is not a valid stripped executable. Historical
Zlib/LZMA results remain scoped to their original 2026-10-30 receipt.

The [audit](ENGINE_SIZE_AUDIT_2026_11.md) documents proposals, source-backed
competitor comparisons, disk duplication and acceptance gates. Raw inventories
and reproduction scripts are under `audits/2026-11-07/`. No engines/models,
installed caches or user files were removed or replaced, no optimized installer
was built, and Linux/macOS preparation remains stopped. Proposed size budgets
are targets, not measured optimized results or release acceptance.

## 2026-11-06 — Refreshed private Windows Svelte installer

At the maintainer's request, a new Windows x64 NSIS installer was built from
source `334bd2a5` (functional title-bar correction `0b003d33`). It includes the
Svelte desktop interface and native caption/text theme synchronization. The
999,648,595-byte installer has SHA-256
`9d65095a042c0d18ae2e446fea2f438a8b46669aecee0aef4d7c45072fa7e1d4`.
See the [candidate receipt](audits/2026-11-06/windows-svelte-installer.json).

Passed: bundled-engine and embedded-manifest validation, production configuration
and version synchronization, OCR contracts, Svelte types (zero errors/warnings),
production frontend build/fixture guard, native optimized build and NSIS
packaging. The updater signature is cryptographically verified against the
configured public key. OCR runtime archive and all 21 model files match their
locked hashes; the generated NSIS script includes real FFmpeg/ffprobe, PDFium,
LibreOffice, Pandoc, libvips and OCR resources. These are build/input checks,
not a new installed conversion or OCR acceptance run.

The existing engines and Cargo cache were reused; the earlier bundle and native
executable were moved into `bundle-adf7b8ce-before-20261106` beside the new bundle,
without duplicating them. The preexisting Cargo manifest remains byte-identical.
Linux/macOS staging remains stopped. The maintainer will install this private
development candidate manually; no installer was executed, public release was
published or updater metadata generated. Installed/final release gates remain open.

## 2026-11-05 — Native title-bar theme correction

Source `0b003d33` adds a bounded, main-window-only appearance command. Svelte
forwards the existing design tokens and preference; Windows caption/text colors
follow Light/Dark and System clears the native theme override. The existing
Cargo manifest, lockfile, native decorations and conversion/OCR contracts remain
preserved; one appearance command brings the registered command count to 25.

Windows evidence: Svelte types (zero errors/warnings), 64 frontend tests, 196 Rust
tests (13 heavy cases ignored), formatting, Clippy with warnings denied,
source/IPC/layout/production-config guards and a development executable build.
Real-window checks cover Light → Dark → Light → System, with native title-bar
captures. The original System preference was restored and the corrected
development window remains available for maintainer testing. See the
[receipt and captures](audits/2026-11-05/native-titlebar/validation.json).

No new installer or platform package was built. The earlier NSIS candidate at
`adf7b8ce` remains historical and does not include this correction. Installed
acceptance and the full release gate remain open; Linux/macOS staging was not
resumed.

## 2026-11-01 — Native preparation stopped; temporary storage restored

The maintainer requested stopping the native follow-through and restoring disk
space. Windows application-state backup copies and the newly extracted Linux
payload are removed; the owned 32 GiB Mac RAM volume is detached. Original
profiles, the previous Windows installation, earlier artifacts and the completed
Svelte source migration remain preserved. See the
[rollback receipt](audits/2026-11-01/svelte-migration/native-preparation-rollback.json).

No new Windows installer was executed, no product GUI scenario was completed and
no native Mac application build was started in this follow-through. Installed
acceptance and new migrated DMG/AppImage packages remain open. The native ledger
version check was corrected to use the current package version; its 66-scenario
self-test passes, which is protocol evidence only.

## 2026-11-01 — Svelte source migration and renewed available gates

Functional source **`adf7b8ce`**, locally integrated on **`codex/test`**, completes
the desktop source port. Clean install, typechecking and the full canonical
check also pass from the primary checkout after integration. React remains
only in the unchanged marketing site. The full execution and criteria matrix
are in [the migration ledger](MIGRATION_SVELTE_EXECUTION.md) and
[parity matrix](MIGRATION_SVELTE_PARITE.md).

New proof: clean installs and type/build checks on three OS; Windows canonical
check, 60 units, 194 Rust tests plus all 11 heavy conversion groups; real Windows
OCR runtime/corpus (40 cases, clean 100%, difficult 99.76%, no observed remote
connections); Linux compile/unit/contract gate (201 Rust tests), explicitly with
compile-only sidecars. Compiled-product preview passes 18 Chromium scenarios.
Real WebKitGTK and system macOS WKWebView each pass 8 scenarios/184 assertions.
The Windows NSIS candidate is built from the final functional checkpoint; its
updater signature is cryptographically verified. Authenticode remains NotSigned.

The final production guard also removes updater QA parameters and fixture notes
at compile time. Windows, Linux and macOS production builds pass the expanded
bundle marker check; preview fixtures remain confined to development/preview.

These proofs do not complete native GUI/installed acceptance. No new AppImage
or DMG is claimed, no release metadata is fabricated, and no publication occurs.
**Overall V1.0.7 release gate remains blocked.** Historical entries below keep
their original scope and do not become current package evidence.

## 2026-11-01 — Svelte migration execution in progress

The maintainer requested full execution, staged delivery and all available
validation. Source work is isolated on `codex/migrate-svelte`; the original
`codex/test` checkout and pre-existing changes remain preserved. The desktop
uses Svelte/Tailwind/Bits UI; the marketing site remains unchanged.

Current new evidence: 60 frontend units, 194 Rust tests, all 11 heavy conversion
matrix groups, media offline controls, Rust formatting/Clippy, canonical checks
and production mock/React exclusion pass on Windows. Packaged OCR runtime and
40-case corpus pass (clean 100%, difficult 99.76%, 745 network samples with no
remote connection). Frontend clean-install/type/unit/build checks pass on Linux
and the explicitly authorized Apple Silicon Mac. UI preview/native-host/package
claims remain distinct. See [execution and open gates](MIGRATION_SVELTE_EXECUTION.md).

No Svelte installed-package acceptance or release is claimed. The overall
V1.0.7 release gate remains blocked; old packages do not validate this frontend.

## 2026-11-01 — Desktop Svelte architecture approved; mandate prepared

After the isolated Ubuntu/Tailwind tests, the maintainer approved the proposed
Rust/Tauri/Svelte architecture and requested an execution mandate. The
[mandate](MANDAT_MIGRATION_SVELTE.md) covers desktop only, design-system
consistency improvements, parity, staged implementation, native acceptance and
rollback. The supplied ZIP matches 34 repository design-system files; its
extra instructions file is not imported as agent policy. The
[source-review receipt](audits/2026-11-01/svelte-mandate-design-review.json)
distinguishes verified inconsistencies from integration risks.

This checkpoint changes documentation only. No Svelte migration, application
test, native build or new package acceptance was performed. React remains the
current implementation at documented functional source `853aa081`, and the
overall V1.0.7 release gate remains blocked. Existing Tailwind evidence retains
its exact runtime limits.

Documentation checks passed: 87 local links across seven documents, 15 referenced
existing npm scripts, all eight lots and twelve acceptance rows, archive/source
identity and the seven source-review findings. `git diff --check` passed.

## 2026-11-01 — Isolated Tailwind 4 Ubuntu feasibility

The maintainer requested Ubuntu compatibility tests before deciding the desktop
Svelte migration; the site is outside scope. Tailwind CSS/CLI 4.3.3 passes 26
criteria across 40 scenarios: 1,040 assertions, zero failures. Real WebKitGTK
2.50.4 in an isolated Ubuntu 22.04 userspace and 2.52.6 on Ubuntu 24.04 pass both
themes, four widths and normal/reduced motion. An actual minimal Tauri 2.12.5
window on Ubuntu 24.04 also passes. See [the report and proof limits](TAILWIND_4_UBUNTU_VALIDATION.md).

This is isolated CSS feasibility evidence. It does not migrate the application,
validate Svelte/shadcn components or an AppImage, establish old-WebKit support,
or renew conversion/OCR and installed acceptance. The current application-source
checkpoint remains `853aa081`; **overall release gate remains blocked**.

## 2026-11-01 — Current UI source and evidence boundaries

Application-source checkpoint `853aa081` is locally integrated on `codex/test`;
maintenance branch: `codex/app-design-system`. The UI adoption at `547b4bd4`
adds both approved themes, persisted system/light/dark preferences, custom
quality/media selectors, micro-interactions and scroll-dependent glass
navigation. The follow-up replaces dark labels on colored primary buttons with
warm-white text on deeper action shades, preserving the original brand anchors.

The [adoption receipt](audits/2026-11-01/application-design-system.json) records
56 frontend unit tests, 408 keys across six languages, 12 compiled-preview
browser passes and 10 declared project skips, plus layout, source-structure,
configuration and build checks. The
[button correction receipt](audits/2026-11-01/button-label-contrast.json)
separately records the later
production frontend build, UI-layout check, six rendered catalogue states,
minimum measured contrast 4.753:1 and 34 matching Open Design package files.
The full browser suite and unit tests were not rerun for that CSS-only correction.

Windows Tauri development launch was observed after the button correction:
the `Multi-Converter` window opened and responded. This proves development
startup, not acceptance of both themes in the native WebView, actual file/OCR
operations or an installed package. Manual user acceptance is not recorded.
Automated accessibility checks do not establish complete WCAG conformance.

The preserved NSIS/AppImage/DMG candidates are still tied to `8b510138` and
predate these UI changes. The full canonical/platform and installed-package
gates have not been renewed on `853aa081`. **Overall release gate remains
blocked; no publication or remote push is implied.** See the
[current UI handoff](APP_DESIGN_SYSTEM_ADOPTION.md) for the test path.

## 2026-10-30 — Native/candidate continuation (historical source)

Application source `8b510138` is locally integrated on `codex/test`; current
workspace maintenance uses `codex/standalone-relocation`. The application includes private intermediates, SVG isolation,
local batch reports, opt-in 24-hour recovery, authenticated OCR manifests and
stable row ordering. Native contracts remain 24 commands / two events. The final
canonical check passes, with 194 Windows Rust units and 201 each on Linux/Mac
(13 opt-in exclusions). Every host passes all 11 real conversion groups, media
HTTP controls and denied-warning Clippy. Actual prepared OCR archives/models pass
the strengthened Rust hash verifier on all three hosts.

Native Mac OCR passes all 40 cases at 100% clean/difficult means under denied
networking. Native Linux's direct 40-case corpus and extracted-archive four-case
probe also pass. Matching local Windows NSIS, Linux AppImage and Mac DMG candidates
are built and preserved on Windows with hashes and project notices checked. Mac
deep ad-hoc signature/image checks pass; its minimum is macOS 15 on arm64. These
are local candidates, not Apple Developer/notarized or signed-updater releases.
Source tests pass 56 frontend units and 404 translated keys. Existing browser proof
for the unchanged frontend is 12 passed / 10 declared exclusions, plus manual
report/recovery checks at 375/1440 px. See
[source/artifact receipts and remaining work](V1_0_7_AUDIT_FOLLOW_THROUGH.md).
**Overall release gate remains blocked**; no new current installer acceptance is
claimed. Older sections below remain historical checkpoints.

## 2026-10-30 — Audit Follow-Through

Earlier isolated audit work: `codex/audit-follow-through`, baseline `41459c23`.
See [the continuously updated handoff](V1_0_7_AUDIT_FOLLOW_THROUGH.md).
The new lot adds explicit per-file stream copy, image ICC/frame/depth policy,
native resource reservations and fixes narrow-window layout. Rust 178 units,
11 native conversion groups and denied-warning Clippy passed. The final canonical
check, 50 frontend units and the existing 12-test browser suite passed (10 declared
project exclusions). Four real Mac engine probe groups passed
using the existing V1.0.5 bundle and a temporary libvips copy whose signatures
were corrected using the new helper. This is not current 1.0.7 package/OCR proof.
Later follow-through: Linux CI passed (185 Rust units) and real Linux conversions
passed all 11 groups plus media protocol checks. A Linux OCR runtime was built
and packaged reproducibly with complete license inventory; its corpus is still
being validated. Windows SVG isolation and batch report additions pass 187 Rust
units and Clippy. Report UI was exercised at 375/1440 px on successful/mixed lots.
The current native interface has 20 commands / 2 events. Release remains blocked.

## 2026-10-30 — Approved Audit Implementation In Progress

Source commit `b766134f` is locally integrated on `codex/test`; work branch:
`codex/converter-audit-apple-silicon`, base `24303e48`. The maintainer approved the comprehensive
audit and retired Intel macOS. Windows x64, Apple Silicon macOS and Linux x64
remain the targets. See [current implementation and proof](V1_0_7_APPROVED_IMPLEMENTATION.md).
The dated records below remain historical. **Overall gate: blocked**.

Dependency fixes and ARM packaging contracts are implemented locally. The new
Windows OCR runtime is reproducibly packaged with a complete 71-distribution/
104-license-file inventory. The bounded-detector rebuild passed the full 40-case
packaged corpus: clean 100%, difficult 99.76%, median 54,823 ms, peak 666.7 MiB.
The previous scanned-PDF timeout is fixed without relaxing the 180-second limit;
861 network samples observed zero remote connections. One-shot French smoke
also passed at 100% in 54,155 ms.

171 Rust unit tests, ten native conversion groups and real LibreOffice archive
extraction passed. All eleven ignored native tests were exercised separately.
Full canonical check, types, IPC, 47 frontend unit tests and 12 rendered browser
tests passed (10 declared browser exclusions). Re-export, initial confirmation
focus and no-overlap geometry were checked on the current interface.
Tokio 1.53.3 corrects the Unix I/O-safety warning; final dependency-check reruns
are recorded in the implementation ledger. Cargo informational warnings remain
visible, including inherited Linux glib 0.18.5 unsoundness and maintenance/yank
notices. Zero entries in Cargo's vulnerability category is not a clean warning set.
The site full check passed. New native/installed Windows acceptance and fresh
Mac/Linux host/package evidence remain pending. No release or push occurred.
The local Windows candidate was built from application source `b766134f`;
its 999,341,675-byte installer is NotSigned for Authenticode, and its updater
signature verifies. This is packaging evidence, not installed acceptance.
The Windows 22-step gate now stages its locked PDFium candidate explicitly;
its dry-run output is a skipped-command record, not a remote CI pass.

## 2026-10-29 — Comprehensive Audit After Integration

Current local integration: `codex/test`, `98726742`. The
[comprehensive audit](AUDIT_COMPLET_2026_10_29.md) records current evidence,
priorities and acceptance criteria; it does not implement the proposed fixes.
**Overall release gate remains blocked.**

Fresh checks: application/test typechecks, preview build, source structure,
19 typed native commands / 2 events, production configuration, secret scan,
repository metadata, 47 frontend unit tests, 148 Rust tests (7 intentionally
ignored), and all 6 synthetic conversion-matrix tests passed.
The OCR supply-chain check passed for 71 hashed distributions with complete
license coverage according to the checker. OCR platform-lock reproducibility
still fails for the macOS Intel Paddle build.

Fresh dependency audits: desktop production npm 0; complete desktop npm
4 package findings; site npm 5; Cargo 12 advisory/package occurrences with
9 distinct advisory IDs. Each of the four Python runtime locks reports
66 audit entries across 7 packages; the Intel Paddle build lock reports
42 entries across 3 packages. Counts overlap across platforms and do not
represent independently demonstrated exploits. See the audit for reachability
and static-site qualifications.

Twenty-five Chromium screenshots and local mock journeys expose clipped
format actions, hidden error reasons, and an export notification intercepting
the next action. A real local Pandoc fixture confirmed an implicit HTTP image
request during document conversion. Old editor chunks remain in the local
dist directory but are not referenced by the current interface. These findings
remain open; raw receipts are retained with the report.

No fresh full Windows release gate, installed Tauri/OCR acceptance, macOS
universal validation, Linux host validation, publication or remote push was
performed by this audit. Browser OCR/export/update evidence is simulated.

## 2026-10-29 — Conversion-Only Cleanup

**Current scope:** document and PDF editing cancelled by the maintainer. Keep
conversion and local `PP-OCRv6_medium` OCR. Implementation branch:
`codex/remove-file-editor`, based on the local integration branch `codex/test`.
Development metadata stays `1.0.7`; published baseline remains `1.0.6`.
**Overall gate: blocked**; no release, publication or remote push is implied.

Removed both editor frontends, styles, drafts UI, models, preview fixtures,
Tauri editor/font commands, native editor domains, editor-only Office bridge,
Tiptap/ProseMirror/docx.js/DOMPurify/Lucide dependencies and bundled frontend
notices. The PDFium source wrapper no longer exposes editor modes. Its locked
dependency graph and existing staged engine artifacts remain unchanged pending
a reviewed engine rebuild. Former editor-only reports and checks are historical.

The converter is the only workspace; old saved editor-mode preferences cannot
hide it. Image OCR, clipboard copy and native/scanned/mixed PDF text conversion
retain their existing domains. Old local drafts/assets and source files are
not deleted. Removed source files were moved to the Windows Recycle Bin.
Installed Windows acceptance now has 66 converter/OCR/installer scenarios.

### Checks On This Change

- Application/test typechecks and i18n validation: passed, 356 keys / 6 languages.
- Unit tests: 47 passed.
- Browser preview: 12 passed, 10 intentional project exclusions. Includes the
  saved-editor-preference regression with image OCR, OCR copy/cancel/retry/empty
  results, conversion retry/export, large lists, settings and responsive checks.
- Rendered converter inspected; no editor navigation remains.
- Rust suite: 148 passed, 7 intentionally ignored heavy scenarios.
- Conversion matrix: all 6 opt-in matrix tests passed, including integrated
  image targets, French document output and FFmpeg audio/video targets.
- Native PDFium source-wrapper runtime suite: 7 passed, including native-text
  extraction, page count, image rendering, invalid input and version.
- Rust format check and Clippy with warnings denied: passed.
- Production build, bundled engines and embedded manifest: passed.
- Source/Rust structure, 19 native command contracts, release-note, platform
  provenance/restaging and staged-engine tests: passed.
- Remaining `check` steps run explicitly after its pre-existing stop: passed
  (OCR packaging; native evidence protocol self-tests; platform/release/engine
  packaging; workflows; metadata; production config; secret scan; version sync;
  Tauri launcher; typechecks and engine validation). These are contract tests,
  not real macOS/Linux or installed-package acceptance.
- `npm audit --omit=dev`: zero vulnerabilities. Complete `npm audit` reports
  four existing development findings (2 moderate, 2 high) in Vitest/mocker,
  source-map-js and Vite. No unrelated dependency upgrade was made.

### Existing Blockers And Limits

`npm run check` stops at `test:ocr:platform-locks`: the PaddlePaddle macOS Intel
build dependency lock is no longer reproducible. The identical failure was
reproduced on the untouched `codex/test` source; its committed OCR lock is
unchanged. No lock hashes or assertions were relaxed to hide this failure.

`npm run test:ocr:runtime` cannot run: the existing checkout has only OCR licenses,
without `src-tauri/ocr-resources/runtime/windows-x64.zip` or model resources.
Source OCR contracts and mocked UI checks pass, but no new real inference,
installed-app, packaged OCR, macOS/Linux host or release-readiness claim is made.
The full canonical 18-step Windows release gate and NSIS packaging are not
claimed complete.

Earlier entries below describe historical checkpoints. Editor implementation,
Office fidelity and editor acceptance requirements are superseded by the
2026-10-29 scope decision in `V1_0_7_PLAN.md`.

## 2026-10-04 — Writing aids checkpoint

Development UI now retains selection painting in font/size menus, compacts
native-font lists, displays numeric line spacing (default 1.45), bundles
Lucide vector icons and provides delegated hover/focus explanations. The ¶
button and Ctrl+Shift+8 show nonprinting marks as view-only decorations.
Typed numeric values take precedence over pointer-hovered suggestions;
typographic commits return focus without a delayed input-stealing callback.
Ctrl+Home/End and their Shift selection variants use explicit editor commands.

Evidence: 141 unit tests; 675 translation keys across six languages; app/test
typechecks; editor/layout/source contracts; production/preview frontend builds;
the combined relevant browser matrix (44 passed, 28 intentional skips); and
desktop/narrow rendered inspection. Production dependency audit reported zero
vulnerabilities. See V1_0_7_EDITOR_WORD_REVIEW.md for the researched practical
baseline and its open gaps. This checkpoint does not close native Office,
OCR, provenance, platform packaging or public-release gates.
The final menu/glyph confirmation passed 14 targeted tests with two intentional
skips after the complete matrix above.

## Current Status

- Target version: **V1.0.7**
- Published baseline: **V1.0.6**
- Last documentation review: **2026-10-04**
- Overall gate: **blocked**
- Version metadata: **1.0.7**
- Phase 1 checkpoint: local commit **`9f89a8d2`** on `codex/phase-1-guardrails`, not pushed
- Phase 2 state: isolated worktree on `codex/phase-2-frontend-vellum`, based on the Phase 1 checkpoint, not merged or pushed
- Phase 3 state: isolated worktree on `codex/phase-3-ocr-local`, based on the Phase 2 checkpoint, not merged or pushed
- Phase 4 state: isolated worktree on `codex/phase-4-rust-backend`, based on Phase 3 commit `9ec3b9ca`, not merged or pushed
- Current local integration: `a1be93f4` on `codex/test`; not pushed or published

This is the combined release-validation ledger for V1.0.7. It does not replace the detailed editor or OCR documents:

- [`V1_0_7_EDITOR_VALIDATION.md`](V1_0_7_EDITOR_VALIDATION.md) contains editor evidence;
- [`V1_0_7_OCR.md`](V1_0_7_OCR.md) defines the OCR contract until implementation produces its own test evidence;
- [`V1_0_7_PLAN.md`](V1_0_7_PLAN.md) defines the complete scope and sequencing.

V1.0.6 results prove the existing release baseline only. They do not validate V1.0.7.

## 2026-10-03 Local integration update

Status: **local correction checkpoint passed; release gate remains blocked**.

The current `codex/test` integration restored the locked Windows PDFium 0.4.0
candidate, fixed the bundled-engine preparation helper and made its platform
fixture copy deterministic. The local PDFium wrapper was rebuilt from the
locked source and packaged as the unpublished candidate described below.

Current local evidence:

- `npm run check` passed before the final Rust lock refresh, including 136
  Vitest tests, the PDFium wrapper/editor suites, TypeScript, engine validation,
  OCR lock checks and static packaging contracts;
- `npm audit` and `npm audit --omit=dev` report zero vulnerabilities after
  moving the pinned Tiptap family to 3.31.4, DOMPurify to 3.4.16 and Vitest to
  4.1.11;
- `npm run test:editor`, `npm run typecheck`, `npm run test:unit`,
  `npm run clippy:rust` and `npm run audit:rust` pass after the final lock
  refresh; `rustls` is now 0.23.45, closing RUSTSEC-2026-0285 in the updater
  request path;
- the 18-step Windows gate was rerun through step 8. Steps 1–7 passed (both
  audits, real engine preparation, `npm run check`, preview UI, formatting and
  Clippy). Step 8 initially identified RUSTSEC-2026-0285; that exact issue was
  fixed afterwards, so the entire 18-step gate must be rerun from the start.

This checkpoint does **not** prove a signed installer, an installed Windows
application matrix, a macOS universal DMG, a Linux AppImage or their real host
conversion/editor/OCR behavior. It therefore does not change the overall gate
from **blocked**.

## 2026-07-31 Workspace Consolidation Evidence

The local checkpoint combines the workspace transition with the unfinished
V1.0.7 development tree so its rules, commands, documentation and source stay
coherent. It is not a release candidate and does not close any pending host or
OCR gate.

Verified during consolidation:

- `npm run site:check` passed with 114 generated static pages, 120 checked
  routes, 111 HTML pages and 110 indexable SEO HTML pages;
- `npm --prefix site audit --omit=dev` reported zero known vulnerabilities;
- the repository secret-leak scan and staged diff checks passed;
- the former standalone site bundle was verified as a complete Git history;
- an isolated Playwright profile exercised the marketing home/download pages
  at desktop and 390 × 844 px, including screenshot preview, format search and
  the Windows, macOS and Linux download links;
- the compiled editor preview opened, switched to Editor mode, created a local
  mock document and accepted text at 390 × 844 px.

The editor browser smoke used the existing compiled `dist` preview because the
Vite development server remained in dependency optimization during this pass.
It proves only the rendered mock-browser flow: it does not validate current
Tauri persistence, native file access, Office import/export, sidecars, updater
behavior or OCR.

## 2026-07-31 Refactor Phase 1 Guardrails

Phase 1 is an isolated local guardrail and measurement change on branch
`codex/phase-1-guardrails`, based on commit `3570b89a03a7`. It preserves every
bundled engine and conversion path and intentionally leaves the project
metadata at `1.0.6`.

Implemented evidence:

- Vitest executes ten pagination-planner cases instead of relying on
  source-text inspection for that behavior;
- a dedicated TypeScript project checks the Vitest/Playwright configuration
  and all test files instead of leaving them outside `tsc --noEmit`;
- Playwright exercises converter import/format selection, editor creation and
  editing, and the recent-document delete confirmation in compiled Chromium at
  desktop and 390 x 844 mobile sizes;
- the browser suite passes 6 scenarios, but remains mock-preview evidence only;
- the installed npm dependency audit reports zero known vulnerabilities after
  upgrading Vite/PostCSS and adding the pinned test tools;
- the Rust audit reports zero vulnerabilities without exceptions after the
  `wayland-scanner` update removed the affected older `quick-xml` path; allowed
  warning categories remain documented in `TESTING.md`;
- local-only scripts now separate software, frontend bundle, packaged artifact
  and engine-size measurements, with an opt-in Windows responsive-window and
  process-memory proxy;
- the final 15-step Windows gate passed in 1,148,177 ms, including both npm
  audits, 34 Vitest tests, 6 compiled-preview Chromium scenarios, Rust/Clippy,
  the complete conversion matrix, PDFium and the Tauri/NSIS build;
- after review-only test/tooling hardening, `npm run check` and
  `npm run test:guardrails` passed again with 35 Vitest tests, strict test
  configuration typechecking and the 6 Chromium scenarios;
- the resulting Windows executable is 25,644,032 bytes and the local unsigned
  NSIS installer is 612,348,424 bytes. These are development artifacts, not
  V1.0.7 release assets.

The initial browser run also found a mobile pointer overlap from the floating
feedback control and could not use a newly edited preview document as a stable
recent-document navigation fixture. These are recorded in
`REFACTOR_BASELINE.md`; they were not repaired or misreported as native-runtime
proof in this guardrail phase.

Phase 1 does **not** close the Windows Tauri editor matrix, native drop,
persistent asset, OCR, macOS, Linux, version synchronization or release-asset
gates below. The responsive-window probe also remains a local startup proxy,
not functional validation of the packaged editor or conversion UI.

## 2026-07-31 Refactor Phase 2 Frontend And Vellum Paper

Phase 2 refactors the React application without changing Tauri commands,
conversion formats, persistent schemas or the bundled-engine boundary. It
keeps metadata at `1.0.6` and remains isolated from `codex/test`.

Implemented frontend evidence:

- `src/App.tsx` is now a lightweight coordinator; conversion rules, workflows,
  screens, overlays and editor responsibilities live in focused modules;
- the stable `src/lib/api.ts` import path now delegates to separate contracts,
  Tauri adapter, preview adapter and deterministic fixtures;
- production and compiled-preview builds select distinct API behavior, with a
  contract preventing the packaged build command from opting into preview mode;
- official Vellum 1.0 Paper tokens are vendored locally, with no Carbon
  preference or remote visual dependency. The source and vendored token files
  share SHA-256
  `FA4C4754834756896E610CFB751170654B09BBBD543606149B1866513B8A44BE`;
- the feedback action now stays in the topbar instead of covering the mobile
  conversion action;
- closing an editor document waits for autosave and recent-document refresh;
  either failure keeps the document open and exposes the error;
- dialogs implement Escape handling, focus trapping and focus return, with
  visible keyboard focus and reduced-motion support;
- rich HTML is sanitized through pinned `dompurify` 3.4.16 with bounded links,
  styles, tables and local-image rules documented in [`SECURITY.md`](SECURITY.md);
- every current TypeScript, TSX and CSS file under `src/` remains below the
  500-non-blank-line hard limit.

The Phase 2 preview suite covers a real touch at 390 x 844, the full simulated
conversion lifecycle, autosave and recents, failure recovery, editor stacking,
hostile HTML, settings, feedback, keyboard behavior and responsive widths.
This remains mock-browser evidence and does not prove native persistence or
real conversion behavior.

The final 15-step Windows gate passed on 2026-07-31 in 647,789 ms, after the
last CSS and test corrections. It includes zero-vulnerability npm audits,
application checks, 44 Vitest tests, 8 routed compiled-preview scenarios,
Rust/Clippy, 95 Rust tests, the 6/6 conversion matrix, 5 PDFium wrapper tests,
the production frontend and local Tauri/NSIS packaging. Exact bundle, artifact
and engine measurements live in [`REFACTOR_BASELINE.md`](REFACTOR_BASELINE.md).
The total production bundle misses its Phase 1 raw-size target by 37,548 bytes,
while the 206,028-byte initial chunk and 496,337-byte largest chunk pass their
limits and the 1,988,656,508-byte engine boundary remains unchanged.

Phase 2 does **not** close the real Tauri Office matrix, native file drop,
restart/persistent-asset proof, OCR, real macOS or Linux host validation,
version synchronization or release publication gates.

## 2026-08-01 Phase 3 Local OCR Development Checkpoint

Phase 3 adds the Windows reference implementation without changing version
metadata, removing an engine or publishing any artifact.

Implemented evidence:

- the editor prerequisite passed in the real Tauri development runtime for
  create, edit, autosave, close and reopen; direct Save As wrote the expected
  TXT bytes after the staging-extension repair;
- the local model lock pins PaddlePaddle 3.3.1, PaddleOCR 3.7.0, PaddleX 3.7.0,
  ONNX Runtime 1.26.0 and all five `PP-OCRv6_medium` pipeline modules;
- the prepared models and Windows official CPU sidecar have per-file manifests,
  locked aggregate SHA-256 values and Rust pre-use integrity verification;
- one supervised persistent worker handles one job at a time, supports
  cancellation, discards crashed workers and cleans temporary job directories;
- PNG, JPEG, WebP, TIFF and BMP are validated and normalized locally; the UI
  offers an explicit accessible image-text dialog and write-only text copy;
- PDFium 0.3 inspects every page, keeps sufficient native text and renders only
  insufficient pages at 300 DPI for OCR;
- native, scanned and mixed PDF paths were exercised through real Tauri, as
  were mixed-PDF editor import and semantic HTML serialization;
- 8 OCR Rust tests and 6 PDFium wrapper tests pass;
- compiled-preview Playwright covers OCR result, empty result, copy,
  cancellation, focus, Escape and four reference widths;
- the standalone packaged-sidecar smoke reached exact normalized recognition
  for the reviewed clean French fixture without a Python installation.
- an 11-case persistent-worker CPU corpus passed with a 99.16 percent clean
  seven-language mean, 100 percent difficult-image mean, empty blank output and
  48,280 ms median; Japanese remained individually visible at 94.12 percent.
- the 660,098,904-byte installed OCR runtime is packaged as a verified
  236,434,900-byte archive, while the existing LibreOffice runtime is packaged
  as its verified 483,796,141-byte release archive and extracted on demand;
- traversal-resistant extraction tests cover both archive boundaries, and the
  real LibreOffice archive restored its required launcher in 69.22 seconds on
  the final rerun;
- the local unsigned Windows build passed with all engines retained, producing
  a 26,662,400-byte executable and a 999,871,215-byte NSIS installer.

Measured real Tauri development-runtime timings include 194.8 seconds for the
first image job with cold resource verification, 24.2 seconds for the next
persistent-worker job, 248 ms for a native PDF, 27.8 seconds for a scanned PDF,
8.6 seconds for a mixed PDF and 9.1 seconds for mixed-PDF editor import.

The final 15-step Windows gate passed on 2026-08-01 in **557,915 ms**. It
included both npm audits with zero known vulnerabilities, deterministic engine
preparation, `npm run check`, 44 Vitest tests, 11 Playwright scenarios with 11
routed duplicates skipped, Rust formatting and Clippy, the allowed-warning
Rust audit, 108 passing Rust tests with 7 intentionally separated heavy tests,
the 6/6 real conversion matrix, 6 PDFium tests, the production build and the
local unsigned Tauri/NSIS build.

The resulting NSIS file was also parsed and extracted without error into an
isolated temporary directory: 281 files and 1,407,773,464 expanded bytes. The
exact extracted `multi-converter.exe` was subsequently launched and its process
path verified. A native clipboard file paste, PNG OCR, explicit copy,
cancellation, worker termination and retry all passed against the packaged
resources. This is extracted-package behavior evidence; the installed NSIS
lifecycle and complete PDF/image/editor matrix remain pending.

The locally achievable Windows Phase 3 checkpoint is closed, not the release
gate. The initial synthetic corpus must still be expanded across native input
paths and real-world fixtures. The runtime decision now explicitly retains the
official CPU sidecar and disables unproven native/accelerated options. An exact
71-distribution/105-license-file inventory and Windows peak-memory baseline are
recorded, but the missing embedded `bce-python-sdk` license, installed Windows
NSIS matrix and real macOS/Linux builds remain open. Full details and hashes are in
[`V1_0_7_OCR.md`](V1_0_7_OCR.md).

## 2026-08-01 Phase 4 Rust Backend Refactor Checkpoint

Phase 4 restructures the existing Rust backend without changing public Tauri
commands, serialized contracts, conversion formats, engine selection order,
OCR policy, persistent schemas, dependencies or version metadata.

Implemented evidence:

- `lib.rs` is a 68-non-blank-line composition root registering the same 35
  commands; Tauri adapters now delegate to focused command and domain modules;
- conversion orchestration, media, image, document, text and atomic-output
  responsibilities are separated while preserving fallbacks, parameters,
  warnings, filenames and error prefixes;
- ODT package validation, XML reading, style interpretation, Tiptap conversion,
  HTML rendering and writing have characterization fixtures for rich content,
  tables, lists, images, page breaks, accents and hostile archives;
- engine catalogue, selection, executable resolution, health checks,
  distribution manifests, checksum verification and atomic installation are
  split without changing an engine or packaged resource;
- shared one-shot process support bounds stdout and stderr to 128 KiB per
  stream, applies timeouts and terminates process trees; the persistent OCR
  supervisor remains independent;
- the Rust structure guardrail scanned 91 handwritten files, found none above
  500 non-blank lines and measured a 426-line maximum; the softer 300-line
  objective remains visible for 17 files;
- 138 Rust tests passed with 7 intentionally separated heavy tests. Three warm
  normal-suite runs had a 15.09-second median test body, below the recorded
  Phase 3 31.77-second body;
- targeted deterministic preparation reproduced the expected fingerprints for
  both sidecars, four advanced-engine archives, 24 OCR resources and the
  LibreOffice archive;
- the Windows executable is 26,734,080 bytes, +0.27 percent from Phase 3 and
  below the 5 percent ceiling; the NSIS build is 999,834,801 bytes.

The canonical Windows gate passed **18/18 steps** in **1,632,700 ms**. It
included both npm audits, `npm run check`, compiled-preview Playwright, Rust
formatting, Clippy and audit, 138 Rust tests, the 6/6 real conversion matrix,
the real LibreOffice archive extraction, PDFium, the OCR runtime and corpus,
the production frontend and the local unsigned Tauri/NSIS build.

A Phase 4 release executable built before the final adversarial hardening was
launched with its process path verified. Native clipboard-file import, PNG OCR,
explicit copy, PNG to WebP conversion, export, editor autosave,
recent-document refresh and reopening the saved draft passed. The final
rebuilt executable passed the complete automated gate but was not re-exercised
interactively. Native UI ODT import could not be driven reliably through the
system file picker, so no native ODT round-trip claim is made. The installed
NSIS lifecycle, manual native conversion cancellation and macOS/Linux remain
open. This checkpoint does not make V1.0.7 release-ready.

## 2026-08-01 Phase 5 Windows Native Validation Checkpoint

Phase 5 adds a reproducible installed-Windows evidence protocol without
changing a Tauri command, public contract, format, engine, dependency or
version. `npm run test:windows:native -- --self-test` passes and locks 101
required scenarios covering NSIS lifecycle, converter engine families, the
Office editor matrix and OCR.

Current evidence:

- the canonical Windows gate passed 18/18 steps in 939,660 ms;
- 44 Vitest tests, 22 routed Playwright executions, 138 Rust tests, the 6/6
  conversion matrix, LibreOffice archive extraction, PDFium, OCR runtime and
  the current 11-case corpus passed;
- the prepared engine tree matches Phase 4 exactly: 19,571 files,
  1,785,947,516 bytes and aggregate SHA-256
  `5f5c6d5d11fcda17b741924d273108ded718b7581ebb0d19db04136bff0cd290`;
- the exact local NSIS candidate is 999,834,888 bytes with SHA-256
  `D070371BEB318F27EFC25E443A1F22662B3611B286D2C5D6168C6D9660FF91A1`;
- its 26,734,080-byte executable is unchanged from Phase 4 and the extracted
  281-file package rendered immediately on first and second launch without
  `Ctrl+R`;
- the native Windows file picker opened, but file selection stopped safely
  after concurrent human input was detected.

The current evidence run is deliberately labelled `current` and `extracted`,
not `dedicated`, `installed` or `offline`. Its final validator reports 104 open
issues: three environment requirements plus the 101 scenarios that are not all
passed. First launch, second launch and native picker contain partial evidence
but remain blocked; 98 scenarios remain pending. The installed NSIS lifecycle,
complete converter/editor/OCR matrices and offline clean-profile proof remain
open, so Phase 5 is a local checkpoint rather than a closed Windows gate.

### Maintainer Assumption For Phase Sequencing

The maintainer has explicitly asked not to disconnect the active machine,
because doing so would interrupt the working session, and has chosen to assume
that the remaining native scenarios function correctly. Phase 5 is therefore
accepted as complete **for phase sequencing only**. The 101 scenarios are not
reclassified as passed, and the evidence manifest remains incomplete so that
an assumption cannot be mistaken for an executed test.

This assumption allows work to proceed to Phase 6. It does not constitute
installed-NSIS, offline, Office round-trip or OCR validation, and it cannot be
used as release-readiness evidence unless those checks are later executed.

## 2026-08-02 Phase 6 Quality, Security And Optimization Checkpoint

Phase 6 adds a global 500-nonblank-line source guardrail, deterministic bundle
budgets, an exact Python OCR lock, a 71-package/106-license inventory, a
40-case corpus manifest and a numbered security review. It does not change the
version, public IPC contracts, conversion formats or selected OCR runtime.

Current automated evidence:

- `npm run check` passes, including 44 Vitest tests, 6 PDFium wrapper tests,
  101 Windows native-protocol self-test scenarios and all static platform
  packaging contracts;
- `npm run test:guardrails` passes with 11 compiled-preview Playwright tests
  and 11 expected duplicate-project skips;
- npm production/full audits, the exact Python lock audit and Cargo Audit pass
  under the documented Rust advisory policy;
- the production frontend is exactly 1,095,149 raw bytes, its initial
  application chunk is 211,600 bytes and its largest chunk is 496,337 bytes;
- 245 handwritten source files were checked, none exceeds 500 nonblank lines;
- the official OCR runtime stays selected because the targeted candidate saved
  only 9.17% installed and 6.28% compressed, below the required 10%;
- OCR process samples were taken with the machine network active and observed
  no established remote connection. This is not continuous packet capture.
- `npm run test:windows:ci` passes all 18 steps in 1,521,300 ms. The resulting
  executable remains exactly 26,734,080 bytes; the local unsigned NSIS is
  999,835,255 bytes with SHA-256
  `9CB355FC932347E7CF62444A3FF1A393D93AC56699C36A2C77052159A8ED5DD0`.

The technical security review is recorded in
[`V1_0_7_SECURITY_REVIEW.md`](V1_0_7_SECURITY_REVIEW.md). No exploitable
critical, high or medium issue was demonstrated. Three missing CSP directives
were added. One low release-engineering issue remains open: the historical
PDFium archive predates the hybrid OCR `--inspect-text` command, although the
current source-built wrapper passes its six tests. Consequently an exact
packaged PDF OCR claim remains blocked until a reviewed archive is staged.

The standalone final 40-case corpus run passed in 829.6 seconds with 772
network samples and zero observed remote connections. The retained report from
the following successful Windows gate records clean mean 100%, difficult mean
99.76%, median measured recognition 43,878 ms, peak worker working set
750,030,848 bytes and 40 results. Native, scanned and mixed PDFs passed at
100%; the source-built PDFium wrapper was used, so this is not evidence for the
stale packaged wrapper. The Rust PNG/JPEG/WebP/TIFF/BMP normalization and
original-hash checks passed.

## 2026-08-02 Phase 7 Windows PDFium Packaging Closure

Phase 7 replaces the obsolete Windows x64 PDFium package without changing the
PDF hybrid algorithm, OCR contracts, formats or application version. The
provenance lock fixes PDFium `149.0.7825.0`, tag `chromium/7825`, the official
archive and DLL hashes, wrapper `0.3.0`, Cargo lock, Rust `1.96.0`, compiled
wrapper fingerprint and deterministic engine ZIP fingerprint.

Evidence obtained:

- the 3,720,244-byte official archive and 7,178,240-byte DLL match their
  independent locked SHA-256 values;
- the official wrapper build is locked to the declared GitHub Actions
  `windows-2025` environment because MSVC system-library inputs differ across
  Windows SDK revisions; two builds on that environment must remain
  byte-identical at 969,216 bytes;
- two engine ZIPs from that locked wrapper are byte-identical at 3,961,574
  bytes;
- the clean three-asset engine set and bundled tree pass exact version, x64 PE,
  archive path, checksum, `--check`, native `--inspect-text` and scanned-page
  `--render`/PNG-decode checks;
- all seven native wrapper tests pass;
- the first Phase 7 OCR corpus run passes 40/40 with 100% clean mean, 99.76%
  difficult mean and 100% on native, scanned and mixed PDFs; 822 process
  samples observe no remote OCR-worker connection while the network is active;
- `npm run check`, both npm audits and the project-authorized Rust audit pass.

Staging run `30765906058` passed on commit `f14a4bad`, including two
byte-identical packages, exact asset validation, seven wrapper tests and
Clippy. Public prerelease `engines-v0.1.1-alpha.0` targets that commit and
contains exactly the ZIP, `.sha256` and one-engine manifest. A cache-empty
download validated SHA-256
`819104b0fd72c49a81282c0e35552c57a0c98995ef830fc580778e75ef213d6d`.

The complete Windows gate passed all 18 steps, including 139 Rust tests, the
6/6 conversion matrix, PDFium, OCR runtime/corpus and Tauri/NSIS build. The
exact unsigned NSIS is 998,186,835 bytes with SHA-256
`febaf4fad2cc0bdd570beeff0c83cca706526f75c3dbed987e1a7b8b5028ef28`.
Two isolated installed cycles passed with wrapper SHA-256
`1d1474c2eff303112f00065d43818c2a4c005acc71c4ae32e3bdc0b37d9cb0d4`
and DLL SHA-256
`01be7a757183793f15eb35de9d9da424fc07d24b5560e8c3822f52812b2ad89a`.

The installed corpus passed 40/40 with 100% clean mean, 99.76% difficult
mean, 100% native/scanned/mixed PDF accuracy, 33,794 ms median and
749,379,584-byte peak worker working set. Across 615 samples no remote worker
connection was observed while the network remained active. The three PDF
originals retained their exact hashes, both uninstalls removed the isolated
application root and the installed executable remained exactly 26,734,080
bytes, a 0% increase from Phase 6.

Phase 7 is closed for Windows PDFium packaging and installed hybrid OCR. The
101 Phase 5 manual scenarios were not replayed and remain unvalidated by
explicit maintainer decision; this closure must not be presented as their
release-grade proof.

## 2026-08-02 Phase 8 macOS/Linux Packaging Implementation

The Phase 8 checkpoint introduces locked native resource preparation and moves
the development metadata to `1.0.7` without changing public commands,
conversion formats or OCR V1 contracts. PDFium 149.0.7825.0 and wrapper 0.3.0 are fixed for universal macOS
and Linux x64. Official PaddlePaddle 3.3.1 CPU runtimes are separated into
Apple Silicon, Intel and Linux artifacts; Intel is built from the exact
official source commit and is a blocking path.

Local evidence obtained on Windows:

- `npm run check` passed, including 44 Vitest tests, OCR/PDFium contracts,
  platform packaging contracts, static native harness checks and release asset
  guards;
- Rust formatting, Clippy and 142 unit tests passed with 7 ignored host tests;
- both npm audits report zero vulnerabilities;
- the locked Python runtime audit reports zero known vulnerabilities;
- the Rust audit passed under the existing allowed-warning policy; it reports
  transitive unmaintained/unsound warnings but no unallowed vulnerability;
- source limits pass at 282 tooling/frontend files (maximum 500 nonblank lines)
  and 95 Rust files (maximum 481).

### 2026-08-04 user-validation correction lot

The Windows test build exposed concrete usability and runtime defects before
release integration. The current tree now contains the corresponding focused
corrections:

- the onboarding preview no longer renders its decorative centre stripe, and
  converter files use structured cards that keep complete names, type, size,
  status and the OCR action readable;
- the OCR dialog reports resource preparation, verification, recognition and
  normalization as distinct phases. Recognition and other non-quantifiable
  phases use an indeterminate track instead of presenting a misleading fixed
  percentage;
- OCR cancellation now reaches archive extraction, manifest hashing, model
  verification, PDF page preparation and the supervised worker. The dialog
  immediately leaves the blocking running state, ignores late results from the
  cancelled job and offers a focused retry action;
- the editor adds exact-viewport focus mode, labelled local SVG controls,
  horizontal toolbar navigation, free point sizes, text color, removable
  highlight color, resizable tables, movable/resizable/layered local images and
  long-press recent-document multi-selection;
- new documents default to Markdown export. Export is blocked until a real
  title is supplied, then shows an in-app Vellum progress dialog. Overwrite
  confirmation no longer uses the WebView's native `window.confirm` prompt;
- DOCX, RTF and PDF generation writes one rich ODT intermediate, normalizes it
  through the strict local LibreOffice ODT path, then converts that normalized
  ODT with LibreOffice to the requested target. The same-format normalization
  remains an intentional compatibility step.

Evidence actually obtained for this correction lot includes the passing
`npm run check` gate, passing Rust tests, targeted compiled-preview E2E and
visual measurements, and a packaged Windows OCR fixture that matched its
expected text exactly (100%) in 24,672 ms. The full 40-case corpus passed with
100% clean mean, 99.76% difficult mean, 13,330 ms median recognition, 714.8 MiB
peak worker memory and zero remote connections in 251 process samples. A
corrected Windows probe using bundled LibreOffice
26.2.3.2 completed rich ODT normalization in 10.593 s, normalized ODT-to-PDF
in 11.102 s (62,348 bytes) and normalized ODT-to-DOCX in 11.713 s (8,943
bytes). PDFium and Office-archive inspection confirmed two landscape pages,
usable text, the table proportions and merges, exact embedded image, header,
footer, pagination fields, page break, margins and the tested text styling.
LibreOffice also reopened the DOCX and rendered two pages with the same text
and no observable visual loss.
The preview measurements cover the exact focus viewport, 44 px mobile toolbar
navigation and image/table targets, and absence of unintentional horizontal
page overflow. They remain Chromium preview evidence, not native Tauri proof.
The probe proves those engine paths plus structural inspection and DOCX
reopening. The full packaged-app export interaction is still pending.

The exact local Windows correction candidate was then built as an unsigned
998,639,971-byte NSIS installer with SHA-256
`18f291363def793474932222e8f8abd8e89f62d6e819b938016038158649d8c0`.
It installed successfully into an isolated temporary location: 276 files,
1,403,221,388 expanded bytes. The patched installed executable is 27,282,944
bytes, SHA-256
`5709c28ce717892f445a73d1c1a05584222c993946e85886c089a7f9b3168d34`,
which is 2.05% above the 26,734,080-byte Phase 6 reference and therefore below
the 5% ceiling. Its exact process reached a responsive top-level window before
being closed. Installed PDFium reported wrapper 0.3.0, passed `--check`,
inspected native text and rendered the scanned fixture at 300 DPI to a decoded
2483 x 3512 PNG. The installed OCR and LibreOffice archives match their prepared
SHA-256 values. This proves installation, startup and installed resource shape;
it does not replace the maintainer's complete interactive editor/OCR review.
The historical pre-audit frontend contained 1,578,312 raw bytes and 739,728
bytes when each file was gzipped independently. Its largest JavaScript chunk
was 496,337 bytes and 405,128 raw bytes came from four embedded WOFF2 files.
Those fonts and their distribution pipeline were removed by the post-audit
system-font migration, so that candidate and its bundle measurements are
obsolete. The final checkpoint requires a fresh measurement.

This does not yet prove a native runtime, DMG or AppImage. The following remain
pending until the exact checkpoint is pushed to `codex/test`: three OCR staging
jobs, two platform engine packages, Apple Silicon/Intel conversion and OCR
matrices, universal DMG build/mount/launch, Linux AppImage build/extract/launch,
package size measurements and the 40-case corpus on all three architectures.
The network will remain active; connection sampling cannot be described as an
offline or continuous-capture test. The 101 Phase 5 scenarios remain an
assumption and are not reclassified as evidence.

## Gate Summary

| Gate | Status | Blocking work |
| --- | --- | --- |
| Tiptap editor implementation | Implemented in development tree | Preserve current contracts while completing real host tests |
| Phase 2 frontend and Vellum Paper | Windows automated checkpoint passed | Raw-total bundle target missed; keep the measured result and complete native/manual gates |
| Phase 4 Rust backend refactor | Windows checkpoint passed | Preserve compatibility and complete the remaining installed/platform matrices |
| Phase 5 Windows native validation | Accepted for sequencing by explicit maintainer assumption; native ledger remains incomplete | Execute the 101 installed scenarios later if release-grade native proof is required |
| Editor automated checks | Passed for unit and compiled-preview scope, including the 2026-08-04 correction lot | Keep preview proof separate from real Tauri behavior |
| Editor HTML sanitization | Implemented with preview and static coverage | Complete real Tauri asset persistence and packaged-runtime checks |
| Windows Tauri Office matrix | Partial; corrected LibreOffice probe completed ODT normalization plus DOCX/PDF generation, while packaged-app reopening and fidelity remain pending | Complete ODT/DOCX/RTF import, edit, export and reopen scenarios, including structural and visual fidelity |
| Native editor file drop | Pending manual proof | Validate in the real Tauri application |
| Editor restart and asset persistence | Pending manual proof | Confirm `mc-asset://` images after a clean restart |
| OCR Windows reference implementation | Phase 7 PDFium package checkpoint closed; current packaged fixture exact at 100% and current 40-case corpus passed at 100% clean / 99.76% difficult | Preserve cancellation/progress regression coverage and obtain maintainer license approval |
| OCR Windows NSIS build | Passed with exact candidate identity | Preserve the verified compressed-resource preparation path |
| OCR Windows packaged PDFium path | Two installed cycles and 40-case corpus passed | Keep this focused proof separate from the unexecuted Phase 5 matrix |
| macOS V1.0.7 matrix | Blocked | Real universal editor/OCR package and host validation |
| Linux V1.0.7 matrix | Blocked | Real x64 editor/OCR AppImage and host validation |
| V1.0.7 development metadata | Synchronized | Keep npm, Cargo, Tauri and lockfiles aligned; this is not a release-readiness claim |
| Final release notes and assets | Blocked | Derive only from verified V1.0.7 behavior |

## Editor Evidence

The development tree contains the local Tiptap editor, bounded ODT import path, rich ODT export path and validated local asset protocol. The current automated and UI evidence is recorded in:

- [`V1_0_7_EDITOR_VALIDATION.md`](V1_0_7_EDITOR_VALIDATION.md);
- [`V1_0_7_EDITOR_UI_QA.md`](V1_0_7_EDITOR_UI_QA.md).

The Windows gate remains open until the complete real Tauri matrix is marked passed with fixtures, screenshots, engine versions and output SHA-256 values.

## OCR Evidence

Status: **Windows packaged PDFium/OCR checkpoint closed; broader release gate open**.

The exact versions, five model origins and hashes, installed sizes, automated
commands, Tauri-development results and current proof limits are recorded in
[`V1_0_7_OCR.md`](V1_0_7_OCR.md). Before this section can pass, add:

- parity measurements only for a future candidate that first passes the size
  gate; the targeted Phase 6 candidate was rejected and official CPU retained;
- maintainer legal approval of the complete 71-distribution inventory;
- Windows packaged-NSIS tests for every advertised PDF text target, image
  format, editor path, cancellation, limits, cleanup and original integrity;
- a continuous active-network capture; sampled packaged-process inspection
  found zero TCP connections but is not a full trace;
- real macOS universal and Linux x64 host/package matrices.

## Platform Release Evidence

### Windows x64

Status: **blocked by the editor manual matrix and OCR packaged-app matrix**.

Required final evidence:

- full commands from `RELEASE_CHECKLIST_WINDOWS.md`;
- editor and OCR packaged-app matrices;
- NSIS smoke test;
- exact final release asset validation.

### Universal macOS

Status: **blocked by V1.0.7 implementation and host packaging**.

Required final evidence:

- Apple Silicon and Intel editor/OCR host matrices;
- universal DMG build and two-architecture verification;
- clean-Mac installation and offline OCR smoke test;
- exact final DMG and updater hashes.

### Linux x64

Status: **blocked by V1.0.7 implementation and host packaging**.

Required final evidence:

- Linux editor/OCR conversion matrix with real engines;
- verified final AppImage;
- offline OCR and clipboard smoke test;
- exact final AppImage and updater hashes.

## Security And Privacy Evidence

The Phase 2 frontend security boundary is implemented and documented in
[`SECURITY.md`](SECURITY.md). DOMPurify 3.4.12 is pinned in the npm lockfile and
recorded in `NOTICE`; compiled-preview fixtures exercise hostile imports and
pastes, while static contracts preserve the sanitizer entry points and strict
script CSP. These checks do not replace real Tauri asset persistence,
filesystem or packaged-runtime validation.

The final V1.0.7 security review must cover:

- bounded ODT XML and ZIP handling;
- editor draft and `mc-asset://` isolation;
- OCR source limits, raster limits, timeouts and cancellation;
- model/runtime archive traversal and checksum enforcement;
- temporary PDF page and normalized-image cleanup;
- atomic output and preservation of originals;
- absence of source content and recognized text in telemetry or logs;
- absence of cloud OCR and runtime model downloads;
- dependency and license review for the exact packaged OCR stack.

Record the final reviewer, date, scope, commands and result here when the implementation is complete.

## Post-audit V1.0.7 correction checkpoint

Status: **Windows PDF editor correction validated locally; cross-platform and
release gates remain open**.

The branch based on `80a0c3838e48e470d99e6a6e27f44c245509bc84`
supersedes every Phase 8 application candidate described above. Its scalable
converter, hierarchical folder export, system-font toolbar, direct docx.js
writer and separate PDFium structural editor materially change the application.
Historical NSIS, DMG, AppImage, updater hashes and package measurements remain
evidence for their original checkpoints only.

Development checks include `npm run check`, 133 frontend unit tests and the
Playwright guardrails at 31 passed and 27 skipped. The complete wrapper split
passed 46 tests (`17 + 14 + 1 + 4 + 1 + 7 + 2`) with the real Windows DLL.
The detailed architecture and unresolved package/native gates are recorded in
[`V1_0_7_POST_AUDIT.md`](V1_0_7_POST_AUDIT.md).

The current Windows PDFium 0.4.0 wrapper, including the required `contentKind`
inspection field, is 3,982,336 bytes at SHA-256
`7856798b0deaae4c48b90ce985148a69aa00a0cbf5924337c18f4eee9e4002bd`.
Its 5,139,663-byte deterministic ZIP has SHA-256
`41452be58440ce6652ec5aacf240188cfd60ffefd856a1b67b69537296f86072`.
The installed `pdfium.dll` has SHA-256
`01be7a757183793f15eb35de9d9da424fc07d24b5560e8c3822f52812b2ad89a`.
The current local unsigned NSIS is 999,950,451 bytes at SHA-256
`bc0f9169d11ff56eb74fe212f7f829d9a3299b0750c4c48ddb1c628bc79e5705`.
Its isolated installed application is 27,969,536 bytes at SHA-256
`60e35267561355421a53710847b4210d734bd710e08eee82e82f15a9d7398494`.
This is test-package evidence only; the installer is not Authenticode-signed.

Two complete `npm run test:windows:pdfium-native` cycles passed. The installed
wrapper changed the fixture text to exactly `Native editor smoke`, reopened it
with exact equality, preserved the source hash and rejected a stale source
hash. This native regression closes the previously missed failure in which an
embedded subset font silently serialized different glyphs.

The writer now tries the existing font and verifies the exact reopened text.
It falls back to Helvetica only for explicitly WinAnsi-safe text; unsupported
Unicode is rejected with `PDF_EDITOR_TEXT_UNREPRESENTABLE` without publishing
an output. The Tauri boundary checks exact wrapper version `0.4.0` on every
request. Save As stages the result, re-hashes the source immediately before
commit, validates the reopened file and publishes atomically.

The corrected archive and NSIS remain local and unpublished. The installed
smoke is not a manual user-interface acceptance test. macOS universal and
Linux x64 remain `pending-native-rebuild` with no asserted package hashes.

On 2026-08-06, the direct in-page text workflow was exercised through the real
Windows Tauri WebView with Playwright over a private CDP port, without desktop
screen control. `Plan ECHO.pdf` opened as a 21-page digital PDF. A click on its
first native text object opened the positioned editor; `Ctrl+Enter` committed
the replacement, Save As created a distinct copy, and native reopening found
the exact changed text. The source remained at SHA-256
`80ee1aa9f29e5965844f83b954c51a714fab4c45809af8bb33506845f55719e1`;
the copy was
`d9c4d76abc54b94787c496e0d8854298024b766100fa9623ac58b7c7766b4d5a`.
The focused PDF Playwright suite passed 10 tests and all 136 unit tests passed.

The run used the current source-built wrapper. A separate inspection found that
the then-prepared PDFium resource announced `0.4.0` but omitted `contentKind`
from `--inspect-objects`. The packaging health check now exercises that command
and rejects this stale schema. The corrected deterministic archive was built
twice with identical bytes, restaged locally and passed bundled-engine
validation. Direct inspection of `Plan ECHO.pdf` returned `contentKind: digital`,
21 pages and 73 first-page objects while preserving the source SHA-256. The
rebuilt NSIS then passed two isolated install/reinstall cycles with this exact
wrapper and DLL.

Automated regressions cover bounded active-content inspection without executing
or exposing payload bodies, as well as explicit creation of a separate unsigned
editable copy that removes signature/DocMDP structures and leaves the original
untouched. They do not prove active-content preservation after a native
edit/save/reopen cycle or signature behavior across the complete corpus.

No Word/LibreOffice visual corpus, user-driven PDF editor acceptance, native
macOS or Linux PDFium 0.4.0 package, universal DMG or Linux AppImage has yet
been accepted for this post-audit SHA. V1.0.7 remains blocked from publication.

### 2026-08-06 document and PDF editor visual polish

The two editing surfaces now use one Vellum Paper workspace treatment. The
document title, save and export controls are grouped by intent; the editing
page remains visually dominant. The PDF toolbar exposes its inspector through
an accessible toggle. The inspector remains a contextual card on desktop and
starts closed as an overlay drawer below 900 px. Dense desktop controls keep a
40 px target while touch layouts retain 44 px targets.

Current-source validation passed `npm run build:frontend:preview`,
`npm run test:editor`, `npm run test:ui-layout`, the source-structure guard and
the combined document/PDF editor browser matrix: 18 passed and 14 intentionally
desktop-only scenarios skipped on mobile. The PDF coverage now includes
opening, hiding and restoring the inspector while retaining the active session.
Fresh screenshots were generated at 375, 768, 1024 and 1440 px from the rebuilt
preview and inspected locally. These are browser-interface proofs only; they do
not replace native Tauri file-system, PDFium or package evidence.

## 2026-10-04 — Document editor ergonomics checkpoint

The development editor now has a compact grouped multirow ribbon, stable active
SVG states, 10–500% document zoom with a centered 100% marker, scoped editing
shortcuts/help and full screen wording/F11. Images use contextual dimensions,
proportions, placement/layers, reset/delete and direct floating movement.
Autosave retains undo assets until successful document closure. The page-break
command continues typing in a following paragraph instead of replacing the
selected break.

Current evidence for this UI lot:

- TypeScript application/test checks and i18n passed (653 keys, six languages).
- All 139 unit tests passed, including zoom endpoints, midpoint and reachability.
- Editor, layout and source-structure contracts passed.
- Production and explicit preview frontend builds passed.
- Combined desktop/editor/PDF Chromium matrix: 37 passed, 27 deliberately
  skipped according to platform routing; no failures.
- The Impeccable detector returned no findings for the targeted UI source.
- Desktop/mobile ribbon and selected-image screenshots were inspected locally.

This is UI/compile evidence. It does not replace native Windows WebView
acceptance, asset persistence after restart, Word/LibreOffice round trips,
OCR/sidecar inference, platform packaging or the existing release gates.
The comparison and proposed advanced capabilities are in
[V1_0_7_EDITOR_WORD_REVIEW.md](V1_0_7_EDITOR_WORD_REVIEW.md).

## Release Closure Requirements

V1.0.7 may be marked ready only when:

1. every gate above is passed with real evidence;
2. `NOTICE`, engine documentation and licenses match the packaged OCR stack;
3. version `1.0.7` is synchronized in npm, Cargo, Tauri and lockfiles;
4. final English release notes describe only verified behavior;
5. the exact release assets pass their platform validators;
6. the release diff and assets contain no local paths, credentials, temporary fixtures or private engine references.
