# OCR runtime staging

This directory is populated by `npm run prepare:ocr-runtime` from the locked
runtime and model artifacts in `src-tauri/ocr-runtime-lock.json`.

Generated binaries and models are intentionally ignored by Git. The packaged
application must contain exactly one platform runtime under `runtime/` and the
five verified `PP-OCRv6_medium` modules under `models/`. No application runtime
code downloads these resources.
