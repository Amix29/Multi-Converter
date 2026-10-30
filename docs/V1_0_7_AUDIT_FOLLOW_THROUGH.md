# V1.0.7 audit follow-through — 2026-10-30

## Handoff

The maintainer requested all remaining locally achievable audit work and continuous
documentation updates. The isolated work branch is `codex/audit-follow-through`,
based on `41459c23`. Local integration remains `codex/test`; `main` and remote
branches are untouched. V1.0.7 is unpublished. The earlier Windows installer
is tied to application source `b766134f` and does not contain this new lot.
First follow-through lot `9859e8d9` is now locally integrated on `codex/test`.

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

## Remaining authorized work

- Native Linux source/build/package/engine/OCR validation as available; current
  Apple Silicon build/package and OCR evidence still need adequate build space.
- Expanded OCR small-print/layout and cold/warm measurements; document fidelity,
  external-reference/macro fixtures and final package notices.
- Explicit recovery/retention, useful batch manifests, target-size estimates and
  practical folder/batch features. Do not persist private paths/content silently.
- Installed Windows GUI/offline/cancel/restart/picker/drop acceptance; current
  Mac/Linux final downloaded-package and clean-host acceptance.
- Inherited GTK/Rust maintenance/unsoundness warning triage and final canonical
  audits/packages on the final source. Signing/notarization/publication are
  separate; no release or remote push is authorized by this continuation.
