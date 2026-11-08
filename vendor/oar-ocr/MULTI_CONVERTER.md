# Windows OCR pipeline dependency

This is oar-ocr 0.10.2, Apache-2.0, from the crates.io registry, upstream
https://github.com/GreatV/oar-ocr at commit
`16ee0599a12a477178b8495918f99e1ed92e5e4e`. The upstream Apache-2.0 license
is retained. Only the package manifest is changed: ZIP 8.6 is upgraded to
ZIP 9, fixing RUSTSEC-2026-0367, -0368, -0369 and -0429. No advisory is ignored.

The ZIP dependency reads NPZ language models for the separate Indra pipeline;
this app uses the five PP-OCRv6_medium modules. Its code is retained and the
read-only ZIP API compiles against the fixed release. Recognition algorithms,
models, settings and formats are not modified by this dependency correction.
The native source fingerprint includes both vendored crates and the worker lock.
