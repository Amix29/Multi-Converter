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

## Active V1 engines

| Engine | Mode | License warning | Release requirement |
| --- | --- | --- | --- |
| FFmpeg | Base bundled | V1 Windows x64 uses `8.1.1-essentials_build-www.gyan.dev`, configured with `--enable-gpl`. Treat the bundled executable as GPL-covered third-party software. | Document the exact Gyan build, preserve FFmpeg license/notices, and provide access to corresponding FFmpeg source/build information for the released binary. |
| ffprobe | Base bundled | Same Gyan `8.1.1` build family and GPL treatment as FFmpeg. | Keep notices aligned with the FFmpeg build it came from. |
| PDFium | Advanced bundled | BSD-3-Clause for PDFium builds, with Chromium/PDFium third-party notices. | Include PDFium license, Chromium/PDFium third-party notices, and wrapper notices. |
| LibreOffice | Advanced bundled | MPL-2.0/LGPL family with many bundled third-party components. | Include LibreOffice license files and third-party notices matching the packaged runtime. |
| Pandoc | Advanced bundled | GPL-2.0-or-later for Pandoc binaries. | Include copyright/license text and dependency notices. |
| libvips | Advanced bundled | LGPL-2.1-or-later, with many image codec dependencies that may carry separate terms. | Include libvips license and notices for all bundled DLLs/codecs. |
| 7-Zip | Future archive engine | LGPL with additional unRAR restriction if RAR support is included. | Document 7-Zip usage, link to source, and avoid implying RAR creation support unless explicitly verified. |

## macOS engine status

macOS support is being prepared for one universal DMG. Do not publish macOS engine archives or a macOS DMG until the exact FFmpeg/ffprobe, PDFium, LibreOffice, Pandoc and libvips builds have been reviewed for origin, license files, notices, checksums and executable permissions.

For the universal DMG, release sidecars should include the `*-universal-apple-darwin` files required by Tauri's `externalBin` handling. The Apple Silicon and Intel inputs used to create those universal files must have matching license and notice coverage.

The embedded manifest currently declares advanced bundled engines for `windows-x64` only. Until reviewed `macos-universal` entries are added, macOS release notes and user-facing docs must limit macOS conversion claims to the engines that are actually bundled and tested in the final DMG.

## User-facing warning

Recommended release wording:

> Multi-Converter bundles third-party conversion engines for better format support in the Windows x64 installer. These engines are separate software packages with their own licenses and notices. The bundled engine set may add GPL, LGPL, MPL, BSD, Apache, or similarly licensed components depending on the selected engines.

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
