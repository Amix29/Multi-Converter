# Windows offline OCR worker

Rust CPU sidecar for all five `PP-OCRv6_medium` modules. ONNX Runtime 1.26.0
loads from the worker directory with a compiled SHA-256 check; telemetry and
model/binary auto-download features are disabled. The normal build ignores the
diagnostic DLL/trace environment variables. `diagnostics` is opt-in and is not
used for the shipped worker.

Models use the pinned official full-precision ONNX serialization. A four-plane
byte shuffle improves installer compression without changing any value. The
worker restores each bounded model in memory, verifies its original compiled
SHA-256 and passes the exact bytes to ONNX. It creates no decoded-model cache.
The original 18,708-character dictionary is independently hash-checked.

The vendored core retains upstream Apache-2.0 notices. Its changes align linear
resize, perspective crop, recognition width rounding and UVDoc full-resolution
input with the reference. See `vendor/oar-ocr-core/MULTI_CONVERTER.md` and the
measured [lot 4 ledger](../../../docs/ENGINE_REDUCTION_LOT4.md).

## Reproduction on Windows x64

Use Rust 1.96.0 and Python 3.12.10. Restore the original locked OCR model tree
and `src-tauri/ocr-resources/runtime/windows-x64.zip` through the existing project
preparation flow. These remain provenance/recovery sources and are not bundled
as Python runtimes in the new Windows installer.

1. Run `python tools/ocr-runtime/native-worker/download-sources.py --cache <cache>`.
   Existing sources are reused only after hash verification. Downloads happen
   explicitly during preparation, never during recognition.
   Run `python tools/ocr-runtime/native-worker/prepare-microsoft-runtime.py --cache <cache>/microsoft`
   to decode the pinned signed Microsoft package without executing it. This
   supplies MSVCP140_1.dll 14.51.36247.0, matching the existing MSVC family,
   plus the original source-package metadata containing Microsoft's license URL.
2. With PyYAML 6.0.2 available, run
   `python tools/ocr-runtime/native-worker/prepare-models.py --onnx-source <cache>/models --output src-tauri/bundled-engine-profiles/windows-x64/native-v1/ocr/models --shuffle`.
   A validated interrupted preparation can use `--resume`; changed files are
   never overwritten. Transformations are inverted and compared byte for byte.
3. Set `CARGO_TARGET_DIR` to an existing suitable build cache, then run
   `cargo build --locked --release --manifest-path tools/ocr-runtime/native-worker/Cargo.toml --bin mc-offline-ocr`.
4. Curate the source-built binary with
   `npm run prepare:windows-native-ocr -- --write-lock --worker <target>/release/mc-offline-ocr.exe --ort-source <cache>/onnxruntime --microsoft-source <cache>/microsoft`.
   This links verified sources or decodes only required Microsoft DLL/notices
   from the original ZIP. It retains legacy notices and actual Rust dependency
   notices, with pinned supplemental texts where package archives omit them.
5. Run `npm run prepare:windows-native-ocr -- --check`, the real OCR corpus,
   lifecycle test and Rust/packaging gates. Review the generated embedded lock.
   A rebuild on a different compiler/host can change executable identity; curate
   the reviewed source build before compiling the desktop app.
   With the existing build-tool dependency pefile 2023.2.7, run
   `python tools/ocr-runtime/native-worker/audit-runtime-imports.py --runtime src-tauri/bundled-engine-profiles/windows-x64/native-v1/ocr/runtime/windows-x64 --report tmp/native-ocr-imports.json`.
   It rejects Microsoft redistributables resolved from the host instead of the
   runtime folder, including delayed imports. This is not a clean-OS launch test.

The Windows quality-gate workflow performs these steps after restoring the
original provenance inputs, and checks worker formatting, tests, Clippy and
lifecycle behavior before the complete desktop gate. Its workflow contract is
checked locally; a successful GitHub-hosted run must be recorded separately.
The publication workflow still requires the reviewed OCR inputs to be staged;
this local candidate does not establish public-release readiness.

`test-lifecycle.py --worker <exe> --models <models> --report <json>` verifies
failure recovery, cancellation, source/output protection, oversized input and
absence of a diagnostic DLL fallback. It uses only the synthetic corpus.
`cargo test --release --manifest-path ... --bin mc-offline-ocr` checks unaligned
shuffle tails; `cargo clippy --release --all-targets -- -D warnings` checks the
worker. Keep the build cache outside the source tree and reuse it.

The global original locks and macOS/Linux resources retain their identities.
Windows runtime/model profile expectations are compiled into the Tauri app;
modified or unexpected resources fail verification before inference.
