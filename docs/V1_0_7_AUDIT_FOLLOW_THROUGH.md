# V1.0.7 audit follow-through — 2026-10-30

## Handoff

The maintainer requested all remaining locally achievable audit work and continuous
documentation updates. The audit used isolated branch `codex/audit-follow-through`,
based on `41459c23`. Local integration remains `codex/test`; `main` and remote
branches are untouched. V1.0.7 is unpublished. Application source through
`8b510138` is locally integrated on `codex/test`; it includes authenticated OCR
manifests, deterministic row order, measured Mac memory/thread settings, macOS 15
policy and packaged project notices. The canonical check passes. Windows passes
194 Rust units, Linux/Mac 201 each (13 opt-in exclusions), all eleven real
conversion groups and HTTP controls on every host, plus denied-warning Clippy.
Actual Rust extraction/hash verification passes on all three prepared OCR archives.
Frontend units pass 56 tests and i18n covers 404 keys. The unchanged frontend's
existing browser suite passed 12 / 10 declared exclusions plus manual report/
recovery checks. Current local NSIS/AppImage/DMG candidates all use `8b510138`.
Their receipts are below; installed/native GUI and public release gates remain open.

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

## First-lot checks (historical checkpoint)

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

## Early Linux preparation checkpoint

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

## Early native package construction checkpoint

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

- Installed GUI/offline/cancel/restart/picker/drop acceptance and the current
  66-scenario manifest. Windows Computer Use requires the absent `node_repl` tool;
  the connected Mac tools expose terminal/filesystem operations, not GUI control.
  Browser previews and native CLI checks do not replace those interactions.
- Clean-host acceptance on macOS 15 and the Linux Ubuntu 22.04 CI baseline;
  available native hosts were macOS 26.6.2 and Ubuntu 24.04. No remote CI was run.
- Semantic OCR column/table order, representative real-document corpus, controlled
  uncontended cold/warm measurements and actual macro-execution/fidelity fixtures.
  Passing synthetic small-print, structural Office and external-field probes are
  recorded with their limits. Do not replace column order with a table-breaking
  heuristic without representative validation.
- Calibrated target-size features and further practical folder/batch proposals;
  recovery and explicit local batch reports are implemented. These remain backlog,
  not implied by passing the source or packaging checks.
- The inherited GTK unsoundness/maintenance warnings and separately locked wrapper
  yanked dependency remain visible after triage; no advisory is suppressed.
- Final third-party redistribution/source-offer review, signing/notarization,
  updater signatures and exact published-asset validation. No push/publication is
  authorized by this continuation; all new candidates remain local and unsigned.

## Native packaging and OCR startup checkpoint

The maintainer subsequently approved **macOS 15 and later on Apple Silicon**.
Static inspection of 671 ARM64 Mach-O files found a maximum declared minimum of
15.0 in libvips and its libraries, and no foreign thin Mach-O files. The macOS
configuration, README and packaging contract now match that policy. Bundled
engine validation reads bounded Mach-O headers, including universal ARM slices,
and rejects resources requiring a newer OS than the advertised target. Malformed
headers and out-of-bounds slices are rejected. This does not establish acceptance
on a real macOS 15 host; the available host runs 26.6.2.

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
and includes bounded stderr in startup failures. The native Mac rerun passed all
40 cases: clean/difficult means 100%, median 2,216 ms, extraction 4,805 ms,
initialization 47,313 ms, 82 network observations and no connections under denied
networking. Its reported RSS of zero was invalid: no positive sample was available.
The harness now reports null for absent samples, including normalization-only
cases with no memory field. A separate `/usr/bin/time -l` run measured the actual
sandboxed worker over the 12 unique image fixtures: peak 1,853,849,600 bytes
(1,768 MiB), initialization 4,544 ms, total 29,254 ms, exit 0. Mac OCR now reserves
2,048 MiB; its admission pool is 3,072 MiB so document/media work can coexist with
the retained worker. Windows/Linux remain at 2,048 MiB total and 768/1,152 MiB OCR.
This is measured peak-RSS guidance, not an OS-enforced cap. The timing receipt is
`audits/2026-10-30/macos-ocr-memory-probe.json`.
The first application compiled but bundling failed while clearing xattrs; this
is not a DMG success. The original attempts remain in the receipts.

The xattr failure was reproduced on read-only libvips resources. Packaging now
preserves executable bits while adding owner-write permission to copied Mac files.
The next retry encountered old read-only copies in the failed build cache; that
owned temporary cache must be made writable before rebuilding from source.

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

The final `d406e3e1` Windows NSIS candidate is 999,609,888 bytes, SHA-256
`a917c28b195adbc58a51c58b5c1aa8d49c4657a47c3000eb1f9bea89e47eb043`.
The corresponding Linux AppImage is 1,176,492,536 bytes, SHA-256
`9243b28503f1ed40ab320a8e2cf89b43df4d7e5e33821422680c1dec8aa34763`.
Both are local unsigned packages with installed acceptance pending. Linux was
built on Ubuntu 24.04; that does not establish the CI Ubuntu 22.04 baseline.
Its final inspection needed a distinct extraction directory after an existing
checkpoint directory correctly refused reuse; the actual build and copy passed.

Additional actual LibreOffice Linux fixtures passed with the exact private-profile
settings: RTF INCLUDEPICTURE and INCLUDETEXT made zero HTTP requests after a
positive control; RTF → DOCX → ODT → DOCX retained French/Cyrillic markers, one
two-cell table and one embedded PNG at every step, with unchanged inputs. These
are structural fixtures, not visual Office parity or a macro-execution corpus.

Expanded isolated-network Linux OCR probes at 1090×1530 pixels recognized the
14 px and 10 px synthetic text and the simple table grid at 100% on both passes.
The two-column fixture exposed **row-wise interleaving across columns**: every
line is recognized but expected column order scores 83.43%. Automatic column
reordering must distinguish borderless tables and mixed layouts before adoption;
the existing worker output is preserved and this limitation stays open.
Fresh-process initialization was 4,352 ms; sampled RSS reached 887.7 MiB.
Concurrent native builds affected timings, so these runs do not establish a warm
speedup or uncontended performance, nor printed-DPI small-font parity.

The row-order investigation additionally reproduced a native normalization defect:
the same three boxes produced different text for different worker permutations.
The former pairwise row-tolerance comparator was non-transitive. Normalization
now first sorts by total coordinate order, forms rows using a fixed anchor, and
then sorts each row by x. A regression failed before the fix and passes all six
permutations after it. No blocks are removed; semantic column order stays open.

The new deployment-target gate initially confused LibreOffice's Java `.class`
CAFEBABE header with a universal Mach-O header. It now distinguishes the JVM
version header, with a regression. The same bounded compatibility validation
also runs on extracted Mac OCR archives before inference.

Portable synthetic probe scripts and exact layout PNGs are preserved under
`audits/2026-10-30/reproduce/`; their README states prerequisites and evidence limits.

The native worker launch now applies the same OpenMP/MKL bounds as the host
measurements (up to four available CPUs) and one OpenBLAS thread. A regression
checks that unbounded command settings cannot override those values. These are
library environment bounds, not a claim that every predictor thread is controlled.

A same-payload Windows NSIS comparison measured zlib at 999,609,888 bytes and
LZMA at 950,990,375 bytes: a 4.86% reduction. LZMA took 1,105,020 ms (18 min 25 s).
The zlib default is retained given the limited size gain and measured LZMA cost;
no installed extraction-speed comparison is claimed. The receipt is
`audits/2026-10-30/windows-nsis-compression-comparison.json`.

## OCR manifest integrity correction

A red regression reproduced an integrity weakness: changing a runtime file and
its manifest's per-file hash while retaining the old claimed aggregate passed
verification. The verifier now recomputes the canonical `path NUL bytes NUL sha256
LF` list and its byte sum against the executable's embedded lock before reading
the payload files. Both runtime and model manifests use this shared verifier.
Manifest reads are bounded to 16 MiB + one sentinel byte before parsing, rather
than checking the size after an unbounded read. The forged-manifest regression
now passes, as do the existing modified-resource and cancellation cases.

The actual Windows archive and all models passed the strengthened verifier in
140.13 s: 7,246 runtime files / 660,643,156 bytes, plus 21 model files /
185,082,003 bytes and the correct host architecture. The earlier runtime ZIPs
remain byte-identical; this corrects application verification, not the model or
worker content. Native Linux/Mac verification and all final package rebuilds also
use this correction. Their actual archives and models pass the strengthened
verifier; Linux's explicit archive check took 44.69 s.

Direct Mac bundle inspection also found that the project's root LICENSE and
NOTICE were absent from application resources. Shared Tauri resource mappings
now ship them as `licenses/LICENSE.txt` and `licenses/NOTICE.txt` on all three
platforms. This does not claim completion of final third-party redistribution
review. One intermediate Mac image creation was unusually slow (18 min 48 s
including checks) but eventually completed and passed verification. No termination
was sent because the owned process had already exited. The final candidate was
built independently using native HFS+ UDZO layout NONE and passed image checks.

## Current local candidates — application source 8b510138

| Platform | Bytes | SHA-256 | Receipt |
| --- | ---: | --- | --- |
| Windows NSIS | 999,631,584 | `eee1bc685164e6e53b5c5900131f5dfa10adc0f90c789e7cc27f54aa2eb75fd7` | [Windows](audits/2026-10-30/windows-nsis-build-8b510138.json) |
| Linux AppImage | 1,176,459,768 | `795330fcf46cb3c34d7a98f78945bcb5028412d5424e885a1d16c0787e2d016a` | [Linux](audits/2026-10-30/linux-appimage-build-8b510138.json) |
| Apple Silicon DMG | 912,946,631 | `cdbe9362ebc17ff338cfa7013f4168c4fa599cd5f9822787bbfc7fd93f431c5b` | [Mac](audits/2026-10-30/macos-dmg-build-8b510138.json) |

All payloads are preserved on Windows in the standalone primary checkout's
`tmp/local-audit-8b510138/`; generated payloads are not versioned. See
[`LOCAL_WORKSPACE.md`](LOCAL_WORKSPACE.md) for workspace and worktree recovery.
Each host's project LICENSE/NOTICE and OCR runtime were checked. Windows has no
Authenticode or updater signature; the Mac app passes deep strict ad-hoc signature
verification, has an arm64 main executable and declares macOS 15.0. Its DMG passes
native checksum verification. Ad-hoc signing is not Apple Developer signing or
notarization. The Linux build host was Ubuntu 24.04, not the CI 22.04 baseline.
Linux/Mac package manifests use local unpublished engine candidates and official
staged OCR locks; they are not public-release metadata.

Latest Mac archive corpus: all 40 cases passed, clean/difficult means 100%, median
2,339 ms, extraction 7,222 ms, initialization 46,634 ms, 83 network samples and
zero observed connections under denied networking. Process RSS remains null in
that harness; use the separate measured `time -l` receipt above. Full native
attempts and their boundaries are retained in
[the Mac proof](audits/2026-10-30/macos-native-proof-8b510138.json).

The owned Mac RAM workspace was detached after preserving the final DMG, native
receipts and exact effective engine/OCR metadata on Windows: 34,359,738,368 bytes
(32 GiB) released. Only early synthetic probes/bootstrap files remain in the
owned private temporary parent; the installed application and real home profile
were not modified. See [the cleanup receipt](audits/2026-10-30/macos-temporary-workspace-cleanup.json).

## Standalone workspace relocation — 2026-10-30

The complete primary checkout now lives at
`%USERPROFILE%\Développement\Multi-Converter` on `codex/test`.
Maintenance uses `codex/standalone-relocation`, based on `ee3b70f8`.
Repository-owned rules retain the applicable stack, Git, documentation,
privacy/security, Vellum Paper, accessibility and source-size requirements.
The documentation is self-contained and previous workspace-brand references
have been removed, including from historical reports.

All six existing checkouts retain their HEAD, branch and tracked/untracked
state after the physical move; all 66 modified/untracked historical source
files were individually SHA-256 checked. Three historical worktrees now live
under the primary checkout's ignored `.worktrees/`; the two external checkouts
keep their locations with repaired Git links. Missing historical worktree
records were not pruned. Git refs and the origin remote were unchanged during
the move. The old root no longer exists; its emptied directory was preserved
with the pre-existing empty destination in ignored relocation backups.

The three final candidates were moved to the primary checkout's
`tmp/local-audit-8b510138/` and their sizes/SHA-256 values match the original
receipts. The former portal entry was removed while preserving both other
project objects and their existing local formatting. The obsolete shared-skill
junction was archived outside the repository. Eight verified source-site
diagnostic helper processes were closed to release Windows directory locks.
Installed application data and preferences were not moved. See
[the relocation receipt](audits/2026-10-30/standalone-workspace-relocation.json)
and [`LOCAL_WORKSPACE.md`](LOCAL_WORKSPACE.md).

Final relocation validation passes: `npm run check` in both maintenance and
primary checkouts, `npm run build:frontend` from the new root, the staged
secret-leak scan, all 120 local links in changed documentation and
`git diff --check`. Current tracked documentation contains no former workspace
name. The real former portal registry loads without schema warnings; its
catalogue route returns HTTP 200 without the removed entry. No persistent
portal server was running, so that route was verified by Fastify injection.
These are relocation/source checks, not a new installed-app acceptance claim.

## 2026-10-31 — Approved Open Design system

The personal Open Design library now contains **Multi-Converter**, using the
maintainer's original graph-paper identity, bold sans-serif headings, rounded
panels and offset shadows. Exact anchors: light `#c86a34`, dark `#4d8445`.
The importer fallback palette and native generic showcase were corrected.
Sources, token maps, six standalone previews and native showcase entries live
in `branding-kit/08_design-system/`. Native export matches all 30 source files.
Both native themes render without script/request failures; 10 viewport/theme
checks and the interactive demonstration pass. Automated accessibility reports
zero violations, with patterned-background contrast requiring measured review.
See [the design-system ledger](OPEN_DESIGN_SYSTEM.md) and its validation receipt.
Work uses `codex/open-design-system` and integrates locally on `codex/test`.
Runtime styling adoption and native conversion acceptance remain separate work;
this checkpoint creates a reusable design package and publishes no app release.

## 2026-11-01 — Desktop themes and interaction polish

The converter now consumes the approved brand tokens, with a local
system/light/dark preference in all six interface languages. The former vendor
palette is no longer loaded. Quality/media menus share the catalogue's custom
control treatment and retain keyboard selection, Escape and focus behavior.
The navigation panel blends into the paper at the top and appears as a blurred
surface after page/list scrolling. Hover, press, menu, dialogue and catalogue
reveal transitions respect reduced-motion and forced-color settings.

Initial browser checks pass in both themes at five widths; the 56 unit tests
and existing browser regression suite (12 passed, 10 planned project skips)
also pass. The [adoption ledger](APP_DESIGN_SYSTEM_ADOPTION.md) records final
checks and the Open Design synchronization. These checks use preview APIs;
they do not renew installed-package or native-engine acceptance receipts.

Primary colored buttons were then corrected to warm-white labels by maintainer
request. Dedicated deeper action shades preserve at least 4.5:1 in both modes
for rest, hover and press; original brand anchors stay unchanged. See the
[button contrast receipt](audits/2026-11-01/button-label-contrast.json).
