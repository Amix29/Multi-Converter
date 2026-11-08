use sha2::{Digest, Sha256};
use std::{fs, io::Read, path::PathBuf};

pub fn initialize() -> Result<(), String> {
    rayon::ThreadPoolBuilder::new()
        .num_threads(2)
        .build_global()
        .map_err(|error| error.to_string())?;
    let dll = dll_path()?;
    let policy: serde_json::Value = serde_json::from_str(include_str!("../runtime-sources.json"))
        .map_err(|error| error.to_string())?;
    let expected = policy["files"]
        .as_array()
        .and_then(|files| {
            files
                .iter()
                .find(|file| file["path"] == "capi/onnxruntime.dll")
        })
        .ok_or("Missing compiled ONNX runtime provenance")?;
    let size = fs::symlink_metadata(&dll).map_err(|error| error.to_string())?;
    if !size.is_file() || Some(size.len()) != expected["bytes"].as_u64() {
        return Err("Unexpected ONNX runtime size or type".into());
    }
    let mut bytes = Vec::new();
    fs::File::open(&dll)
        .map_err(|error| error.to_string())?
        .take(size.len() + 1)
        .read_to_end(&mut bytes)
        .map_err(|error| error.to_string())?;
    if Some(format!("{:x}", Sha256::digest(bytes)).as_str()) != expected["sha256"].as_str() {
        return Err("ONNX runtime digest mismatch".into());
    }
    ort::init_from(dll)
        .map_err(|error| error.to_string())?
        .with_name("multi-converter-offline-ocr")
        .with_telemetry(false)
        .commit();
    Ok(())
}

fn dll_path() -> Result<PathBuf, String> {
    #[cfg(feature = "diagnostics")]
    if let Some(path) = std::env::var_os("MC_NATIVE_ORT_DLL") {
        return Ok(path.into());
    }
    std::env::current_exe()
        .map_err(|error| error.to_string())?
        .parent()
        .map(|parent| parent.join("onnxruntime.dll"))
        .ok_or_else(|| "Missing local runtime directory".into())
}
