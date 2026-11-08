use super::*;

pub(super) fn runtime_info(app: &AppHandle) -> Result<OcrRuntimeInfoV1, String> {
    let lock = parse_lock()?;
    let selected = selection(&lock)?;
    let available = runtime_available(app, &selected);
    #[cfg(target_os = "windows")]
    let native = resource_root(app)
        .ok()
        .and_then(|root| {
            let worker = root.join(&selected.executable);
            worker
                .parent()
                .and_then(|root| profile::native_selected(root, &selected).ok())
        })
        .unwrap_or(false);
    #[cfg(not(target_os = "windows"))]
    let native = false;
    let version = if native {
        "OAR 0.10.2 / ONNX Runtime 1.26.0 / FP32 CPU".into()
    } else {
        format!(
            "PaddlePaddle {} / PaddleOCR {} / PaddleX {} / ONNX Runtime {}",
            lock.versions.paddlepaddle,
            lock.versions.paddleocr,
            lock.versions.paddlex,
            lock.versions.onnxruntime
        )
    };
    Ok(OcrRuntimeInfoV1 {
        schema_version: 1,
        available,
        model: lock.model,
        runtime: if native {
            "native".into()
        } else {
            selected.runtime
        },
        runtime_version: version,
        provider: selected.provider,
        provider_fallback_reason: if native {
            None
        } else {
            selected.provider_fallback_reason
        },
        languages: lock.languages,
    })
}
