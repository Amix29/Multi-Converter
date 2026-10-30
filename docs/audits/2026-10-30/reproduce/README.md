# Native audit reproducers

Run from a prepared project checkout, with actual matching Linux engines,
the locked OCR worker/models and Python 3 available. These scripts create only
synthetic documents in private temporary directories. Reports go to
`test-results/audit-2026-10-30/`.

```sh
python3 /path/to/reproduce/linux-office-privacy-probe.py
python3 /path/to/reproduce/linux-office-fidelity-probe.py
python3 /path/to/reproduce/linux-ocr-layout-probe.py
```

The privacy probe starts a loopback HTTP positive control and checks RTF external
fields using the exact private LibreOffice profile from production source. It
does not cover arbitrary macros or every legacy document format. The fidelity
probe checks text, table structure and embedded images, not visual Office parity.

The layout probe needs unprivileged `unshare -Urn` support and runs the actual
OCR worker in an isolated network namespace. It reports reading-order accuracy
without changing acceptance thresholds. Timings from the recorded run overlap
native builds and must not be used to assert a cold/warm speedup.

`ocr-layout/` contains the exact four synthetic raster inputs and manifest used
for the receipt. To regenerate them with the repository's installed Playwright:

```sh
node /path/to/reproduce/render-ocr-layout.mjs
```

Regeneration can change pixels when platform fonts or Chromium change. Compare
input hashes before treating a rerun as the identical fixture. CSS pixel sizes
are not a printed font-size or DPI guarantee. Two-column reading order remains
an exposed limitation; table text recognition does not imply semantic table export.
