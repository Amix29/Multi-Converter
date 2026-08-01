use super::contracts::OcrRuntimeInfoV1;
use super::runtime_archive;
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::fs::{self, File};
use std::io::Read;
use std::path::{Component, Path, PathBuf};
use std::sync::OnceLock;
use tauri::{AppHandle, Manager};

const RUNTIME_LOCK: &str = include_str!("../../ocr-runtime-lock.json");

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeLock {
    model: String,
    versions: RuntimeVersions,
    platform_selections: Vec<PlatformSelection>,
    languages: Vec<String>,
    model_artifact: ArtifactLock,
}

#[derive(Debug, Deserialize)]
struct RuntimeVersions {
    paddlepaddle: String,
    paddleocr: String,
    paddlex: String,
    onnxruntime: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PlatformSelection {
    platform: String,
    runtime: String,
    provider: String,
    provider_fallback_reason: Option<String>,
    executable: String,
    artifact: Option<ArtifactLock>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ArtifactLock {
    file_count: usize,
    total_bytes: u64,
    aggregate_sha256: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ContentManifest {
    file_count: usize,
    total_bytes: u64,
    aggregate_sha256: String,
    files: Vec<ContentFile>,
}

#[derive(Debug, Deserialize)]
struct ContentFile {
    path: String,
    bytes: u64,
    sha256: String,
}

static VERIFIED_RESOURCES: OnceLock<Result<(), String>> = OnceLock::new();

pub(super) struct ResolvedRuntime {
    pub executable: PathBuf,
    pub models_dir: PathBuf,
    pub provider: String,
}

pub(super) fn runtime_info(app: &AppHandle) -> Result<OcrRuntimeInfoV1, String> {
    let lock = parse_lock()?;
    let selection = selection(&lock)?;
    let available = runtime_available(app, &selection);
    Ok(OcrRuntimeInfoV1 {
        schema_version: 1,
        available,
        model: lock.model,
        runtime: selection.runtime,
        runtime_version: format!(
            "PaddlePaddle {} / PaddleOCR {} / PaddleX {} / ONNX Runtime {}",
            lock.versions.paddlepaddle,
            lock.versions.paddleocr,
            lock.versions.paddlex,
            lock.versions.onnxruntime
        ),
        provider: selection.provider,
        provider_fallback_reason: selection.provider_fallback_reason,
        languages: lock.languages,
    })
}

pub(super) fn selected_runtime(app: &AppHandle) -> Result<ResolvedRuntime, String> {
    let lock = parse_lock()?;
    let selection = selection(&lock)?;
    let resolved = resolve_runtime(app, &selection)?;
    if !resolved.executable.is_file() || !resolved.models_dir.is_dir() {
        return Err(
            "OCR_RUNTIME_MISSING:Le moteur OCR local n’est pas installé dans cette application."
                .to_string(),
        );
    }
    VERIFIED_RESOURCES
        .get_or_init(|| verify_resources(&resolved, &selection, &lock.model_artifact))
        .clone()?;
    Ok(resolved)
}

fn parse_lock() -> Result<RuntimeLock, String> {
    serde_json::from_str(RUNTIME_LOCK).map_err(|error| format!("OCR_RUNTIME_LOCK:{error}"))
}

fn selection(lock: &RuntimeLock) -> Result<PlatformSelection, String> {
    let platform = platform_key();
    lock.platform_selections
        .iter()
        .find(|selection| selection.platform == platform)
        .cloned()
        .ok_or_else(|| format!("OCR_PLATFORM_UNSUPPORTED:{platform}"))
}

fn resolve_runtime(
    app: &AppHandle,
    selection: &PlatformSelection,
) -> Result<ResolvedRuntime, String> {
    #[cfg(debug_assertions)]
    {
        if let Some(executable) = std::env::var_os("MULTI_CONVERTER_OCR_WORKER") {
            return Ok(ResolvedRuntime {
                executable: PathBuf::from(executable),
                models_dir: std::env::var_os("MULTI_CONVERTER_OCR_MODELS")
                    .map(PathBuf::from)
                    .unwrap_or_else(|| PathBuf::from("ocr-models")),
                provider: selection.provider.clone(),
            });
        }
    }
    let root = resource_root(app)?;
    let artifact = selection.artifact.as_ref().ok_or_else(|| {
        "OCR_RUNTIME_UNVERIFIED:Le runtime de cette plateforme n’est pas verrouillé.".to_string()
    })?;
    let extracted = runtime_archive::ensure_extracted(
        app,
        &root,
        &selection.platform,
        &artifact.aggregate_sha256,
        artifact.file_count,
        artifact.total_bytes,
    )?;
    let executable_name = Path::new(&selection.executable)
        .file_name()
        .ok_or_else(|| "OCR_RUNTIME_LOCK:Nom d’exécutable invalide.".to_string())?;
    Ok(ResolvedRuntime {
        executable: extracted.join(executable_name),
        models_dir: root.join("models"),
        provider: selection.provider.clone(),
    })
}

fn runtime_available(app: &AppHandle, selection: &PlatformSelection) -> bool {
    #[cfg(debug_assertions)]
    if let Some(executable) = std::env::var_os("MULTI_CONVERTER_OCR_WORKER") {
        let models = std::env::var_os("MULTI_CONVERTER_OCR_MODELS")
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from("ocr-models"));
        return PathBuf::from(executable).is_file() && models.is_dir();
    }
    resource_root(app).is_ok_and(|root| {
        root.join("models").is_dir()
            && runtime_archive::archive_path(&root, &selection.platform).is_file()
            && selection.artifact.is_some()
    })
}

fn resource_root(app: &AppHandle) -> Result<PathBuf, String> {
    #[cfg(debug_assertions)]
    {
        let local = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("ocr-resources");
        if local.is_dir() {
            return Ok(local);
        }
    }
    app.path()
        .resource_dir()
        .map(|path| path.join("ocr"))
        .map_err(|error| format!("OCR_RESOURCE_DIR:{error}"))
}

fn platform_key() -> &'static str {
    #[cfg(target_os = "windows")]
    return "windows-x64";
    #[cfg(target_os = "macos")]
    return "macos-universal";
    #[cfg(target_os = "linux")]
    return "linux-x64";
    #[allow(unreachable_code)]
    "unsupported"
}

fn verify_resources(
    runtime: &ResolvedRuntime,
    selection: &PlatformSelection,
    models_lock: &ArtifactLock,
) -> Result<(), String> {
    let runtime_root = runtime
        .executable
        .parent()
        .ok_or_else(|| "OCR_RUNTIME_UNVERIFIED:Dossier du runtime OCR invalide.".to_string())?;
    let expected_runtime = selection.artifact.as_ref().ok_or_else(|| {
        "OCR_RUNTIME_UNVERIFIED:Le runtime de cette plateforme n’est pas verrouillé.".to_string()
    })?;
    verify_content_manifest(
        runtime_root,
        &runtime_root.join("runtime-manifest.json"),
        expected_runtime,
    )?;
    verify_content_manifest(
        &runtime.models_dir,
        &runtime.models_dir.join("models-lock.json"),
        models_lock,
    )
}

fn verify_content_manifest(
    root: &Path,
    manifest_path: &Path,
    expected: &ArtifactLock,
) -> Result<(), String> {
    let bytes =
        fs::read(manifest_path).map_err(|error| format!("OCR_RUNTIME_UNVERIFIED:{error}"))?;
    if bytes.len() > 16 * 1024 * 1024 {
        return Err("OCR_RUNTIME_UNVERIFIED:Manifeste OCR trop volumineux.".to_string());
    }
    let manifest: ContentManifest = serde_json::from_slice(&bytes)
        .map_err(|error| format!("OCR_RUNTIME_UNVERIFIED:{error}"))?;
    if manifest.file_count != expected.file_count
        || manifest.total_bytes != expected.total_bytes
        || manifest.aggregate_sha256 != expected.aggregate_sha256
        || manifest.files.len() != expected.file_count
    {
        return Err(
            "OCR_RUNTIME_UNVERIFIED:Le contenu OCR ne correspond pas au verrou embarqué."
                .to_string(),
        );
    }
    let actual_count = count_regular_files(root, manifest_path)?;
    if actual_count != manifest.file_count {
        return Err(
            "OCR_RUNTIME_UNVERIFIED:Le paquet OCR contient des fichiers inattendus.".to_string(),
        );
    }
    let mut total = 0u64;
    for entry in &manifest.files {
        let relative = safe_relative_path(&entry.path)?;
        let path = root.join(relative);
        let metadata =
            fs::metadata(&path).map_err(|error| format!("OCR_RUNTIME_UNVERIFIED:{error}"))?;
        if !metadata.is_file() || metadata.len() != entry.bytes || sha256(&path)? != entry.sha256 {
            return Err(format!(
                "OCR_RUNTIME_UNVERIFIED:Ressource OCR modifiée: {}",
                entry.path
            ));
        }
        total = total.saturating_add(metadata.len());
    }
    if total != manifest.total_bytes {
        return Err("OCR_RUNTIME_UNVERIFIED:Taille totale OCR incohérente.".to_string());
    }
    Ok(())
}

fn safe_relative_path(value: &str) -> Result<PathBuf, String> {
    let path = Path::new(value);
    if path.is_absolute()
        || path
            .components()
            .any(|component| !matches!(component, Component::Normal(_)))
    {
        return Err("OCR_RUNTIME_UNVERIFIED:Chemin de ressource OCR dangereux.".to_string());
    }
    Ok(path.to_path_buf())
}

fn count_regular_files(root: &Path, manifest_path: &Path) -> Result<usize, String> {
    let mut count = 0usize;
    let mut pending = vec![root.to_path_buf()];
    while let Some(directory) = pending.pop() {
        for entry in
            fs::read_dir(directory).map_err(|error| format!("OCR_RUNTIME_UNVERIFIED:{error}"))?
        {
            let entry = entry.map_err(|error| format!("OCR_RUNTIME_UNVERIFIED:{error}"))?;
            let path = entry.path();
            let kind = entry
                .file_type()
                .map_err(|error| format!("OCR_RUNTIME_UNVERIFIED:{error}"))?;
            if kind.is_dir() {
                pending.push(path);
            } else if kind.is_file() {
                if path != manifest_path {
                    count += 1;
                }
            } else {
                return Err("OCR_RUNTIME_UNVERIFIED:Entrée OCR non régulière.".to_string());
            }
        }
    }
    Ok(count)
}

fn sha256(path: &Path) -> Result<String, String> {
    let mut file = File::open(path).map_err(|error| format!("OCR_RUNTIME_UNVERIFIED:{error}"))?;
    let mut hash = Sha256::new();
    let mut buffer = [0u8; 64 * 1024];
    loop {
        let read = file
            .read(&mut buffer)
            .map_err(|error| format!("OCR_RUNTIME_UNVERIFIED:{error}"))?;
        if read == 0 {
            break;
        }
        hash.update(&buffer[..read]);
    }
    Ok(format!("{:x}", hash.finalize()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn content_verification_detects_a_modified_resource() {
        let temp = tempfile::tempdir().unwrap();
        let payload = temp.path().join("worker.bin");
        fs::write(&payload, b"trusted").unwrap();
        let digest = sha256(&payload).unwrap();
        let manifest_path = temp.path().join("runtime-manifest.json");
        fs::write(
            &manifest_path,
            serde_json::json!({
                "fileCount": 1,
                "totalBytes": 7,
                "aggregateSha256": "locked",
                "files": [{ "path": "worker.bin", "bytes": 7, "sha256": digest }]
            })
            .to_string(),
        )
        .unwrap();
        let expected = ArtifactLock {
            file_count: 1,
            total_bytes: 7,
            aggregate_sha256: "locked".to_string(),
        };
        verify_content_manifest(temp.path(), &manifest_path, &expected).unwrap();
        fs::write(&payload, b"altered").unwrap();
        assert!(verify_content_manifest(temp.path(), &manifest_path, &expected).is_err());
    }

    #[test]
    fn manifest_paths_must_remain_relative() {
        assert!(safe_relative_path("models/text/inference.json").is_ok());
        assert!(safe_relative_path("../outside").is_err());
        assert!(safe_relative_path("C:/outside").is_err());
    }
}
