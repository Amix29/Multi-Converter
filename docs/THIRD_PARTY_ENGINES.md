# Third-party engine notices

This document is a maintainer release checklist for Multi-Converter V1. It is not legal advice. Community contributors are not expected to prepare engine releases, checksums, release notes, or redistribution packages. Verify the exact license files and notices for the specific binaries published in each release.

Multi-Converter itself is licensed under AGPL-3.0-or-later. Optional or bundled conversion engines remain separate third-party software. Their licenses are not replaced by the Multi-Converter license.

## Required release rule

Every published engine archive must include:

- `engine.json`
- the binaries declared in `tools/engine-packages.config.json`
- `licenses/LICENSE.txt`
- `licenses/THIRD_PARTY_NOTICES.txt` when configured
- any additional license or notice files required by the specific engine build

Do not publish an archive if its license, notices, binary origin, redistribution terms, or checksum are not verified.

For bundled FFmpeg/ffprobe binaries, the same rule applies even though they are stored in `src-tauri/binaries` instead of a downloadable ZIP.

## Active V1.0.6 engine families

| Engine | Mode | License warning | Release requirement |
| --- | --- | --- | --- |
| FFmpeg | Base bundled | Windows x64 uses `8.1.1-essentials_build-www.gyan.dev`, configured with `--enable-gpl`. macOS and Linux use separately staged platform binaries. Treat each released executable according to its exact configuration and license bundle. | Document the exact platform build, preserve FFmpeg license/notices, and provide access to corresponding FFmpeg source/build information for the released binary. |
| ffprobe | Base bundled | Same Gyan `8.1.1` build family and GPL treatment as FFmpeg. | Keep notices aligned with the FFmpeg build it came from. |
| PDFium | Advanced bundled | BSD-3-Clause for PDFium builds, with Chromium/PDFium third-party notices. | Include PDFium license, Chromium/PDFium third-party notices, and wrapper notices. |
| LibreOffice | Advanced bundled | MPL-2.0/LGPL family with many bundled third-party components. | Include LibreOffice license files and third-party notices matching the packaged runtime. |
| Pandoc | Advanced bundled | GPL-2.0-or-later for Pandoc binaries. | Include copyright/license text and dependency notices. |
| libvips | Advanced bundled | LGPL-2.1-or-later, with many image codec dependencies that may carry separate terms. | Include libvips license and notices for all bundled DLLs/codecs. |
| 7-Zip | Future archive engine | LGPL with additional unRAR restriction if RAR support is included. | Document 7-Zip usage, link to source, and avoid implying RAR creation support unless explicitly verified. |

## Planned V1.0.7 OCR engine

V1.0.7 selects the local `PP-OCRv6_medium` model from PaddleOCR. OCR is not bundled yet, so it must not be added to the active-engine table or `NOTICE` until implementation.

Before packaging OCR:

- verify the exact PaddleOCR and inference-runtime versions;
- verify the license and redistribution terms of every runtime dependency and model archive;
- preserve the PaddleOCR Apache-2.0 license and applicable notices;
- pin official model/runtime URLs and SHA-256 values;
- record compressed and installed sizes;
- package platform-native executables/libraries only;
- prove that recognition works offline and does not download a model during conversion;
- add OCR entries to the embedded engine manifest only after the package validator understands them.

The selected upstream project is Apache-2.0, but this does not remove the obligation to inspect PaddlePaddle, inference backend, image/PDF dependencies and model-distribution notices individually.

## macOS engine status

V1.0.6 is published as one universal DMG. Any V1.0.7 engine change, including OCR, must be rebuilt and revalidated for both Apple Silicon and Intel before a new universal DMG is published. Do not reuse Windows OCR binaries or claim macOS OCR from source inspection.

For the universal DMG, release sidecars should include the `*-universal-apple-darwin` files required by Tauri's `externalBin` handling. The Apple Silicon and Intel inputs used to create those universal files must have matching license and notice coverage.

The macOS packaging contract lives in `tools/engine-packages.macos.config.json`. It expects reviewed `macos-universal` sources under `engine-sources/macos-universal/`. PDFium, LibreOffice and Pandoc have upstream macOS archive candidates and can be staged on macOS with `npm run prepare:macos-upstream-engines`.

The original V1.0.5 `codex/test` automation staged the maintainer-provided FFmpeg/ffprobe inputs and Homebrew-derived portable libvips runtime archives later used by the desktop release work. This is historical provenance, not permission to reuse those steps unchanged for OCR. `npm run prepare:ffmpeg-engine:macos` accepts only explicit archives with SHA-256 checksums, either as one combined archive per architecture or as separate `ffmpeg` and `ffprobe` archives, then creates universal sidecars with `lipo`. `npm run prepare:libvips-engine:macos` accepts only two already-portable libvips runtime trees and rejects non-system absolute dynamic links such as Homebrew, MacPorts or Fink paths.

macOS upstream engine downloads must be pinned before staging. Set `PDFIUM_MACOS_UNIVERSAL_ARCHIVE_SHA256`, `LIBREOFFICE_MACOS_AARCH64_DMG_SHA256`, `LIBREOFFICE_MACOS_X86_64_DMG_SHA256`, `PANDOC_MACOS_AARCH64_ARCHIVE_SHA256` and `PANDOC_MACOS_X86_64_ARCHIVE_SHA256` when running the macOS upstream engine preparation workflow or scripts. Windows upstream preparation has the same rule for `PANDOC_WINDOWS_X64_ARCHIVE_SHA256`, `PDFIUM_WINDOWS_X64_ARCHIVE_SHA256`, `LIBREOFFICE_WINDOWS_X64_MSI_SHA256`, `LESSMSI_WINDOWS_X64_ARCHIVE_SHA256` and `LIBVIPS_WINDOWS_X64_ARCHIVE_SHA256`.

The normal committed embedded manifest remains conservative for public builds unless a release workflow stages the reviewed `macos-universal` entries. macOS release notes and user-facing docs must limit macOS conversion claims to the engines that are actually bundled and tested in the final DMG.

## User-facing warning

Recommended release wording:

> Multi-Converter bundles platform-specific third-party conversion engines for better format support. These engines are separate software packages with their own licenses and notices. The bundled engine set may add GPL, LGPL, MPL, BSD, Apache, or similarly licensed components depending on the selected platform and engines.

## Packaging checks

Before publishing V1 engine archives:

1. Run `npm run validate:engines`.
2. Run the relevant `prepare:*` and `package:*` scripts.
3. Inspect each generated ZIP and confirm license files are present.
4. Confirm `src-tauri/engines-manifest.json` uses release URLs, not local `file:///` URLs, for public builds.
5. Confirm each manifest checksum matches the final uploaded archive.
6. Keep release artifacts separate from the source repository.
7. Run `src-tauri/binaries/ffmpeg-x86_64-pc-windows-msvc.exe -version` and `src-tauri/binaries/ffprobe-x86_64-pc-windows-msvc.exe -version`, then keep the detected version/configuration in the release notes.
8. Attach or link the corresponding FFmpeg source/build information for the bundled Gyan GPL build.

## References

- FFmpeg legal notes: https://www.ffmpeg.org/legal.html
- LibreOffice licenses: https://www.libreoffice.org/licenses/
- Pandoc copyright/license: https://github.com/jgm/pandoc/blob/main/COPYRIGHT
- libvips license: https://www.libvips.org/
- PDFium project/license: https://github.com/PDFium/PDFium
- 7-Zip FAQ/license notice: https://www.7-zip.org/faq.html
- PaddleOCR repository/license: https://github.com/PaddlePaddle/PaddleOCR
- PP-OCRv6 documentation: https://github.com/PaddlePaddle/PaddleOCR/blob/main/docs/version3.x/algorithm/PP-OCRv6/PP-OCRv6.md
