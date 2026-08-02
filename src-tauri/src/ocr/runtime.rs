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
    platform_key_for(std::env::consts::OS, std::env::consts::ARCH)
}

fn platform_key_for(os: &str, arch: &str) -> &'static str {
    match (os, arch) {
        ("windows", "x86_64") => "windows-x64",
        ("macos", "aarch64") => "macos-aarch64",
        ("macos", "x86_64") => "macos-x86_64",
        ("linux", "x86_64") => "linux-x64",
        _ => "unsupported",
    }
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
    )?;
    verify_worker_architecture(&runtime.executable, &selection.platform)
}

fn verify_worker_architecture(path: &Path, platform: &str) -> Result<(), String> {
    let bytes = fs::read(path).map_err(|error| format!("OCR_RUNTIME_UNVERIFIED:{error}"))?;
    let valid = match platform {
        "windows-x64" => pe_machine(&bytes) == Some(0x8664),
        "linux-x64" => {
            bytes.starts_with(b"\x7fELF")
                && bytes.get(4) == Some(&2)
                && bytes.get(18..20) == Some(&[0x3e, 0x00])
        }
        "macos-aarch64" => mach_cpu(&bytes) == Some(0x0100_000c),
        "macos-x86_64" => mach_cpu(&bytes) == Some(0x0100_0007),
        _ => false,
    };
    if valid {
        Ok(())
    } else {
        Err("OCR_RUNTIME_UNVERIFIED:Architecture du worker OCR incorrecte.".to_string())
    }
}

fn pe_machine(bytes: &[u8]) -> Option<u16> {
    if !bytes.starts_with(b"MZ") || bytes.len() < 0x40 {
        return None;
    }
    let offset = u32::from_le_bytes(bytes.get(0x3c..0x40)?.try_into().ok()?) as usize;
    if bytes.get(offset..offset + 4)? != b"PE\0\0" {
        return None;
    }
    Some(u16::from_le_bytes(
        bytes.get(offset + 4..offset + 6)?.try_into().ok()?,
    ))
}

fn mach_cpu(bytes: &[u8]) -> Option<u32> {
    if bytes.get(0..4)? != [0xcf, 0xfa, 0xed, 0xfe] {
        return None;
    }
    Some(u32::from_le_bytes(bytes.get(4..8)?.try_into().ok()?))
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

    #[test]
    fn platform_selection_distinguishes_both_macos_architectures() {
        assert_eq!(platform_key_for("macos", "aarch64"), "macos-aarch64");
        assert_eq!(platform_key_for("macos", "x86_64"), "macos-x86_64");
        assert_eq!(platform_key_for("linux", "x86_64"), "linux-x64");
        assert_eq!(platform_key_for("linux", "aarch64"), "unsupported");
    }

    #[test]
    fn worker_architecture_parsers_reject_foreign_binaries() {
        let mut pe = vec![0u8; 0x48];
        pe[0..2].copy_from_slice(b"MZ");
        pe[0x3c..0x40].copy_from_slice(&(0x40u32).to_le_bytes());
        pe[0x40..0x44].copy_from_slice(b"PE\0\0");
        pe[0x44..0x46].copy_from_slice(&0x8664u16.to_le_bytes());
        assert_eq!(pe_machine(&pe), Some(0x8664));
        assert_eq!(mach_cpu(&pe), None);

        let mut arm = vec![0xcf, 0xfa, 0xed, 0xfe];
        arm.extend_from_slice(&0x0100_000cu32.to_le_bytes());
        assert_eq!(mach_cpu(&arm), Some(0x0100_000c));
    }
}
