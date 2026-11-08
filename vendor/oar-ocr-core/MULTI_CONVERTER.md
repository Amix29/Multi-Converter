# Windows OCR core dependency

This is oar-ocr-core 0.10.2, Apache-2.0, from the crates.io registry. Upstream:
https://github.com/GreatV/oar-ocr, commit
`16ee0599a12a477178b8495918f99e1ed92e5e4e`, subdirectory `oar-ocr-core`.
The upstream root LICENSE is retained. This crate is used only by
`tools/ocr-runtime/native-worker`, the isolated Windows CPU sidecar.

Local changes: non-antialiased half-pixel linear resampling for detection,
classification and recognition, replacing antialiased downsampling; per-image
recognition width truncation before batch padding; full-resolution UVDoc input
instead of the adapter's 512x512 default; and perspective crop with OpenCV's
double homography, -0.75 cubic kernel, 1/32 coordinate table, signed 15-bit
weights, border replication and output truncation. The integer conventions are
based on OpenCV 4.10 `resize.cpp` and `imgwarp.cpp`:
https://github.com/opencv/opencv/blob/4.10.0/modules/imgproc/src/resize.cpp
https://github.com/opencv/opencv/blob/4.10.0/modules/imgproc/src/imgwarp.cpp
Their BSD-3-Clause notice is retained separately. Resize and crop have independent
pixel comparisons against OpenCV; the initial Japanese regression was rejected
and fixed through UVDoc resolution, without changing recognized text.

No text correction, dictionary substitution, model precision reduction or
quality-threshold relaxation is applied. See `docs/ENGINE_REDUCTION_LOT4.md` for
measured results and production adoption status.
