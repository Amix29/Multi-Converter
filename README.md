# Multi-Converter

<p align="center">
  <img src="docs/readme-banner.svg" alt="Multi-Converter - Local, private and open source file conversion" width="100%">
</p>

<p align="center">
  <a href="https://github.com/Amix29/Multi-Converter/releases/latest">
    <img alt="Release" src="https://img.shields.io/github/v/release/Amix29/Multi-Converter?label=Release&color=2563eb">
  </a>
  <a href="https://github.com/Amix29/Multi-Converter/actions/workflows/build.yml">
    <img alt="Build status" src="https://img.shields.io/github/check-runs/Amix29/Multi-Converter/main?name=quality-gate&label=Build">
  </a>
  <a href="LICENSE">
    <img alt="License" src="https://img.shields.io/badge/License-AGPL--3.0--or--later-0f766e">
  </a>
</p>

<p align="center">
  <strong>Multi-Converter</strong> is a <strong>free</strong> and <strong>open source</strong> tool to convert your files directly on your computer.<br>
  Documents, images, audio and video — no account, no cloud, no file upload to any server.
</p>

<p align="center">
  <a href="https://github.com/Amix29/Multi-Converter/releases/latest/download/Multi-Converter_windows-x64_setup.exe">
    <img alt="Download for Windows" src="https://img.shields.io/badge/⬇️%20Download%20for%20Windows-.exe-2563eb?style=for-the-badge">
  </a>
  <a href="https://github.com/Amix29/Multi-Converter/releases/latest/download/Multi-Converter_macos-universal.dmg">
    <img alt="Download for macOS" src="https://img.shields.io/badge/⬇️%20Download%20for%20macOS-.dmg-111827?style=for-the-badge">
  </a>
  <a href="https://github.com/Amix29/Multi-Converter/releases/latest/download/Multi-Converter_linux-x64.AppImage">
    <img alt="Download for Linux" src="https://img.shields.io/badge/⬇️%20Download%20for%20Linux-.AppImage-16a34a?style=for-the-badge">
  </a>
</p>

---

## Table of Contents

- [Why use Multi-Converter?](#why-use-multi-converter)
- [Download](#download)
- [macOS Installation](#macos-installation)
- [Linux Installation](#linux-installation)
- [Overview](#overview)
- [Supported Formats](#supported-formats)
- [Privacy](#privacy)
- [Bundled Conversion Engines](#bundled-conversion-engines)
- [Licenses](#licenses)
- [Legal Notice](#legal-notice)
- [Development](#development)
- [Contact](#contact)
- [Contributing](#contributing)
- [Code of Conduct](#code-of-conduct)
- [Security](#security)
- [Star History](#star-history)

---

## Why use Multi-Converter?

| Key point | What it means for you |
| --- | --- |
| 🆓 **Free and open source** | Use **Multi-Converter** freely and browse its source code. |
| 🔒 **Local and private** | Your files stay on your computer throughout the conversion. |
| 🔄 **Multi-format** | Documents, images, audio and video — all handled in a single app. |
| ⚡ **Ready after install** | Conversions run locally with the engines bundled for each release platform. |

---

## Download

| System | Status | Download |
| --- | --- | --- |
| 🪟 Windows x64 | ✅ Available | [`.exe`](https://github.com/Amix29/Multi-Converter/releases/latest/download/Multi-Converter_windows-x64_setup.exe) |
| 🍎 macOS Apple Silicon + Intel | ✅ Available | [`.dmg`](https://github.com/Amix29/Multi-Converter/releases/latest/download/Multi-Converter_macos-universal.dmg) |
| 🐧 Linux x64 | ✅ Available | [`.AppImage`](https://github.com/Amix29/Multi-Converter/releases/latest/download/Multi-Converter_linux-x64.AppImage) |

The macOS direct download uses the stable latest asset `Multi-Converter_macos-universal.dmg`. Each release also keeps the versioned DMG asset `Multi-Converter_X.Y.Z_macos-universal.dmg` for traceability.

The Linux direct download uses the stable latest asset `Multi-Converter_linux-x64.AppImage`. Each release also keeps the versioned AppImage asset `Multi-Converter_X.Y.Z_linux-x64.AppImage` for traceability.

---

## macOS Installation

The macOS build is a universal DMG for both Apple Silicon and Intel Macs.

Download `Multi-Converter_macos-universal.dmg` for the latest macOS release. The same release also includes the versioned asset `Multi-Converter_X.Y.Z_macos-universal.dmg`.

This macOS build is not Apple-signed and not notarized. On first launch, macOS may block it. To open it safely:

1. Open `Multi-Converter.app` once from Applications.
2. Go to `System Settings > Privacy & Security`.
3. Choose `Open Anyway`, then confirm `Open`.

This approval is normally needed only on the first launch for that downloaded app copy, or after installing a new version. macOS automatic updates are enabled for builds that include the Tauri updater-signed artifacts.

---

## Linux Installation

Download `Multi-Converter_linux-x64.AppImage` for the latest Linux x64 release.

Most Linux desktops need the AppImage to be marked executable once:

```bash
chmod a+x Multi-Converter_linux-x64.AppImage
./Multi-Converter_linux-x64.AppImage
```

Linux automatic updates are enabled for builds that include the Tauri updater-signed AppImage artifact.

---

## Overview

<p align="center">
  <img src="docs/screenshots/01-files.png" alt="Adding files" width="32%">
  <img src="docs/screenshots/02-format.png" alt="Choosing a format" width="32%">
  <img src="docs/screenshots/03-output.png" alt="Conversion complete" width="32%">
</p>

---

## Supported Formats

**Multi-Converter** detects the formats listed below and offers compatible conversions based on the available engines.

| Category | Recognized formats |
| --- | --- |
| 📄 Documents & text | PDF, DOCX, DOC, TXT/LOG, HTML/HTM, CSV, JSON, ODT, RTF, Markdown/MD, EPUB, XML |
| 🖼️ Images | PNG, JPEG/JPG, GIF, SVG, WebP, TIFF/TIF, BMP, ICO |
| 🎵 Audio | MP3, AAC/M4A, FLAC, WAV, OGG/OGA, WMA, OPUS, AIFF/AIF, ALAC, AC3, MP2, AMR, AU/SND, CAF |
| 🎬 Video | MP4/M4V, MKV, WebM, MOV, AVI, WMV, 3GP/3G2, MTS/M2TS, MPEG-2/MPG/MPEG, OGV |

> **Note**
> Some formats may be recognized without supporting every possible conversion to every other format. The options shown in the app depend on the source file and the available engines. AMR output is currently Windows-only because the staged macOS FFmpeg build does not include the OpenCORE AMR encoder.

---

## Privacy

Conversions run on **your machine**. An internet connection may be required to download the app or install an update, but **Multi-Converter** never sends your files to the cloud.

---

## Bundled Conversion Engines

The Windows x64 installer and macOS universal DMG bundle third-party engines for **Office**, **PDF**, **Markdown/HTML/EPUB** and **advanced image** conversions, so users do not need a separate download after setup. Linux AppImage releases must pass the Linux engine checklist before claiming the same advanced document/PDF/image coverage.

*Full Windows x64 installation as declared in the manifest, sizes rounded. macOS bundle sizes may differ:*

| Engine | Mainly used for | Download | Once installed | License |
| --- | --- | ---: | ---: | --- |
| PDFium | PDF to image rendering | 5.6 MB | 13.1 MB | BSD-3-Clause |
| LibreOffice headless | Accurate Office and PDF conversions | 483.8 MB | 1.51 GB | MPL-2.0 |
| Pandoc | Markdown, HTML, EPUB, DOCX | 40.7 MB | 231.1 MB | GPL-2.0-or-later |
| libvips | Advanced images | 10.8 MB | 28.5 MB | LGPL-2.1-or-later |
| **Total** | Bundled advanced engines | **540.9 MB** | **1.79 GB** | Multiple licenses |

---

## Licenses

**Multi-Converter**'s code is licensed under the **GNU Affero General Public License v3.0 or later** (`AGPL-3.0-or-later`). See [LICENSE](LICENSE).

**Multi-Converter** uses third-party conversion engines that retain their own licenses, notices and redistribution conditions. They do not change license because you use them through **Multi-Converter**.

Key points:

- **Multi-Converter** itself is licensed under **AGPL-3.0-or-later**.
- Third-party engines remain separate software with their own licenses.
- The **Windows x64 V1** release bundles **FFmpeg** and **ffprobe** `8.1.1-essentials_build-www.gyan.dev`, built with `--enable-gpl`: the bundled executables are treated as third-party software covered by the GPL in this distribution.
- The Windows x64 installer and macOS universal DMG bundle **PDFium**, **LibreOffice**, **Pandoc** and **libvips**, each under their own license. Linux advanced engine redistribution must be verified separately before public release notes claim full Linux document/PDF/image coverage.

See [NOTICE](NOTICE) and [docs/THIRD_PARTY_ENGINES.md](docs/THIRD_PARTY_ENGINES.md) for details.

---

## Legal Notice

*This documentation is not legal advice. Release maintainers must verify the exact obligations of the binaries and third-party engines they distribute.*

---

<h2 id="development" align="center">Development</h2>

This section is for anyone who wants to run the project locally, fix a bug, suggest an improvement, or explore the code. **Releases, installers, engine archives and release notes are prepared by the project maintainers.**

### Tech Stack

| Layer | Technology |
| --- | --- |
| Desktop application | Tauri 2 |
| UI | React + TypeScript |
| Backend | Rust + Cargo |
| Frontend build | Vite |
| Internal scripts | Node.js |

### Prerequisites

- Windows x64 for Windows development and packaging.
- macOS 11 or newer with Xcode Command Line Tools is required for macOS packaging and validation.
- Linux x64 with WebKitGTK 4.1 development packages is required for Linux AppImage packaging and host validation.
- Node.js `>=24 <25` and npm `>=11 <12`.
- Rust and Cargo.
- The [Tauri prerequisites for Windows](https://v2.tauri.app/start/prerequisites/).

### Project Setup

```bash
git clone https://github.com/Amix29/Multi-Converter.git
cd Multi-Converter
npm install
```

### Running the App

```bash
# Full desktop app: Tauri, real conversions, sidecars
npm start

# Equivalent command
npm run tauri:dev
```

> `npm run dev` only starts the Vite frontend with a simulated API. To test **real conversions**, **sidecars**, the **Tauri** runtime or file system access, use `npm start` or `npm run tauri:dev`.

### Useful Commands

Recommended checks before a pull request:

```bash
npm run check
npm run test:rust
npm run test:pdfium-wrapper
npm run test:pdfium-wrapper:compile
```

`npm run check` covers installer asset generation, bundled engine validation, embedded manifest validation, i18n validation, TypeScript typechecking and engine packaging validation.

Targeted commands useful during development:

```bash
npm run typecheck
npm run validate:i18n
npm run validate:embedded-manifest
npm run validate:bundled-engines
npm run validate:engines
```

Build:

```bash
npm run build
npm run tauri:build

# macOS only, from a Mac with both Darwin sidecar architectures staged.
# prepare:bundled-engines creates the universal sidecars required by Tauri.
# The wrapper refuses this command on Windows/Linux so a DMG is never presented as cross-built.
npm run tauri:build:macos

# Linux x64 only, from a Linux host with real Linux sidecars staged.
npm run tauri:build:linux
```

Rust formatting and linting:

```bash
npm run fmt:rust:check
npm run clippy:rust
npm run clippy:pdfium-wrapper
```

On Windows PowerShell, direct Cargo commands can also use a temporary build folder:

```powershell
cargo fmt --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml --target-dir "$env:TEMP\mc-cargo-target-engine-registry"
```

`npm run tauri:dev` and `npm run tauri:build` use a temporary `CARGO_TARGET_DIR` to avoid stale Tauri artifacts in `src-tauri/target`.

### Project Structure

```text
src/                         React UI
src/i18n/                    UI translations
src-tauri/                   Tauri/Rust backend
src-tauri/tauri.macos.conf.json
src-tauri/binaries/          Base sidecars bundled for the current release target
src-tauri/engines-manifest.json
docs/                        License, security and third-party engine documentation
tools/                       Engine technical configuration
scripts/                     Build, validation and maintenance scripts
```

Generated folders (`dist`, `node_modules`, build caches, local engine sources, engine archives, test results) must not be committed.

### Conversion Engines

**Multi-Converter** works with bundled engine groups:

| Group | Role | Distribution |
| --- | --- | --- |
| Base | Common conversions available with the app | Integrated engines or bundled sidecars |
| Advanced | More accurate or more advanced conversions | Bundled Tauri resources prepared from verified engine ZIPs |

The Windows x64 base engines `ffmpeg` and `ffprobe` are bundled in `src-tauri/binaries`. Advanced engines are prepared into `src-tauri/bundled-engines` and bundled as Tauri resources. Both groups are validated before each build.

The macOS universal DMG must include universal FFmpeg/ffprobe sidecars. Advanced macOS engines must not be advertised unless the release workflow stages reviewed `macos-universal` entries with verified archives, licenses, notices and checksums and the final DMG passes macOS validation.

Restore and validate the bundled engines:

```bash
npm run prepare:bundled-engines
npm run validate:bundled-engines
```

To work locally on engine scripts, place temporary sources under:

```text
engine-sources/windows-x64/<engineId>/
engine-sources/macos-universal/<engineId>/
```

> **Important**
> Do not commit generated archives, local engine sources, release checksums, DMGs or engine version changes without explicit approval from a maintainer. macOS app bundles and DMGs must be rebuilt from source/config; do not hand-edit the generated `.app` after packaging.

See [tools/ENGINE_PACKAGING.md](tools/ENGINE_PACKAGING.md) and [docs/THIRD_PARTY_ENGINES.md](docs/THIRD_PARTY_ENGINES.md) for technical context.

For the platform test split, see [docs/TESTING.md](docs/TESTING.md).

For repository discoverability topics, see [docs/GITHUB_TOPICS.md](docs/GITHUB_TOPICS.md).

---

## Contact

For general questions, feedback or partnership requests, contact [amixdigital0@gmail.com](mailto:amixdigital0@gmail.com).

---

## Contributing

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.

Expected contributions include **bug fixes**, **optimizations**, **UI improvements**, **translations**, **tests** and **feature suggestions**. Before submitting a change, run the checks relevant to the area you modified.

---

## Code of Conduct

Multi-Converter is an open source project. Everyone is expected to participate with respect, clarity and good faith.

### Expected Behavior

- Be respectful and welcoming to contributors of all experience levels.
- Keep discussions constructive, technical when possible, and focused on the project.
- When reporting a bug, include what happened, what you expected, and how to reproduce it.
- When reviewing code, focus on the change, the behavior, and concrete improvements.

### Unacceptable Behavior

- Harassment, insults, discriminatory language, personal attacks or threats.
- Spam, repeated off-topic messages, advertising, or low-effort comments that disrupt the project.
- Deliberately misleading reports, hostile reviews, or behavior intended to waste maintainer time.
- Sharing private information without permission.

### Enforcement

Maintainers may edit, hide or remove comments, close discussions, or block users when behavior harms the project or its contributors.

---

## Security

To report a vulnerability or security issue, use GitHub private vulnerability reporting when available. Do not post exploit details, crafted files or sensitive logs in a public issue. See [SECURITY.md](SECURITY.md) for scope and safe reporting instructions.

---

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=Amix29/Multi-Converter&type=Date)](https://www.star-history.com/#Amix29/Multi-Converter&Date)
