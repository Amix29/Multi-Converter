# macOS Apple Silicon DMG Release Checklist

Applies to V1.0.7 and later, following the maintainer decision of 2026-10-30.
Windows x64 and Linux x64 remain supported. V1.0.6 established the published macOS baseline
as a universal Intel + Apple Silicon DMG. V1.0.7 must restage and revalidate
all Mac engines as ARM packages; those historical universal assets are not ARM evidence.

## V1.0.7 Feature Gate

Multi-Converter contains conversion and local PP-OCRv6_medium OCR. Document and
PDF editors are cancelled. Validate conversion, PDF native-text extraction,
scanned/mixed PDF OCR and copying image text. No model download during use,
cloud inference or document editing may return through packaging changes.

## Required Build Shape

- Build on an Apple Silicon Mac with target aarch64-apple-darwin.
- Use src-tauri/tauri.macos.conf.json and native arm64 sidecars/engines.
- Ship Multi-Converter_X.Y.Z_macos-aarch64.dmg and identical stable alias Multi-Converter_macos-aarch64.dmg.
- Ship Multi-Converter_X.Y.Z_macos-aarch64.app.tar.gz and its .sig from the same build.
- latest.json includes darwin-aarch64 only for Mac. Reject darwin-x86_64 and darwin-universal.
- Use ad-hoc signing unless Apple Developer ID credentials are configured. Updater signatures do not establish Apple signing or notarization.
- Change source/config and rebuild; never patch the generated .app.

## Mac Handoff Readiness

Run npm run check and the complete current Windows gate before handoff. Once
those pass, the only expected remaining work should be macOS-only work:

1. Provide reviewed ARM FFmpeg/ffprobe archives and SHA-256 inputs.
2. Stage native ARM LibreOffice, Pandoc and portable libvips with licenses.
3. Build locked PDFium 149.0.7825.0 with wrapper 0.4.0. The upstream archive is pdfium-mac-arm64.tgz, verified against tools/platform-runtime-provenance-lock.json.
4. Run npm run test:macos:host and npm run test:macos:conversions on Apple Silicon.
5. Build npm run tauri:build:macos, then npm run verify:macos-dmg against the exact final downloaded package.
6. Complete clean-Mac first/second launch, conversion/OCR, cancellation and updater acceptance.

Windows results and Vite screenshots do not establish native Mac readiness.

## Required Local Inputs

- src-tauri/binaries/ffmpeg-aarch64-apple-darwin
- src-tauri/binaries/ffprobe-aarch64-apple-darwin
- Reviewed macos-aarch64 engine manifest and archives for PDFium, LibreOffice, Pandoc and libvips.
- One macos-aarch64 OCR worker archive and the locked shared models.

Verify executable bits, native architecture, version output, relative library
links, archive hashes, license/notice completeness and absence of Windows files.
Intel slices, universal sidecar synthesis and Rosetta are no longer requirements.
Keep source file hashes before/after representative conversions.

## Native Staging Workflows

Run macOS libvips Runtime for aarch64. macOS Engine Staging accepts only ARM
inputs, uses pinned checksums and produces macos-engine-assets. Neither workflow
publishes an application release as a side effect of validation.

For Phase 8 Engine Staging, provide macos_staging_run_id (or the persistent
MC_MACOS_ARM_ENGINE_STAGING_RUN_ID) from a successful macOS Engine Staging run
on the exact commit. The Mac job verifies that identity, prepares and validates
fresh engines, tests/lints PDFium and packages it twice reproducibly. It must
never relabel the V1.0.6 universal engine baseline as ARM.
The Linux baseline and its exact identity remain separate and unchanged.

Run OCR Runtime Staging on the same commit. It builds Windows x64, macOS ARM
and Linux x64 CPU workers from hashed locks, inventories licenses and tests the
packaged worker. Only the native ARM OCR archive belongs in the Mac app.

Pass the successful engine and OCR run IDs to macOS Conversion Matrix and
macOS DMG Build. These jobs reject mismatched workflow names, conclusions and
head SHAs. No compile-only placeholders count as conversion evidence.

Local staging through npm run prepare:macos-local-engines restores the embedded
manifest by default. Keep generated manifests only for intentional review;
do not commit generated engine archives or native build output.

## Final DMG Acceptance

npm run verify:macos-dmg must mount the exact release-named DMG, reject multiple
app bundles, verify the app signature before executing bundled programs, check
arm64 architecture, locate runtime sidecars, check versions and inspect bundled
engine metadata/resources. The same candidate must pass npm run test:macos:native,
packaged OCR smoke/corpus and the full conversion matrix. Save exact package
hash, commit, host OS/architecture, commands and result evidence.

On a clean Mac, verify mount, drag to Applications, first launch warning,
System Settings > Privacy & Security > Open Anyway, confirm Open, then normal
second launch. CI ad-hoc signing/launch does not prove this manual Gatekeeper path.
Do not ask users to disable Gatekeeper globally or make quarantine removal the
normal install path. Unsigned/not-notarized is a distribution limitation to state
plainly until Apple Developer ID signing/notarization are actually configured.

## Release Handoff

No publication is implied by staging approval. Before a separately authorized
release, review all licenses, verify real updater signatures, prepare the exact
asset set, validate it and retain clean-host acceptance receipts for all supported
systems. Mac notes must name the ARM DMG, explain Apple signing/notarization,
state enabled automatic updates and record macOS DMG verification on Apple Silicon.
Claim full Mac coverage only with macOS Conversion Matrix evidence for the final
ARM engines. Keep published V1.0.6 notes and filenames unchanged.
