# Multi-Converter v1.0.5 Validation Evidence

This file records validation evidence for the in-progress v1.0.5 release. It is not a public release approval by itself.

## macOS Automated Evidence

- macOS libvips Runtime: run `27459737669`, success. Produced `libvips-macos-aarch64` and `libvips-macos-x86_64` artifacts.
- macOS Engine Staging: run `27463128979`, success. Produced the `macos-engine-assets` artifact with FFmpeg, ffprobe, PDFium, LibreOffice, Pandoc and libvips staged for `macos-universal`.
- macOS Conversion Matrix: run `27464257789`, success. Passed the strict macOS conversion matrix for the conversions exposed on macOS with the staged engine set. AMR output is intentionally hidden on macOS because this FFmpeg build does not include the OpenCORE AMR encoder.
- macOS DMG Build: run `27465964283`, success. Built, mounted and verified `Multi-Converter_1.0.5_macos-universal.dmg` on `macos-latest`, then uploaded it as a workflow artifact.

## Remaining Release Evidence

- Manual clean-Mac smoke testing is still required before a public macOS release claim: mount DMG, drag to Applications, approve the unsigned/not-notarized first launch through `System Settings > Privacy & Security > Open Anyway`, confirm second launch, file selection, one FFmpeg media conversion, and one document/PDF/image path when those engines are included.
- The public release body still needs to state that the macOS build is not Apple-signed and not notarized, that macOS automatic updates are not enabled for the first DMG workflow, and how to open the app through `Open Anyway`.

## Manual Clean-Mac Smoke Test Receipt

Record this receipt only after testing the final downloaded DMG on a clean macOS environment. Leave the result as `pending` until every required line below is true for the exact release DMG.

- Manual clean-Mac smoke testing: pending
- Date: pending
- Tester: pending
- macOS version: pending
- Mac model: pending
- Architecture tested: pending
- DMG: Multi-Converter_1.0.5_macos-universal.dmg
- DMG source: pending
- Mounted final downloaded DMG: no
- Dragged app to Applications: no
- Unsigned/not-notarized first launch warning verified: no
- Opened through System Settings > Privacy & Security > Open Anyway: no
- Confirmed Open prompt: no
- Second launch verified: no
- File selection verified: no
- FFmpeg media conversion verified: no
- Document/PDF/image advanced conversion verified: no
- Updater metadata behavior checked: no
- Notes: pending

## Security And Confidentiality Evidence

- `npm run test:secret-leaks`: passed on June 13, 2026.
- `npm run test:production-config`: passed on June 13, 2026.
- `npm audit --audit-level=moderate`: passed on June 13, 2026 with 0 reported npm vulnerabilities.
- `cargo audit --file src-tauri/Cargo.lock`: completed on June 13, 2026. It reported the expected allowed warnings already documented for the current Tauri/Linux GTK-related dependency stack, plus unmaintained transitive crates; no new secret exposure was found by this command.
- Extra tracked-file confidentiality search: passed on June 13, 2026. No private test repository reference, local maintainer path, signing-key value, Apple signing credential file name, npm token assignment or private-key block was found in tracked project files outside ignored/generated folders.
- Local Git configuration was checked and the obsolete private test remote was removed from this machine. This was not a tracked repository change.

The exhaustive Codex Security subagent scan is still pending explicit maintainer approval for subagent use. Do not mark the full v1.0.5 goal complete until that scan, or an approved equivalent, is finished and any findings are resolved or explicitly accepted.
