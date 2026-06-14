# Linux Release Checklist

Use this checklist before publishing a Linux x64 AppImage for Multi-Converter.

## Build Host

- Use a Linux x64 host, preferably the same baseline as CI: Ubuntu 22.04.
- Install the Tauri Linux build dependencies, including WebKitGTK 4.1, GTK 3, Ayatana AppIndicator, DBus development headers, OpenSSL development headers, xdo, librsvg, build-essential, pkg-config and patchelf.

On Ubuntu:

```bash
sudo apt-get install -y libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev libdbus-1-dev libssl-dev libxdo-dev librsvg2-dev build-essential pkg-config patchelf
```

Before longer validation or packaging runs, verify the local Linux toolchain:

```bash
npm run test:linux:environment
```

In WSL, use a dedicated checkout under the WSL Linux filesystem, such as `~/Multi-Converter`, with Linux-installed Node/npm/Rust tooling. `npm run test:linux:environment` rejects checkouts and tools from Windows-mounted paths such as `/mnt/c` because they can create hybrid builds. If Linux npm operations are run in the same Windows checkout, reinstall Windows dependencies afterwards because optional native packages such as the Tauri CLI binding are platform-specific.
- Do not claim Linux release readiness from Windows, macOS, Vite preview or source inspection alone.

## Sidecars And Engines

- Stage real Linux sidecars before packaging:
  - `src-tauri/binaries/ffmpeg-x86_64-unknown-linux-gnu`
  - `src-tauri/binaries/ffprobe-x86_64-unknown-linux-gnu`
- To prepare a clean sidecar release asset set from maintainer-approved Linux x64 binaries, use:

```bash
npm run prepare:linux-sidecar-release-assets -- \
  --ffmpeg "<path-or-https-url-to-ffmpeg>" --ffmpeg-sha256 "<sha256>" \
  --ffprobe "<path-or-https-url-to-ffprobe>" --ffprobe-sha256 "<sha256>" \
  --out-dir "<clean-output-folder>"
```

Use raw executable files or maintainer-approved `.zip`, `.tar.gz`, `.tgz` or `.tar.xz` archives that contain exactly the expected Linux executable names. Do not use AppImages as FFmpeg sidecar inputs. Keep local input files outside the output folder because the output folder is cleaned first. This produces exactly `ffmpeg-x86_64-unknown-linux-gnu`, `ffprobe-x86_64-unknown-linux-gnu` and their `.sha256` files after checksum, archive extraction when needed, placeholder, x86_64 ELF and `-version` checks. The manual `Linux Sidecar Staging` workflow performs the same validation on Ubuntu 22.04 and can optionally upload those four files to a test release.
- When the sidecars were downloaded into a temporary asset folder with matching `.sha256` files, stage and smoke-test them with:

```bash
npm run prepare:linux-sidecars -- --asset-dir "<folder-containing-linux-sidecars>"
```

This helper verifies the checksums, rejects compile-only placeholders, rejects non-ELF and non-x86_64 ELF files, rejects extra files in the asset directory, copies the binaries into `src-tauri/binaries` and runs `-version` on Linux x64.
- Do not use `scripts/prepare-tauri-ci-sidecars.mjs` for a release build. Those files are compile-only placeholders.
- Run:

```bash
npm run test:linux:host
```

This must reject placeholder sidecars, smoke-test FFmpeg/ffprobe and validate Linux bundled engines.
It also rejects FFmpeg/ffprobe sidecars that are not Linux x86_64 ELF executables before running them.

Then run the full Linux conversion matrix:

```bash
npm run test:linux:conversions
```

This gate prepares Linux bundled engines, reuses the strict host validation above and runs `npm run test:conversions` on Linux.

For a full Linux release claim, the strict Linux gates require platform-specific advanced engine entries for PDFium, LibreOffice, Pandoc and libvips in `src-tauri/engines-manifest.json`, plus verified Linux engine archives that pass `npm run prepare:bundled-engines` and `npm run validate:bundled-engines` with `MULTI_CONVERTER_REQUIRE_ADVANCED_ENGINES=1`. Do not publish release notes claiming complete Linux document/PDF/image conversion coverage from FFmpeg sidecars alone.

Maintainers can package reviewed Linux engine source trees with:

```bash
npm run prepare:linux-engine-sources \
  -- --pdfium-archive "<pdfium-source-tree.tar.gz>" --pdfium-sha256 "<sha256>" \
  --libreoffice-archive "<libreoffice-source-tree.tar.gz>" --libreoffice-sha256 "<sha256>" \
  --pandoc-archive "<pandoc-source-tree.tar.gz>" --pandoc-sha256 "<sha256>" \
  --libvips-archive "<libvips-source-tree.tar.gz>" --libvips-sha256 "<sha256>"
npm run package:linux-engines -- --release-base-url "https://github.com/Amix29/Multi-Converter/releases/download/<linux-engine-tag>/"
```

The resulting `dist-engines-linux/engines-manifest.json` and advanced Linux engine ZIPs can then be staged for a build with:

```bash
npm run prepare:linux-engine-release-assets -- --tag "<linux-engine-tag>" --repo "Amix29/Multi-Converter"
```

The manual GitHub Actions `Linux Engine Staging` workflow performs the same source validation and packaging on Ubuntu 22.04. It requires maintainer-approved Linux x64 source-tree archive URLs and SHA-256 values for PDFium, LibreOffice, Pandoc and libvips. Source archives may be `.zip`, `.tar.gz`, `.tgz` or `.tar.xz`. The staged manifest used for AppImage packaging must contain exactly those advanced Linux engine entries; non-advanced Linux entries are rejected so the release cache cannot silently include extra Linux engine archives. On `codex/test`, it runs only when `MC_ENABLE_LINUX_ENGINE_STAGING=1` and the matching `MC_*_LINUX_X64_ARCHIVE` plus `MC_*_LINUX_X64_ARCHIVE_SHA256` repository variables are set.

## Build

Run:

```bash
npm run tauri:build:linux
```

The public Linux package is one AppImage:

```text
Multi-Converter_X.Y.Z_linux-x64.AppImage
```

For GitHub Actions, use the manual `Linux AppImage Build` workflow. Provide either `sidecar_release_tag` or `sidecar_staging_run_id` with real Linux FFmpeg/ffprobe sidecars and `.sha256` files. Provide either `engine_release_tag` or `engine_staging_run_id` with `engines-manifest.json` plus the verified Linux advanced engine ZIP assets. The workflow rejects ambiguous inputs when both source types are provided for the same asset class. When a staging run ID is used, it verifies that the referenced workflow completed successfully as `Linux Sidecar Staging` or `Linux Engine Staging` before using the artifact. The workflow runs `npm run test:linux:conversions` before packaging and uploads a `linux-release-artifacts` artifact containing the versioned AppImage, stable AppImage alias, updater signature and checksum.

Use the manual `Linux Sidecar Staging` workflow before `Linux AppImage Build` when the FFmpeg/ffprobe sidecars still need to be normalized into the expected release asset names. It requires explicit maintainer-approved executable or archive URLs and SHA-256 values for both sidecars, rejects non-HTTPS URLs, rejects AppImages, rejects non-x86_64 ELF files after extraction and uploads a `linux-sidecar-assets` artifact. Accepted archive formats are `.zip`, `.tar.gz`, `.tgz` and `.tar.xz`. `Linux AppImage Build` rejects extra files in that artifact directory before staging the sidecars.

`npm run prepare:linux-release-artifacts` and the final `npm run prepare:release-assets -- --linux-appimage ...` step must normalize from a source AppImage filename that includes the exact release version. Both steps reject AppImage sources that are not x86_64 ELF files. Do not use the stable alias `Multi-Converter_linux-x64.AppImage` as the source for a new versioned release artifact.

Before uploading or publishing a Linux AppImage, verify the exact release-named AppImage:

```bash
npm run verify:linux-appimage -- --version X.Y.Z --appimage Multi-Converter_X.Y.Z_linux-x64.AppImage --signature Multi-Converter_X.Y.Z_linux-x64.AppImage.sig
```

This extracts the AppImage, verifies its AppDir structure, checks the bundled Linux FFmpeg/ffprobe sidecars, rejects obvious Windows/macOS-only files, rejects foreign-platform FFmpeg/ffprobe sidecars without relying on filename extensions and cryptographically verifies the updater signature against the configured Tauri updater public key.

On `codex/test`, the same workflow can run from pushes only when the repository variables are set intentionally:

- `MC_ENABLE_LINUX_APPIMAGE=1`
- `MC_LINUX_SIDECAR_RELEASE_TAG=<release tag containing the Linux sidecars>` or `MC_LINUX_SIDECAR_STAGING_RUN_ID=<successful Linux Sidecar Staging run ID>`
- `MC_LINUX_ENGINE_RELEASE_TAG=<release tag containing the Linux advanced engine archives>` or `MC_LINUX_ENGINE_STAGING_RUN_ID=<successful Linux Engine Staging run ID>`

The Linux sidecar staging workflow can also run from `codex/test` when `MC_ENABLE_LINUX_SIDECAR_STAGING=1` and the `MC_FFMPEG_LINUX_X64_BINARY`, `MC_FFMPEG_LINUX_X64_BINARY_SHA256`, `MC_FFPROBE_LINUX_X64_BINARY` and `MC_FFPROBE_LINUX_X64_BINARY_SHA256` repository variables are set intentionally.

## Release Assets

The Linux release asset set is:

1. `Multi-Converter_X.Y.Z_linux-x64.AppImage`
2. `Multi-Converter_linux-x64.AppImage`
3. `Multi-Converter_X.Y.Z_linux-x64.AppImage.sig`
4. `Multi-Converter_X.Y.Z_linux-x64.AppImage.sha256`

`latest.json` must include `linux-x86_64` and point to the versioned AppImage, not the stable alias.

The GitHub release body and updater notes must name `Multi-Converter_X.Y.Z_linux-x64.AppImage`, state that the build is Linux x64, state that Linux automatic updates are enabled and mention that Linux AppImage verification passed on Linux. Do not claim all Linux conversions pass unless the Linux Conversion Matrix has passed with real Linux sidecars.

Validate Linux-only assets with:

```bash
npm run validate:release-assets -- --version X.Y.Z --dir "<folder>" --platform linux --linux-appimage-sha256 "<verified-appimage-sha256>"
```

This final validation checks the Linux updater metadata, signature, checksums, stable alias hash and x86_64 ELF shape of both AppImage files.

Validate Windows + Linux assets with:

```bash
npm run validate:release-assets -- --version X.Y.Z --dir "<folder>" --platform windows-linux --linux-appimage-sha256 "<verified-appimage-sha256>"
```

Validate Windows + macOS + Linux assets with:

```bash
npm run validate:release-assets -- --version X.Y.Z --dir "<folder>" --platform desktop --macos-dmg-sha256 "<verified-dmg-sha256>" --macos-updater-sha256 "<verified-updater-sha256>" --linux-appimage-sha256 "<verified-appimage-sha256>"
```

## Manual Smoke Test

Before publication, test the final downloaded AppImage on a clean Linux desktop:

- mark it executable with `chmod a+x Multi-Converter_linux-x64.AppImage`;
- launch the AppImage from the desktop environment or terminal;
- verify file selection;
- verify at least one FFmpeg audio/video conversion;
- verify document/PDF/image paths only when the matching Linux engines are included;
- verify updater metadata behavior when Linux updates are enabled.
