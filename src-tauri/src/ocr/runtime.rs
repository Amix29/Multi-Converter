use super::contracts::OcrRuntimeInfoV1;
use super::runtime_archive;
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::fs::{self, File};
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock};
use tauri::{AppHandle, Manager};

const RUNTIME_LOCK: &str = include_str!("../../ocr-runtime-lock.json");
const MAX_MANIFEST_BYTES: u64 = 16 * 1024 * 1024;

#[path = "runtime_files.rs"]
mod files;
#[path = "runtime_profile.rs"]
#[cfg(target_os = "windows")]
mod profile;

// Native Apple Silicon cold initialization measured 36.4 s; warm startup 1.5 s.
// The supervisor keeps checking cancellation throughout this bounded wait.
pub(super) const STARTUP_TIMEOUT: std::time::Duration = if cfg!(target_os = "macos") {
    std::time::Duration::from_secs(90)
} else {
    std::time::Duration::from_secs(30)
};

pub(super) fn configure_worker_environment(command: &mut std::process::Command) {
    // Match the OpenMP/BLAS bounds used by the native OCR memory measurements.
    let threads = std::thread::available_parallelism()
        .map(usize::from)
        .unwrap_or(1)
        .clamp(1, 4)
        .to_string();
    command
        .env("OMP_NUM_THREADS", &threads)
        .env("MKL_NUM_THREADS", &threads)
        .env("OPENBLAS_NUM_THREADS", "1");
}

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

static VERIFIED_RESOURCES: OnceLock<Mutex<Option<Result<(), String>>>> = OnceLock::new();

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

pub(super) fn selected_runtime(
    app: &AppHandle,
    canceled: &AtomicBool,
    progress: &mut dyn FnMut(&'static str, u8),
) -> Result<ResolvedRuntime, String> {
    ensure_not_canceled(canceled)?;
    let lock = parse_lock()?;
    let selection = selection(&lock)?;
    let resolved = resolve_runtime(app, &selection, canceled, progress)?;
    if !resolved.executable.is_file() || !resolved.models_dir.is_dir() {
        return Err(
            "OCR_RUNTIME_MISSING:Le moteur OCR local n’est pas installé dans cette application."
                .to_string(),
        );
    }
    ensure_not_canceled(canceled)?;
    let mut verified = VERIFIED_RESOURCES
        .get_or_init(|| Mutex::new(None))
        .lock()
        .unwrap_or_else(|error| error.into_inner());
    if let Some(result) = verified.as_ref() {
        progress("verifying-runtime", 100);
        progress("verifying-models", 100);
        result.clone()?;
        return Ok(resolved);
    }
    let result = verify_resources(
        &resolved,
        &selection,
        &lock.model_artifact,
        canceled,
        progress,
    );
    retain_verification_result(&mut verified, &result);
    result?;
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
    canceled: &AtomicBool,
    progress: &mut dyn FnMut(&'static str, u8),
) -> Result<ResolvedRuntime, String> {
    #[cfg(debug_assertions)]
    {
        if let Some(executable) = std::env::var_os("MULTI_CONVERTER_OCR_WORKER") {
            progress("extracting-runtime", 100);
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
    if let Some(executable) = direct_runtime(&root, selection) {
        // selected_runtime still verifies every file against the embedded locks.
        return Ok(ResolvedRuntime {
            executable,
            models_dir: root.join("models"),
            provider: selection.provider.clone(),
        });
    }
    let extracted = runtime_archive::ensure_extracted(
        app,
        &root,
        &selection.platform,
        runtime_archive::ArchiveExpectation {
            aggregate_sha256: &artifact.aggregate_sha256,
            file_count: artifact.file_count,
            total_bytes: artifact.total_bytes,
        },
        canceled,
        &mut |value| progress("extracting-runtime", value),
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
            && (direct_runtime(&root, selection).is_some()
                || runtime_archive::archive_path(&root, &selection.platform).is_file())
            && selection.artifact.is_some()
    })
}

fn direct_runtime(root: &Path, selection: &PlatformSelection) -> Option<PathBuf> {
    let executable = root.join(&selection.executable);
    (executable.is_file() && executable.parent()?.join("runtime-manifest.json").is_file())
        .then_some(executable)
}

fn resource_root(app: &AppHandle) -> Result<PathBuf, String> {
    #[cfg(debug_assertions)]
    {
        #[cfg(target_os = "windows")]
        {
            let direct = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join("bundled-engine-profiles/windows-x64/v3/ocr");
            if direct.is_dir() {
                return Ok(direct);
            }
        }
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
        ("linux", "x86_64") => "linux-x64",
        _ => "unsupported",
    }
}

fn verify_resources(
    runtime: &ResolvedRuntime,
    selection: &PlatformSelection,
    models_lock: &ArtifactLock,
    canceled: &AtomicBool,
    progress: &mut dyn FnMut(&'static str, u8),
) -> Result<(), String> {
    ensure_not_canceled(canceled)?;
    let runtime_root = runtime
        .executable
        .parent()
        .ok_or_else(|| "OCR_RUNTIME_UNVERIFIED:Dossier du runtime OCR invalide.".to_string())?;
    #[cfg(target_os = "windows")]
    let expected_runtime = profile::expectation(runtime_root, selection)?;
    #[cfg(not(target_os = "windows"))]
    let expected_runtime = selection
        .artifact
        .clone()
        .ok_or_else(|| "OCR_RUNTIME_UNVERIFIED:Runtime platform is not locked.".to_string())?;
    verify_content_manifest(
        runtime_root,
        &runtime_root.join("runtime-manifest.json"),
        &expected_runtime,
        canceled,
        &mut |value| progress("verifying-runtime", value),
    )?;
    verify_content_manifest(
        &runtime.models_dir,
        &runtime.models_dir.join("models-lock.json"),
        models_lock,
        canceled,
        &mut |value| progress("verifying-models", value),
    )?;
    ensure_not_canceled(canceled)?;
    verify_worker_architecture(&runtime.executable, &selection.platform, canceled)
}

fn verify_worker_architecture(
    path: &Path,
    platform: &str,
    canceled: &AtomicBool,
) -> Result<(), String> {
    ensure_not_canceled(canceled)?;
    let mut file = File::open(path).map_err(|error| format!("OCR_RUNTIME_UNVERIFIED:{error}"))?;
    let mut bytes = vec![0u8; 64 * 1024];
    let read = file
        .read(&mut bytes)
        .map_err(|error| format!("OCR_RUNTIME_UNVERIFIED:{error}"))?;
    bytes.truncate(read);
    ensure_not_canceled(canceled)?;
    let valid = match platform {
        "windows-x64" => pe_machine(&bytes) == Some(0x8664),
        "linux-x64" => {
            bytes.starts_with(b"\x7fELF")
                && bytes.get(4) == Some(&2)
                && bytes.get(18..20) == Some(&[0x3e, 0x00])
        }
        "macos-aarch64" => mach_cpu(&bytes) == Some(0x0100_000c),
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
    canceled: &AtomicBool,
    progress: &mut dyn FnMut(u8),
) -> Result<(), String> {
    ensure_not_canceled(canceled)?;
    let mut bytes = Vec::new();
    File::open(manifest_path)
        .map_err(|error| format!("OCR_RUNTIME_UNVERIFIED:{error}"))?
        .take(MAX_MANIFEST_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|error| format!("OCR_RUNTIME_UNVERIFIED:{error}"))?;
    ensure_not_canceled(canceled)?;
    if bytes.len() as u64 > MAX_MANIFEST_BYTES {
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
    let mut aggregate = Sha256::new();
    let mut listed_bytes = 0u64;
    for entry in &manifest.files {
        ensure_not_canceled(canceled)?;
        safe_relative_path(&entry.path)?;
        listed_bytes = listed_bytes.saturating_add(entry.bytes);
        aggregate.update(format!(
            "{}\0{}\0{}\n",
            entry.path, entry.bytes, entry.sha256
        ));
    }
    if listed_bytes != expected.total_bytes
        || format!("{:x}", aggregate.finalize()) != expected.aggregate_sha256
    {
        return Err("OCR_RUNTIME_UNVERIFIED:Le manifeste OCR a été modifié.".to_string());
    }
    #[cfg(target_os = "windows")]
    let retired = profile::retired_files(expected)?;
    #[cfg(not(target_os = "windows"))]
    let retired = None;
    let actual_count = files::count_regular_files(root, manifest_path, retired, canceled)?;
    if actual_count != manifest.file_count {
        return Err(
            "OCR_RUNTIME_UNVERIFIED:Le paquet OCR contient des fichiers inattendus.".to_string(),
        );
    }
    let mut total = 0u64;
    let file_count = manifest.files.len().max(1);
    for (index, entry) in manifest.files.iter().enumerate() {
        ensure_not_canceled(canceled)?;
        let relative = safe_relative_path(&entry.path)?;
        let path = root.join(relative);
        let metadata =
            fs::metadata(&path).map_err(|error| format!("OCR_RUNTIME_UNVERIFIED:{error}"))?;
        if !metadata.is_file()
            || metadata.len() != entry.bytes
            || sha256(&path, canceled)? != entry.sha256
        {
            return Err(format!(
                "OCR_RUNTIME_UNVERIFIED:Ressource OCR modifiée: {}",
                entry.path
            ));
        }
        total = total.saturating_add(metadata.len());
        progress((((index + 1) * 100) / file_count).min(100) as u8);
    }
    if total != manifest.total_bytes {
        return Err("OCR_RUNTIME_UNVERIFIED:Taille totale OCR incohérente.".to_string());
    }
    Ok(())
}

fn safe_relative_path(value: &str) -> Result<PathBuf, String> {
    crate::path_safety::resource_relative(value)
        .ok_or_else(|| "OCR_RUNTIME_UNVERIFIED:Chemin de ressource OCR dangereux.".to_string())
}

fn sha256(path: &Path, canceled: &AtomicBool) -> Result<String, String> {
    let mut file = File::open(path).map_err(|error| format!("OCR_RUNTIME_UNVERIFIED:{error}"))?;
    let mut hash = Sha256::new();
    let mut buffer = [0u8; 64 * 1024];
    loop {
        ensure_not_canceled(canceled)?;
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

fn ensure_not_canceled(canceled: &AtomicBool) -> Result<(), String> {
    if canceled.load(Ordering::SeqCst) {
        Err("OCR_CANCELLED:L’OCR a été annulé.".to_string())
    } else {
        Ok(())
    }
}

fn retain_verification_result(slot: &mut Option<Result<(), String>>, result: &Result<(), String>) {
    if !matches!(result, Err(error) if error.starts_with("OCR_CANCELLED:")) {
        *slot = Some(result.clone());
    }
}

#[cfg(test)]
#[path = "runtime_tests.rs"]
mod tests;
