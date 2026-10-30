# V1.0.7 audit follow-through — 2026-10-30

## Handoff

The maintainer requested all remaining locally achievable audit work and continuous
documentation updates. The isolated work branch is `codex/audit-follow-through`,
based on `41459c23`. Local integration remains `codex/test`; `main` and remote
branches are untouched. V1.0.7 is unpublished. The earlier Windows installer
is tied to application source `b766134f` and does not contain this new lot.
Application source through `d828ad3f` is now locally integrated on `codex/test`.
The final canonical check passed, as did 191 Windows Rust units (12 opt-in
exclusions), all 11 real conversion groups, HTTP protocol checks and Clippy.
Linux passes 198 units and Clippy. Frontend units pass 56 tests, i18n covers
404 keys, and the existing browser suite passes 12 / 10 declared exclusions.
No push occurred. New Linux/Mac candidate builds target this source snapshot.

## First follow-through lot

- ENG-01/03: per-file video mode **Re-encode / Copy streams** for MKV, MP4, MOV
  and WebM. Copy validates every probed track against a conservative container/
  codec table, maps all streams, metadata and chapters, and uses `-codec copy`.
  Unknown/incompatible tracks fail before running; no track is silently dropped
  and no automatic re-encoding substitutes for copy. HDR transfer tags can stay
  intact through copy; HDR re-encoding remains refused. Encoded quality profiles
  are hidden while copy is selected. Changing format resets the copy choice.
  The existing batch action applies the format; copy remains an individual choice.
- ENG-09: integrated RGB/gray ICC profiles are preserved in JPEG, PNG, WebP and
  TIFF. Unsupported/malformed/CMYK profiles fail explicitly rather than receiving
  a false color-management claim. A real generated sRGB fixture tests exact
  profile-byte round trips. Direct bounded TIFF tag access compensates for the
  generic reader returning no ICC in the real regression. PNG/TIFF retain 16-bit
  samples; depth/profile loss in other targets becomes a result warning.
  EXIF orientation is applied; other EXIF fields are not copied by the integrated
  path, with a warning. This is not full ICC color-space transformation or DPI/
  XMP parity across every engine. libvips has its own metadata behavior.
- Image-frame policy: animated PNG/WebP, multipage TIFF and animated GIF cannot
  silently become a single static image. Static GIF still uses the existing
  route; animated GIF-to-video remains available. Broader HEIF/frame extraction
  and explicit page selection remain open.
- ENG-11/PERF-03: shared native admission pool reserves at most **2 GiB** across
  image, document, media and OCR classes. Images use dimensions × 32 bytes plus
  16 MiB when the integrated decoder knows their dimensions; libvips reserves
  512 MiB. Documents reserve 512 MiB; media 256 MiB; the retained OCR worker
  reserves 768 MiB for its entire lifetime. At most two image/media operations,
  one document and one OCR worker are admitted per class. A single reservation
  cannot consume the worker's retained capacity. Cancellation interrupts waits
  and RAII returns capacity. These are conservative admission estimates, **not
  measured RSS, a dynamic free-RAM detector or OS-enforced process limits**.
  Internal FFmpeg/libvips threads are capped at eight; media accounts for two
  admitted media slots. Source files are never removed.
- Narrow-window UX: compact fixed-height rail rows no longer overlap when files
  are selected. The rail shrinks to its content for small batches; format controls
  flow naturally and the action footer remains reachable. Copy settings are
  isolated per file and reset stale results. Preview MOV/WAV families and
  sample document/image/audio sizes now reflect their actual fixture types.

## Native Mac evidence and correction

Remote Desktop Commander reached an Apple Silicon Mac running macOS 26.6.2.
It had about 4 GiB free and Node 22; no project toolchain, model or OCR runtime
was installed. All task files remain in an owned `/private/tmp/multi-converter-audit.*`
directory, and useful receipts are stored here. No installed app was modified.

The existing V1.0.5 bundle supplied real engine fixtures:

- FFmpeg/ffprobe 8.1.1: four-track copy retained both languages and subtitles with
  identical packet-payload SHA-256 sequences and unchanged source bytes.
- Local network control: one HTTP request in the permissive control; zero with
  the production file/pipe whitelist in both FFmpeg and ffprobe.
- Existing libvips failed with signal 9 because its code signature was invalid.
  The source portable-runtime builder now signs after install-name rewriting
  and verifies each signature before smoke/archive; preparation rejects invalid
  incoming signatures. The exact helper signed and verified 104 files in a
  73,722,599-byte temporary copy. That libvips 8.18.3 copy passed EXIF orientation
  and white JPEG matte fixtures.
- Existing Pandoc 3.10 and LibreOffice produced a French text/table ODT and a
  46,154-byte PDF with an isolated temporary profile.

Receipt: [macos-engine-probe.json](audits/2026-10-30/macos-engine-probe.json).
These are existing-engine/native-helper proofs, **not current V1.0.7 app, OCR,
DMG, Gatekeeper or installed-UI acceptance**.

A separate four-second synthetic 1080p30 comparison measured x264 veryfast CRF23
at 193 ms / 2,835,286 bytes / SSIM 0.979790, and hardware-only VideoToolbox at
627 ms / 3,995,992 bytes / SSIM 0.981210. It is one warm host fixture with different
rate-control policies, not universal speed/quality parity. Automatic Mac GPU
selection is not enabled from this result. Source bytes stayed unchanged.
Receipt: [macos-video-quality.json](audits/2026-10-30/macos-video-quality.json).

## Current checks

- Rust: 178 unit tests passed; 12 opt-in tests excluded from that count.
- Native conversions: 11 groups passed, including all copied packet payloads,
  languages/subtitles and the preserved chapter. MP4 represents chapters as an
  additional generated data stream; the primary-stream fixture verifies it.
- Clippy with denied warnings passed. Rust/source structure stays within 500
  nonblank lines. Contracts remain 19 native commands / two events.
- Final canonical `npm run check` passed; frontend units passed 50 tests.
  The full existing browser suite passed 12 tests with 10 declared project exclusions.
- Manual Chromium confirms independent per-file modes, hiding re-encoding quality
  during copy, no horizontal overflow and accessible start action at 375, 768,
  1024 and 1440 pixels. Final screenshots were refreshed after the last CSS change:
  [375 px](audits/2026-10-30/media-copy-375.png) and
  [1440 px](audits/2026-10-30/media-copy-1440.png).
- All three Rust lock audits passed without advisory exceptions; existing
  informational maintenance/yanked/GTK warnings remain visible.

## Linux preparation in progress

Ubuntu 24.04 x64 is available through WSL, with native Rust/rustfmt/Clippy 1.96.0.
It initially lacked native Node and Tauri development libraries; Windows npm
on the WSL PATH is not used. Required build libraries were installed through
Ubuntu package repositories. Node 24.22.2 was unpacked into the owned Linux
temporary directory from the official archive with SHA-256
`48cc0e21e048790e54c0cf5749c2725005313d652651c40b7a21feb9697aaf75`.
A separate native Linux checkout is prepared next; this is not a Linux gate pass.

The native checkout and npm install passed; the environment preflight initially
passed too, but the CI gate exposed a mismatched system Cargo 1.75 alongside
rustc/rustfmt/Clippy 1.96. The native Rustup Cargo 1.96 already exists and is now
selected with the same native toolchain PATH. The source preflight now validates
Node 24/npm 11 and both Cargo/rustc against the application's declared Rust
minimum, so an old Cargo can no longer receive a false-positive environment pass.
Two focused regressions and the complete 52-test frontend unit suite passed,
as did test types, Linux packaging and workflow contracts.

WSL purges its temporary filesystem when it stops. An owned keepalive process
now maintains the test instance while work proceeds. The native checkout uses
read-only Git object alternates to avoid copying 12 GiB of repository history;
source files, index, npm dependencies and build outputs reside on Linux.
The first Linux CI attempt stopped at release-asset tests before application
compilation; it is recorded as failed, not as a native application gate pass.
With coherent Cargo/rustc, application `cargo check` passed on Linux. The next
gate stop was an unused mutable test vector specific to Linux. Platform entries
now live in a cfg-qualified immutable array, preserving all unsafe-path cases.
The same review found Windows drive-absolute strings could otherwise parse as
relative paths on Unix; both slash forms are now explicitly rejected, while
ordinary Unix colons and reserved-looking basenames remain supported.

The next native Linux run reached Rust unit execution: 180 passed and two failed.
The failures exposed temporary-directory mode 0755 instead of the required 0700,
and a Windows-drive path accepted by the OCR manifest validator on Unix.
The correction introduces one private temporary-directory builder across
conversion, clipboard, Office/PDF/OCR intermediates and engine staging, plus
shared portable resource-path checks for OCR/motor manifests and archives.
The native Linux CI gate now passes in full: environment/toolchain, application
check, denied-warning Clippy, 185 Rust units (12 opt-in exclusions), PDFium wrapper
compile and wrapper Clippy. It uses declared CI sidecar placeholders and proves
source/build behavior, not real conversions or an installed Linux package.
The real prepared Windows LibreOffice archive extraction also passed (104 s).
Its historical ZIP uses backslash entry names; archive validation normalizes both
separator forms before rejecting escapes, drive roots and duplicate destinations.
OCR/resource manifest paths remain strictly portable forward-slash names.
`SECURITY.md` now reflects conversion/OCR scope and private intermediates.

The published Linux V1.0.6 AppImage (541,088,248 bytes, SHA-256
`aa743940ed29e7426877f82b54e951681697906a5c1750dca8aee5b973093fce`)
and its signature were downloaded and verified against GitHub asset digests
and the configured updater public key before extraction. These baseline engines
are test/build inputs; they do not certify a newly built 1.0.7 AppImage.

## SVG resource correction

A new synthetic regression failed before the fix: converting a SVG referencing
an absolute raster path outside its directory did not reject the resource.
The usvg default resolver permits local file reads; it does not make HTTP requests.
The integrated renderer now preflights bounded UTF-8 XML (16 MiB, 100,000 nodes,
DTD disabled), resolves sibling raster resources within the canonical source
directory, and rejects remote, missing and nested SVG image resources explicitly.
PNG/JPEG/GIF/WebP resources are checked for dimensions and aggregate encoded-byte
(64 MiB) / decoded-pixel (32 Mi pixels) budgets before rendering. Encoded data
URIs and percent-encoded sibling names retain their pixels in the regression.
SVGZ under a `.svg` name is refused before the unbounded upstream decompressor.
Windows now passes 184 Rust units (12 opt-in exclusions) and all-target Clippy
with denied warnings; Linux SVG-specific execution is still pending.

## Real Linux engines and OCR preparation

The full Linux conversion gate passed with all four real advanced engines and
FFmpeg/ffprobe 8.1.1: 11 native conversion groups plus the HTTP control/blocked
protocol fixture. LibreOffice/Pandoc/libvips originate in the signature-verified
public V1.0.6 AppImage. PDFium was rebuilt from the locked Chromium 7825 library
and wrapper 0.4.0 source with Rust 1.96. The validator had retained a hardcoded
0.3.0 expectation on Unix; it now reads the required wrapper version from the
same provenance lock. Candidate ZIPs and their manifest are local, unpublished
test inputs using `example.invalid`; they are not public release assets.

The official Linux OCR reference runtime built with pinned uv 0.11.21,
Python 3.12.10 and hash-locked wheels. Two package creations were byte-identical:
5,750 runtime files / 1,482,506,739 bytes; aggregate SHA-256
`8b53953e8bc8ffa7c32fbe5b450dae3df15d98daf2aab2f833efde16f7ad6d47`;
archive SHA-256 `7693f56b05aec6ba4633872d479eb847566922ffc9432b7366eed6d68c321710`.
Its inventory covers 71 distributions / 103 license files, with no missing license
files or unresolved metadata. Platform selection and inventory are temporary
Linux build outputs; they have not replaced the Windows release selection.

The first direct-runtime corpus run used a Linux user/network namespace; its
control confirmed outbound network unavailable (errno 101). All seven clean
language groups scored 100%; the run then exposed incorrect non-Windows FFmpeg
sidecar names in the test runner at scanned-PDF cropping. It is recorded as a
failed corpus run. After correcting target-qualified FFmpeg/PDFium sidecar names,
the direct runtime passed all 40 cases: clean 100%, difficult 99.76%, median
7,729 ms, sampled main-process peak 1,039.7 MiB; 137 socket samples found no
connections in the isolated namespace. These timings apply to this WSL host and
thread settings, not a universal Windows/Linux speed comparison.
Receipt: [direct corpus](audits/2026-10-30/linux-ocr-corpus-direct.json).

The extracted archive then passed four cases (French, native/scanned/mixed PDF)
with the original build directory temporarily moved out of its expected location,
library search restricted to the extracted worker, and the same network isolation.
All four scored 100%; 49 socket samples observed no connections. The original
build directory was restored. This is packaged-worker evidence, not installed-app
acceptance. [Archive probe](audits/2026-10-30/linux-ocr-corpus-packaged.json),
[selection](audits/2026-10-30/linux-ocr-runtime-selection.json),
[license inventory](audits/2026-10-30/linux-ocr-runtime-licenses.json).

Linux OCR admission now reserves 1,152 MiB in response to the measured RSS;
Windows keeps its measured 768 MiB reservation. The 2 GiB pool remains unchanged.
Maximum non-OCR reservations leave room for the retained platform worker, and
the OCR reservation uses its own maximum, avoiding a permanent capacity wait.
This remains admission accounting, not an OS RSS cap. Native Linux tests and
denied-warning Clippy passed on the SVG/report/resource changes; exact totals
are recorded in the latest validation entry.

## Explicit batch report

The output screen offers an explicit local JSON report export for completed lots,
including lots with errors. Its privacy caption states that filenames, settings
and output fingerprints are included; full paths and file contents are excluded.
The native command validates every successful output against the current managed
batch, streams SHA-256 and byte counts, and exports through the existing
no-overwrite transaction. Schema/profile-schema/app versions and UTC epoch seconds
are recorded. Raw errors, OCR text and source paths are never report fields.
Copy mode has no recompression profile. Failed/canceled/not-run entries have no
output fingerprint. The report does not mark converted files as exported.

A cancellation received during initial temporary-folder creation is also retained:
the cancellation flag is initialized before the first batch await, rather than
being reset after that await.

Windows validation: 187 Rust units passed (12 opt-in exclusions), all-target
Clippy with denied warnings passed, frontend types and 53 units passed for the
report lot, and i18n covers 395 keys in six languages. Three native report tests
cover real known hashes, foreign-batch refusal, failed lots and repeat exports
without overwrites. Manual Chromium verified successful/mixed lots at 375 and
1440 px, no horizontal overflow, a clickable report action and conversion outputs
still unexported after report export. Screenshots:
[375 px](audits/2026-10-30/batch-report-375.png),
[mixed desktop lot](audits/2026-10-30/batch-report-1440.png).
Contracts now expose 20 commands and two events. The screenshots use preview data;
real filesystem behavior is covered by native tests, not by the preview receipt.

## Opt-in batch recovery

Settings now exposes recovery of the last launched full batch, disabled by default.
Only source paths, chosen formats/modes, quality, import origins and size/mtime
fingerprints are stored. No input body, OCR text, output path, result or raw error
is a checkpoint field. Storage is atomic, bounded to 2 MiB / 2,000 files, and
Unix permissions are explicitly private (directory 0700, state 0600).
Validity is 24 hours; expiry removes paths at the next load/startup. Default-off
usage creates no state directory. Disabling clears the plan under the same
native lock as saving, preventing a late queued save from restoring private paths.

The empty file screen offers **Reload originals / Forget batch**. Reload checks
existence/size/mtime again, re-describes files against current engine availability,
restores folder origins and settings, and opens format review with fresh file IDs
and no cached results. Unavailable targets require a new choice. Existing queue
entries are merged without overwriting them if an import finishes concurrently.
Outputs are recomputed; the close guard still protects unexported output files.
Reset/forget clears the plan while retaining the opt-in preference.

Windows native tests cover default-off behavior, disable/late-save privacy,
changed/moved sources, expiry cleanup, folder-origin preservation and traversal
rejection. Linux passes 198 Rust units (12 opt-in exclusions) and all-target
Clippy, including private state-file permissions. The existing Chromium suite
passes 12 tests / 10 declared exclusions. Manual browser checks cover consent,
restart simulation, mode/profile restoration, forgetting and disabling, at
375/1440 px. These browser checks use preview storage and do not establish an
installed native restart. Contracts now expose 24 commands / two events.
Screenshots: [banner](audits/2026-10-30/recovery-banner-375.png),
[setting](audits/2026-10-30/recovery-settings-375.png).

## Native package construction in progress

Linux is building an unsigned local AppImage from `d828ad3f`, with the verified
real engines and reproducible OCR archive. The local-only configuration uses
unpublished engine metadata and disables updater artifacts; it does not relax
public release gates. A missing Tauri executable in the direct command PATH was
corrected in the temporary build invocation; the product wrapper was unchanged.

The available Apple Silicon Mac has 128 GiB RAM (96% free at the check) but only
about 4 GiB free disk. A fresh owned 32 GiB virtual RAM device was verified before
formatting and mounted at `/private/tmp/multi-converter-audit.0iOMg3/ram-work`.
Sources/models are copied over a temporary pinned TLS link and checked by SHA-256;
the durable source and evidence remain on Windows. Rust/Node/uv/Python, caches,
HOME and build outputs are redirected into this temporary RAM workspace. No
installed application or shell profile is modified.

The locked native toolchain passed preparation. Initial source-check setup stopped
at the intentional refusal to create CI placeholders outside CI. The first full
engine invocation then required real sidecars to be staged before its preflight.
These are failed temporary invocation attempts, not native gate passes. The
official Apple Silicon OCR runtime build passed, including byte-identical repeated
packaging and license inventory. It contains 5,796 files / 847,557,178 bytes; its
278,062,692-byte ZIP has SHA-256
`27856062d3e9cea9973a64f730dcb19156a9e7a36ec26165203445fe962f7d58`.
Full source/engine reruns will use the actual staged binaries. Current worker
inference, application packaging and installed GUI acceptance remain pending.

The Linux package build exposed inherited Windows resource mappings: Tauri merges
platform configurations into its base configuration rather than replacing the
resource map. Windows engine resources now live in `tauri.windows.conf.json`;
the base retains shared OCR resources. Regression checks inspect merged maps for
all three platforms. Production configuration and Linux/macOS packaging contract
checks pass. Native package builds are being retried with this correction.

The RAM device is temporary and must be detached after receipts/artifacts are
copied back. Never reuse its device number without verifying the current owned
RAM image; a reboot can change device identifiers. The existing public bundle
and earlier signed libvips probe copy are not current-application proof.

## Remaining authorized work

- Complete native Linux and Apple Silicon package construction and inspection;
  Apple Silicon worker inference is pending in the temporary RAM workspace.
- Expanded OCR small-print/layout and cold/warm measurements; document fidelity,
  external-reference/macro fixtures and final package notices.
- Target-size estimates and additional practical folder/batch features, evaluated
  against measured behavior. Recovery and batch reports are implemented above.
- Installed Windows GUI/offline/cancel/restart/picker/drop acceptance; current
  Mac/Linux final downloaded-package and clean-host acceptance.
- Inherited GTK/Rust maintenance/unsoundness warning triage and final canonical
  audits/packages on the final source. Signing/notarization/publication are
  separate; no release or remote push is authorized by this continuation.

## Native packaging and OCR startup checkpoint

The `ef94503e` Linux AppImage is built and copied back: 1,176,226,296 bytes,
SHA-256 `969288445b703bfd41fa9afb9d24ec1d6a367ad8d167aaa3b387c2fa2fa56c2f`.
Its embedded OCR ZIP matches the reproducible archive and the extracted FFmpeg
reports 8.1.1. It is unsigned, uses local unpublished engine metadata and has no
installed GUI acceptance. The build required `libfbclient2` for LibreOffice's
Firebird component; both Linux build workflows and the setup documentation now
include that build dependency. Receipt: `audits/2026-10-30/linux-appimage-build-ef94503e.json`.

Apple Silicon passed source checks, Clippy, the seven PDFium CLI tests, all eleven
native conversion groups and the media HTTP isolation control. The first OCR
archive run failed at the unchanged 30-second startup deadline. A diagnostic then
measured a valid ready message at 36,408 ms under denied networking and 1,466 ms
on the subsequent warm launch. The native Mac startup deadline is now 90 seconds;
Windows/Linux retain 30 seconds, recognition retains 180 seconds, and cancellation
is still checked every 50 ms. The corpus harness uses the same platform deadline
and includes bounded stderr in startup failures. The native Mac rerun is pending.
The first application compiled but bundling failed while clearing xattrs; this
is not a DMG success. The original attempts remain in the receipts.

An opt-in Rust integration test now extracts the actual prepared host OCR archive
with the production extractor, verifies every runtime/model hash and checks host
architecture. Windows passed in 219.30 s. This tests deployment integrity and
does not replace inference or installed application acceptance.

Package notice review found obsolete editor/Tiptap/ProseMirror/DOMPurify/docx.js
claims and an obsolete PDF editing-wrapper description in `NOTICE`. Those claims
are removed; retained conversion/OCR dependencies and platform license inventories
are described. No old user documents or drafts are removed.

All three Rust audits passed with informational warnings retained. The application
lock now replaces yanked `chacha20 0.10.1` with `0.10.2` and `clipboard-win 5.4.1`
with `5.4.3`. The PDFium wrapper's separately hashed, reproducible lock remains
unchanged: changing it also requires rebuilding and relocking every candidate,
not merely changing its recorded hash. Its yanked warning remains visible.
`glib 0.18.5` inherits RUSTSEC-2024-0429 through GTK3/Wry; the upstream fix is in
glib >=0.20 and cannot be substituted across GTK3's 0.18 API by a lockfile update.
No direct `VariantStrIter`/`iter_str` application use was found; this does not prove
absence of transitive reachability. That advisory remains open, without ignores.
Sources: [RustSec](https://rustsec.org/advisories/RUSTSEC-2024-0429),
[upstream correction](https://github.com/gtk-rs/gtk-rs-core/pull/1343).
