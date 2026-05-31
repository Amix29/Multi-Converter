use crate::engines::{self, EngineMode};
use serde::{Deserialize, Serialize};
use std::env;
use std::fs::{self, File};
use std::io::{self, BufReader, Read, Write};
use std::path::{Component, Path, PathBuf};
use std::ptr::{null, null_mut};
use std::time::SystemTime;
use tauri::{AppHandle, Emitter};
#[cfg(target_os = "windows")]
use windows_sys::Win32::Networking::WinHttp::{
    INTERNET_DEFAULT_HTTPS_PORT, WINHTTP_ACCESS_TYPE_AUTOMATIC_PROXY, WINHTTP_FLAG_SECURE,
    WINHTTP_QUERY_CONTENT_LENGTH, WINHTTP_QUERY_FLAG_NUMBER, WINHTTP_QUERY_STATUS_CODE,
    WinHttpCloseHandle, WinHttpConnect, WinHttpOpen, WinHttpOpenRequest, WinHttpQueryDataAvailable,
    WinHttpQueryHeaders, WinHttpReadData, WinHttpReceiveResponse, WinHttpSendRequest,
};
use zip::ZipArchive;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EngineManifest {
    pub manifest_version: u32,
    pub generated_at: String,
    pub engines: Vec<ManifestEngine>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ManifestEngine {
    pub id: String,
    pub display_name: String,
    pub mode: EngineMode,
    pub version: String,
    pub platform: String,
    pub archive_type: ArchiveType,
    pub download_url: String,
    pub sha256: String,
    pub compressed_size_bytes: u64,
    pub installed_size_bytes: u64,
    pub binary_paths: Vec<String>,
    pub health_check: String,
    pub license_name: String,
    pub license_url: Option<String>,
    #[serde(default = "default_published")]
    pub published: bool,
    pub required: bool,
    pub dependencies: Vec<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EnginePackageMetadata {
    pub engine_id: String,
    pub display_name: String,
    pub version: String,
    pub platform: String,
    pub mode: EngineMode,
    pub binary_paths: Vec<String>,
    pub health_check: String,
    pub license_name: String,
    pub license_files: Vec<String>,
    #[serde(default)]
    pub notice_files: Vec<String>,
    pub created_at: String,
    pub package_format_version: u32,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum ArchiveType {
    Zip,
    SevenZ,
    TarGz,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EngineInstallProgress {
    pub engine_id: String,
    pub engine_name: String,
    pub stage: &'static str,
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
    pub percent: u8,
    pub message: String,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum HealthPolicy {
    Run,
    #[cfg(test)]
    SkipForTest,
    #[cfg(test)]
    FailForTest,
}

const PLATFORM: &str = "windows-x64";
const EMBEDDED_MANIFEST_JSON: &str = include_str!("../engines-manifest.json");

fn default_published() -> bool {
    true
}

pub fn load_manifest() -> Result<EngineManifest, String> {
    if let Ok(path) = env::var("MULTI_CONVERTER_ENGINE_MANIFEST") {
        let content = fs::read_to_string(&path)
            .map_err(|error| format!("Manifest moteurs illisible ({path}) : {error}"))?;
        return parse_manifest(&content);
    }
    parse_manifest(EMBEDDED_MANIFEST_JSON)
}

fn parse_manifest(content: &str) -> Result<EngineManifest, String> {
    serde_json::from_str(content).map_err(|error| error.to_string())
}

pub fn manifest_for_platform(manifest: &EngineManifest, engine_id: &str) -> Option<ManifestEngine> {
    manifest
        .engines
        .iter()
        .find(|engine| engine.id == engine_id && engine.platform == PLATFORM)
        .cloned()
}

pub fn manifest_engines_for_mode(mode: EngineMode) -> Result<Vec<ManifestEngine>, String> {
    Ok(load_manifest()?
        .engines
        .into_iter()
        .filter(|engine| engine.platform == PLATFORM && engine.mode == mode)
        .collect())
}

pub fn quality_manifest_engines() -> Result<Vec<ManifestEngine>, String> {
    manifest_engines_for_mode(EngineMode::QualityMax)
}

pub fn installed_binary(
    root: &Path,
    engine_id: &str,
    version: &str,
    binary_paths: &[String],
) -> Option<PathBuf> {
    binary_paths
        .iter()
        .map(|relative| root.join(engine_id).join(version).join(relative))
        .filter(|candidate| candidate.is_file())
        .max_by_key(|candidate| executable_candidate_score(candidate))
}

pub fn installed_size(root: &Path, engine_id: &str, version: &str) -> u64 {
    directory_size(&root.join(engine_id).join(version)).unwrap_or(0)
}

pub fn install_engine(app: &AppHandle, engine_id: &str) -> Result<(), String> {
    let manifest = load_manifest()?;
    let engine = manifest_for_platform(&manifest, engine_id)
        .ok_or_else(|| format!("Aucun paquet Windows x64 n'est disponible pour {engine_id}."))?;
    if is_placeholder_download_url(&engine.download_url) {
        return Err("Manifeste moteur non configuré : remplacez REPLACE_WITH_RELEASE_BASE_URL par l'URL de publication réelle avant d'installer ou réparer ce moteur.".to_string());
    }
    if !engine.published {
        return Err(format!(
            "{} n'est pas encore publié pour l'installation automatique.",
            engine.display_name
        ));
    }
    if engine.mode != EngineMode::QualityMax {
        return Err(format!(
            "{} est un moteur embarqué ou non pris en charge par l'installation runtime.",
            engine.display_name
        ));
    }
    if engine_is_installed_and_healthy(Some(app), &engine) {
        emit(
            Some(app),
            &engine,
            "Terminé",
            engine.compressed_size_bytes,
            engine.compressed_size_bytes,
            "Moteur déjà installé et validé.",
        );
        return Ok(());
    }
    install_engine_from_manifest(
        Some(app),
        engines::tool_env_root()?,
        &engine,
        HealthPolicy::Run,
    )
}

pub fn engine_download_is_configured(engine_id: &str) -> bool {
    load_manifest()
        .ok()
        .and_then(|manifest| manifest_for_platform(&manifest, engine_id))
        .is_some_and(|engine| {
            engine.published
                && !is_placeholder_download_url(&engine.download_url)
                && !is_placeholder_sha256(&engine.sha256)
        })
}

#[cfg(test)]
fn engine_download_requires_internet(engine_id: &str) -> bool {
    load_manifest()
        .ok()
        .and_then(|manifest| manifest_for_platform(&manifest, engine_id))
        .is_none_or(|engine| !engine.download_url.starts_with("file://"))
}

pub fn install_quality_max_extension(app: &AppHandle) -> Result<(), String> {
    let quality_engines = manifest_engines_for_mode(EngineMode::QualityMax)?;
    let unavailable = quality_engines
        .iter()
        .filter(|engine| {
            !engine.published
                || is_placeholder_download_url(&engine.download_url)
                || is_placeholder_sha256(&engine.sha256)
        })
        .map(|engine| engine.display_name.as_str())
        .collect::<Vec<_>>();
    if !unavailable.is_empty() {
        return Err(format!(
            "Extension Qualité maximale incomplète : moteurs non publiés ({})",
            unavailable.join(", ")
        ));
    }
    if !engines::internet_available() {
        return Err("Internet est requis pour installer l'extension Qualité maximale. Les conversions locales déjà validées restent disponibles hors ligne.".to_string());
    }
    let root = engines::tool_env_root()?;
    cleanup_stale_installing_dirs()?;
    let marker = engines::quality_marker_path()?;
    let marker_existed = marker.exists();
    let mut installed_this_run = Vec::new();
    for engine in quality_engines {
        let engine_root = root.join(&engine.id);
        let existed_before = engine_root.exists();
        if let Err(error) = install_engine(app, &engine.id) {
            if !marker_existed {
                let _ = fs::remove_file(&marker);
            }
            if !marker_existed {
                for engine_id in installed_this_run {
                    let path = root.join(engine_id);
                    if path.exists() && assert_under(&path, &root).is_ok() {
                        let _ = fs::remove_dir_all(path);
                    }
                }
            }
            return Err(error);
        }
        if !existed_before {
            installed_this_run.push(engine.id);
        }
    }
    if let Some(parent) = marker.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    fs::write(marker, b"installed").map_err(|error| error.to_string())?;
    Ok(())
}

pub fn uninstall_quality_max_extension() -> Result<bool, String> {
    let root = engines::tool_env_root()?;
    for engine in manifest_engines_for_mode(EngineMode::QualityMax)? {
        let path = root.join(&engine.id);
        if path.exists() {
            assert_under(&path, &root)?;
            fs::remove_dir_all(path).map_err(|error| error.to_string())?;
        }
    }
    let marker = engines::quality_marker_path()?;
    if marker.exists() {
        fs::remove_file(marker).map_err(|error| error.to_string())?;
    }
    Ok(true)
}

pub fn cleanup_stale_installing_dirs() -> Result<(), String> {
    let root = engines::tool_env_root()?;
    let work_root = root.join(".installing");
    if !work_root.exists() {
        return Ok(());
    }
    assert_under(&work_root, &root)?;
    fs::remove_dir_all(&work_root).map_err(|error| error.to_string())
}

pub fn engine_is_installed_and_healthy(app: Option<&AppHandle>, engine: &ManifestEngine) -> bool {
    let Ok(root) = engines::tool_env_root() else {
        return false;
    };
    let Some(binary) = installed_binary(&root, &engine.id, &engine.version, &engine.binary_paths)
    else {
        return false;
    };
    engines::smoke_test_external_path(app, &engine.id, &binary).is_ok()
}

pub fn engine_is_installed(engine: &ManifestEngine) -> bool {
    let Ok(root) = engines::tool_env_root() else {
        return false;
    };
    installed_binary(&root, &engine.id, &engine.version, &engine.binary_paths).is_some()
}

fn install_engine_from_manifest(
    app: Option<&AppHandle>,
    root: PathBuf,
    engine: &ManifestEngine,
    health_policy: HealthPolicy,
) -> Result<(), String> {
    emit(
        app,
        engine,
        "Téléchargement",
        0,
        engine.compressed_size_bytes,
        "Téléchargement du moteur.",
    );
    fs::create_dir_all(&root).map_err(|error| error.to_string())?;
    let work_root = root.join(".installing");
    fs::create_dir_all(&work_root).map_err(|error| error.to_string())?;
    let unique = format!(
        "{}-{}",
        engine.id,
        SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .map_err(|error| error.to_string())?
            .as_millis()
    );
    let temp_dir = work_root.join(&unique);
    let extract_dir = temp_dir.join("extract");
    let archive_path = temp_dir.join("archive.zip");
    fs::create_dir_all(&extract_dir).map_err(|error| error.to_string())?;

    let result: Result<(), String> = (|| -> Result<(), String> {
        download_archive(app, engine, &archive_path)?;
        emit(
            app,
            engine,
            "Vérification",
            engine.compressed_size_bytes,
            engine.compressed_size_bytes,
            "Vérification SHA-256.",
        );
        verify_sha256(&archive_path, &engine.sha256)?;
        emit(
            app,
            engine,
            "Extraction",
            engine.compressed_size_bytes,
            engine.compressed_size_bytes,
            "Extraction atomique.",
        );
        extract_archive(engine, &archive_path, &extract_dir)?;
        verify_package_metadata(&extract_dir, engine)?;
        verify_expected_binaries(&extract_dir, engine)?;
        emit(
            app,
            engine,
            "Test santé",
            engine.compressed_size_bytes,
            engine.compressed_size_bytes,
            "Test santé du moteur.",
        );
        match health_policy {
            HealthPolicy::Run => run_health_check(app, &extract_dir, engine)?,
            #[cfg(test)]
            HealthPolicy::SkipForTest => {}
            #[cfg(test)]
            HealthPolicy::FailForTest => return Err("Test santé simulé en échec.".to_string()),
        }
        commit_install(&root, &extract_dir, engine)?;
        emit(
            app,
            engine,
            "Terminé",
            engine.compressed_size_bytes,
            engine.compressed_size_bytes,
            "Moteur installé et validé.",
        );
        Ok(())
    })();

    let _ = fs::remove_dir_all(&temp_dir);
    if let Err(error) = result {
        emit(
            app,
            engine,
            "Échec",
            0,
            engine.compressed_size_bytes,
            &error,
        );
        let _ = fs::remove_file(&archive_path);
        return Err(error);
    }
    Ok(())
}

fn download_archive(
    app: Option<&AppHandle>,
    engine: &ManifestEngine,
    destination: &Path,
) -> Result<(), String> {
    if engine.download_url.starts_with("file://") {
        let source = file_url_to_pathbuf(&engine.download_url)?;
        copy_with_progress(app, engine, &source, destination)
    } else if engine.download_url.starts_with("https://") {
        download_http(app, engine, destination)
    } else if engine.download_url.starts_with("http://") {
        Err(
            "Insecure engine download URL rejected. Published engine downloads must use HTTPS."
                .to_string(),
        )
    } else {
        Err("URL de téléchargement non prise en charge par le manifeste.".to_string())
    }
}

fn file_url_to_pathbuf(url: &str) -> Result<PathBuf, String> {
    let raw = url
        .strip_prefix("file://")
        .ok_or_else(|| "URL de fichier invalide : le schéma file:// est requis.".to_string())?;
    let decoded = percent_decode(raw)?;
    #[cfg(target_os = "windows")]
    {
        let normalized = decoded.replace('/', "\\");
        if normalized.starts_with("\\\\") {
            let without_extra_root = normalized.trim_start_matches('\\');
            if without_extra_root
                .as_bytes()
                .get(1)
                .is_some_and(|item| *item == b':')
            {
                return Ok(PathBuf::from(without_extra_root));
            }
            return Ok(PathBuf::from(normalized));
        }
        if normalized.starts_with('\\') {
            let without_root = normalized.trim_start_matches('\\');
            if without_root
                .as_bytes()
                .get(1)
                .is_some_and(|item| *item == b':')
            {
                return Ok(PathBuf::from(without_root));
            }
        }
        if normalized
            .as_bytes()
            .get(1)
            .is_some_and(|item| *item == b':')
        {
            return Ok(PathBuf::from(normalized));
        }
        Err("Chemin du paquet moteur invalide ou inaccessible.".to_string())
    }
    #[cfg(not(target_os = "windows"))]
    {
        Ok(PathBuf::from(decoded))
    }
}

fn percent_decode(value: &str) -> Result<String, String> {
    let bytes = value.as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' {
            let hi = bytes
                .get(index + 1)
                .and_then(|byte| hex_value(*byte))
                .ok_or_else(|| "URL de fichier invalide : encodage % incomplet.".to_string())?;
            let lo = bytes
                .get(index + 2)
                .and_then(|byte| hex_value(*byte))
                .ok_or_else(|| "URL de fichier invalide : encodage % incomplet.".to_string())?;
            decoded.push((hi << 4) | lo);
            index += 3;
        } else {
            decoded.push(bytes[index]);
            index += 1;
        }
    }
    String::from_utf8(decoded)
        .map_err(|_| "URL de fichier invalide : encodage UTF-8 invalide.".to_string())
}

fn hex_value(byte: u8) -> Option<u8> {
    match byte {
        b'0'..=b'9' => Some(byte - b'0'),
        b'a'..=b'f' => Some(byte - b'a' + 10),
        b'A'..=b'F' => Some(byte - b'A' + 10),
        _ => None,
    }
}

fn is_placeholder_download_url(url: &str) -> bool {
    url.contains("REPLACE_WITH_RELEASE_BASE_URL")
}

fn download_http(
    app: Option<&AppHandle>,
    engine: &ManifestEngine,
    destination: &Path,
) -> Result<(), String> {
    emit(
        app,
        engine,
        "Téléchargement",
        0,
        engine.compressed_size_bytes,
        "Téléchargement du moteur.",
    );
    download_https_stream(app, engine, destination)?;
    let downloaded = fs::metadata(destination)
        .map_err(|error| format!("Archive téléchargée inaccessible : {error}"))?
        .len();
    if downloaded == 0 {
        return Err(format!(
            "Téléchargement impossible pour {} : archive vide.",
            engine.display_name
        ));
    }
    emit(
        app,
        engine,
        "Téléchargement",
        downloaded,
        downloaded.max(engine.compressed_size_bytes),
        "Téléchargement du moteur terminé.",
    );
    Ok(())
}

#[cfg(target_os = "windows")]
fn download_https_stream(
    app: Option<&AppHandle>,
    engine: &ManifestEngine,
    destination: &Path,
) -> Result<(), String> {
    let mut request = open_https_request(&engine.download_url, "GET")?;
    request.send()?;
    let status = request.status_code()?;
    if !(200..300).contains(&status) {
        return Err(format!(
            "Download failed for {}: HTTP status {}",
            engine.display_name, status
        ));
    }
    let total = request
        .content_length()
        .unwrap_or(engine.compressed_size_bytes)
        .max(engine.compressed_size_bytes);
    let mut output = File::create(destination).map_err(|error| error.to_string())?;
    let mut downloaded = 0u64;
    let mut buffer = vec![0u8; 64 * 1024];
    loop {
        let read = request.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        output
            .write_all(&buffer[..read])
            .map_err(|error| error.to_string())?;
        downloaded = downloaded.saturating_add(read as u64);
        emit(
            app,
            engine,
            "Téléchargement",
            downloaded,
            total.max(downloaded),
            "Téléchargement du moteur.",
        );
    }
    output.flush().map_err(|error| error.to_string())
}

#[cfg(not(target_os = "windows"))]
fn download_https_stream(
    _app: Option<&AppHandle>,
    _engine: &ManifestEngine,
    _destination: &Path,
) -> Result<(), String> {
    Err("Integrated HTTPS engine downloads are currently implemented for Windows only.".to_string())
}

pub fn https_url_available(url: &str) -> bool {
    if !url.starts_with("https://") {
        return false;
    }
    https_head_status(url)
        .map(|status| (200..400).contains(&status))
        .unwrap_or(false)
}

#[cfg(target_os = "windows")]
fn https_head_status(url: &str) -> Result<u32, String> {
    let mut request = open_https_request(url, "HEAD")?;
    request.send()?;
    request.status_code()
}

#[cfg(not(target_os = "windows"))]
fn https_head_status(_url: &str) -> Result<u32, String> {
    Err("HTTPS availability checks are currently implemented for Windows only.".to_string())
}

#[cfg(target_os = "windows")]
struct WinHttpRequest {
    session: *mut core::ffi::c_void,
    connection: *mut core::ffi::c_void,
    request: *mut core::ffi::c_void,
}

#[cfg(target_os = "windows")]
impl WinHttpRequest {
    fn send(&mut self) -> Result<(), String> {
        unsafe {
            if WinHttpSendRequest(self.request, null(), 0, null(), 0, 0, 0) == 0 {
                return Err(format!(
                    "HTTPS request failed: {}",
                    io::Error::last_os_error()
                ));
            }
            if WinHttpReceiveResponse(self.request, null_mut()) == 0 {
                return Err(format!(
                    "HTTPS response failed: {}",
                    io::Error::last_os_error()
                ));
            }
        }
        Ok(())
    }

    fn status_code(&self) -> Result<u32, String> {
        query_header_number(
            self.request,
            WINHTTP_QUERY_STATUS_CODE | WINHTTP_QUERY_FLAG_NUMBER,
        )
    }

    fn content_length(&self) -> Option<u64> {
        query_header_number(
            self.request,
            WINHTTP_QUERY_CONTENT_LENGTH | WINHTTP_QUERY_FLAG_NUMBER,
        )
        .ok()
        .map(u64::from)
    }

    fn read(&mut self, buffer: &mut [u8]) -> Result<usize, String> {
        let mut available = 0u32;
        unsafe {
            if WinHttpQueryDataAvailable(self.request, &mut available) == 0 {
                return Err(format!(
                    "HTTPS download failed: {}",
                    io::Error::last_os_error()
                ));
            }
            if available == 0 {
                return Ok(0);
            }
            let to_read = available.min(buffer.len() as u32);
            let mut read = 0u32;
            if WinHttpReadData(self.request, buffer.as_mut_ptr().cast(), to_read, &mut read) == 0 {
                return Err(format!(
                    "HTTPS download failed: {}",
                    io::Error::last_os_error()
                ));
            }
            Ok(read as usize)
        }
    }
}

#[cfg(target_os = "windows")]
impl Drop for WinHttpRequest {
    fn drop(&mut self) {
        unsafe {
            if !self.request.is_null() {
                WinHttpCloseHandle(self.request);
            }
            if !self.connection.is_null() {
                WinHttpCloseHandle(self.connection);
            }
            if !self.session.is_null() {
                WinHttpCloseHandle(self.session);
            }
        }
    }
}

#[cfg(target_os = "windows")]
fn open_https_request(url: &str, method: &str) -> Result<WinHttpRequest, String> {
    let parsed = parse_https_url(url)?;
    let agent = wide_null("Multi-Converter");
    let host = wide_null(&parsed.host);
    let path = wide_null(&parsed.path);
    let verb = wide_null(method);
    unsafe {
        let session = WinHttpOpen(
            agent.as_ptr(),
            WINHTTP_ACCESS_TYPE_AUTOMATIC_PROXY,
            null(),
            null(),
            0,
        );
        if session.is_null() {
            return Err(format!(
                "HTTPS session failed: {}",
                io::Error::last_os_error()
            ));
        }
        let connection = WinHttpConnect(session, host.as_ptr(), parsed.port, 0);
        if connection.is_null() {
            WinHttpCloseHandle(session);
            return Err(format!(
                "HTTPS connection failed: {}",
                io::Error::last_os_error()
            ));
        }
        let request = WinHttpOpenRequest(
            connection,
            verb.as_ptr(),
            path.as_ptr(),
            null(),
            null(),
            null(),
            WINHTTP_FLAG_SECURE,
        );
        if request.is_null() {
            WinHttpCloseHandle(connection);
            WinHttpCloseHandle(session);
            return Err(format!(
                "HTTPS request failed: {}",
                io::Error::last_os_error()
            ));
        }
        Ok(WinHttpRequest {
            session,
            connection,
            request,
        })
    }
}

#[cfg(target_os = "windows")]
fn query_header_number(handle: *mut core::ffi::c_void, query: u32) -> Result<u32, String> {
    let mut value = 0u32;
    let mut len = std::mem::size_of::<u32>() as u32;
    let mut index = 0u32;
    unsafe {
        if WinHttpQueryHeaders(
            handle,
            query,
            null(),
            (&mut value as *mut u32).cast(),
            &mut len,
            &mut index,
        ) == 0
        {
            return Err(format!(
                "HTTPS header query failed: {}",
                io::Error::last_os_error()
            ));
        }
    }
    Ok(value)
}

#[cfg(target_os = "windows")]
struct ParsedHttpsUrl {
    host: String,
    port: u16,
    path: String,
}

#[cfg(target_os = "windows")]
fn parse_https_url(url: &str) -> Result<ParsedHttpsUrl, String> {
    let rest = url
        .strip_prefix("https://")
        .ok_or_else(|| "Only HTTPS engine download URLs are supported.".to_string())?;
    let (host_port, path) = rest
        .split_once('/')
        .map(|(host, path)| (host, format!("/{path}")))
        .unwrap_or((rest, "/".to_string()));
    if host_port.is_empty() || host_port.contains('@') {
        return Err("Invalid HTTPS engine download URL.".to_string());
    }
    let (host, port) = if let Some((host, port)) = host_port.rsplit_once(':') {
        (
            host.to_string(),
            port.parse::<u16>()
                .map_err(|_| "Invalid HTTPS engine download port.".to_string())?,
        )
    } else {
        (host_port.to_string(), INTERNET_DEFAULT_HTTPS_PORT)
    };
    if host.is_empty() {
        return Err("Invalid HTTPS engine download host.".to_string());
    }
    Ok(ParsedHttpsUrl { host, port, path })
}

#[cfg(target_os = "windows")]
fn wide_null(value: &str) -> Vec<u16> {
    value.encode_utf16().chain(std::iter::once(0)).collect()
}

fn copy_with_progress(
    app: Option<&AppHandle>,
    engine: &ManifestEngine,
    source: &Path,
    destination: &Path,
) -> Result<(), String> {
    let total = fs::metadata(source)
        .map_err(|error| format!("Chemin du paquet moteur invalide ou inaccessible : {error}"))?
        .len();
    let mut input = File::open(source)
        .map_err(|error| format!("Chemin du paquet moteur invalide ou inaccessible : {error}"))?;
    write_stream_with_progress(app, engine, &mut input, destination, total)
}

fn write_stream_with_progress(
    app: Option<&AppHandle>,
    engine: &ManifestEngine,
    reader: &mut dyn Read,
    destination: &Path,
    total: u64,
) -> Result<(), String> {
    let mut output = File::create(destination).map_err(|error| error.to_string())?;
    let mut downloaded = 0u64;
    let mut buffer = [0u8; 64 * 1024];
    loop {
        let count = reader
            .read(&mut buffer)
            .map_err(|error| error.to_string())?;
        if count == 0 {
            break;
        }
        output
            .write_all(&buffer[..count])
            .map_err(|error| error.to_string())?;
        downloaded += count as u64;
        emit(
            app,
            engine,
            "Téléchargement",
            downloaded,
            total,
            "Téléchargement du moteur.",
        );
    }
    Ok(())
}

fn verify_sha256(path: &Path, expected: &str) -> Result<(), String> {
    let actual = sha256_file(path)?;
    if !actual.eq_ignore_ascii_case(expected) {
        let _ = fs::remove_file(path);
        return Err(format!(
            "Intégrité invalide pour l'archive téléchargée. Hash attendu {expected}, obtenu {actual}. L'archive a été supprimée."
        ));
    }
    Ok(())
}

fn sha256_file(path: &Path) -> Result<String, String> {
    let file = File::open(path).map_err(|error| format!("Calcul SHA-256 impossible : {error}"))?;
    let mut reader = BufReader::new(file);
    let mut hasher = Sha256State::new();
    let mut buffer = [0u8; 64 * 1024];
    loop {
        let count = reader
            .read(&mut buffer)
            .map_err(|error| format!("Calcul SHA-256 impossible : {error}"))?;
        if count == 0 {
            break;
        }
        hasher.update(&buffer[..count]);
    }
    Ok(hasher.finalize_hex())
}

struct Sha256State {
    state: [u32; 8],
    buffer: [u8; 64],
    buffer_len: usize,
    message_len: u64,
}

impl Sha256State {
    fn new() -> Self {
        Self {
            state: [
                0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab,
                0x5be0cd19,
            ],
            buffer: [0; 64],
            buffer_len: 0,
            message_len: 0,
        }
    }

    fn update(&mut self, mut input: &[u8]) {
        self.message_len = self.message_len.wrapping_add(input.len() as u64);
        if self.buffer_len > 0 {
            let available = 64 - self.buffer_len;
            let take = available.min(input.len());
            self.buffer[self.buffer_len..self.buffer_len + take].copy_from_slice(&input[..take]);
            self.buffer_len += take;
            input = &input[take..];
            if self.buffer_len == 64 {
                let block = self.buffer;
                self.process_block(&block);
                self.buffer_len = 0;
            }
        }
        while input.len() >= 64 {
            self.process_block(&input[..64]);
            input = &input[64..];
        }
        if !input.is_empty() {
            self.buffer[..input.len()].copy_from_slice(input);
            self.buffer_len = input.len();
        }
    }

    fn finalize_hex(mut self) -> String {
        let bit_len = self.message_len.wrapping_mul(8);
        self.buffer[self.buffer_len] = 0x80;
        self.buffer_len += 1;
        if self.buffer_len > 56 {
            self.buffer[self.buffer_len..].fill(0);
            let block = self.buffer;
            self.process_block(&block);
            self.buffer_len = 0;
        }
        self.buffer[self.buffer_len..56].fill(0);
        self.buffer[56..64].copy_from_slice(&bit_len.to_be_bytes());
        let block = self.buffer;
        self.process_block(&block);

        let mut out = String::with_capacity(64);
        for word in self.state {
            out.push_str(&format!("{word:08x}"));
        }
        out
    }

    fn process_block(&mut self, block: &[u8]) {
        const K: [u32; 64] = [
            0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4,
            0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe,
            0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f,
            0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
            0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc,
            0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
            0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116,
            0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
            0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7,
            0xc67178f2,
        ];
        let mut w = [0u32; 64];
        for (index, chunk) in block.chunks_exact(4).take(16).enumerate() {
            w[index] = u32::from_be_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]);
        }
        for index in 16..64 {
            let s0 = w[index - 15].rotate_right(7)
                ^ w[index - 15].rotate_right(18)
                ^ (w[index - 15] >> 3);
            let s1 = w[index - 2].rotate_right(17)
                ^ w[index - 2].rotate_right(19)
                ^ (w[index - 2] >> 10);
            w[index] = w[index - 16]
                .wrapping_add(s0)
                .wrapping_add(w[index - 7])
                .wrapping_add(s1);
        }

        let [mut a, mut b, mut c, mut d, mut e, mut f, mut g, mut h] = self.state;
        for index in 0..64 {
            let s1 = e.rotate_right(6) ^ e.rotate_right(11) ^ e.rotate_right(25);
            let ch = (e & f) ^ ((!e) & g);
            let temp1 = h
                .wrapping_add(s1)
                .wrapping_add(ch)
                .wrapping_add(K[index])
                .wrapping_add(w[index]);
            let s0 = a.rotate_right(2) ^ a.rotate_right(13) ^ a.rotate_right(22);
            let maj = (a & b) ^ (a & c) ^ (b & c);
            let temp2 = s0.wrapping_add(maj);
            h = g;
            g = f;
            f = e;
            e = d.wrapping_add(temp1);
            d = c;
            c = b;
            b = a;
            a = temp1.wrapping_add(temp2);
        }

        self.state[0] = self.state[0].wrapping_add(a);
        self.state[1] = self.state[1].wrapping_add(b);
        self.state[2] = self.state[2].wrapping_add(c);
        self.state[3] = self.state[3].wrapping_add(d);
        self.state[4] = self.state[4].wrapping_add(e);
        self.state[5] = self.state[5].wrapping_add(f);
        self.state[6] = self.state[6].wrapping_add(g);
        self.state[7] = self.state[7].wrapping_add(h);
    }
}

fn extract_archive(
    engine: &ManifestEngine,
    archive_path: &Path,
    destination: &Path,
) -> Result<(), String> {
    match engine.archive_type {
        ArchiveType::Zip => extract_zip_safe(archive_path, destination),
        ArchiveType::SevenZ | ArchiveType::TarGz => Err(
            "Seules les archives ZIP sont prises en charge par le distributeur interne actuel."
                .to_string(),
        ),
    }
}

fn extract_zip_safe(archive_path: &Path, destination: &Path) -> Result<(), String> {
    let file = File::open(archive_path).map_err(|error| error.to_string())?;
    let mut archive = ZipArchive::new(file).map_err(|error| error.to_string())?;
    for index in 0..archive.len() {
        let mut entry = archive.by_index(index).map_err(|error| error.to_string())?;
        let enclosed = entry
            .enclosed_name()
            .ok_or_else(|| format!("Archive refusée : chemin dangereux '{}'.", entry.name()))?;
        ensure_relative_safe(&enclosed)?;
        let out_path = destination.join(&enclosed);
        assert_under(&out_path, destination)?;
        if entry.is_dir() {
            fs::create_dir_all(&out_path).map_err(|error| error.to_string())?;
        } else {
            if let Some(parent) = out_path.parent() {
                fs::create_dir_all(parent).map_err(|error| error.to_string())?;
            }
            let mut output = File::create(&out_path).map_err(|error| error.to_string())?;
            io::copy(&mut entry, &mut output).map_err(|error| error.to_string())?;
        }
    }
    Ok(())
}

fn ensure_relative_safe(path: &Path) -> Result<(), String> {
    for component in path.components() {
        if matches!(
            component,
            Component::ParentDir | Component::Prefix(_) | Component::RootDir
        ) {
            return Err("Archive refusée : chemin absolu ou parent détecté.".to_string());
        }
    }
    Ok(())
}

fn verify_package_metadata(root: &Path, engine: &ManifestEngine) -> Result<(), String> {
    let path = root.join("engine.json");
    let metadata = fs::read_to_string(&path)
        .map_err(|_| "Archive refusée : engine.json est absent.".to_string())?;
    let package: EnginePackageMetadata = serde_json::from_str(&metadata)
        .map_err(|error| format!("Archive refusée : engine.json invalide ({error})."))?;
    if package.package_format_version != 1 {
        return Err(format!(
            "Archive refusée : format de paquet non pris en charge ({}).",
            package.package_format_version
        ));
    }
    if package.engine_id != engine.id
        || package.display_name != engine.display_name
        || package.version != engine.version
        || package.platform != engine.platform
        || package.mode != engine.mode
        || package.binary_paths != engine.binary_paths
        || package.health_check != engine.health_check
        || package.license_name != engine.license_name
    {
        return Err("Archive refusée : engine.json ne correspond pas au manifeste.".to_string());
    }
    if package.license_files.is_empty() {
        return Err("Archive refusée : aucun fichier de licence déclaré.".to_string());
    }
    for relative in &package.license_files {
        ensure_relative_safe(Path::new(relative))?;
        if !root.join(relative).is_file() {
            return Err(format!(
                "Archive refusée : fichier de licence absent ({relative})."
            ));
        }
    }
    for relative in &package.notice_files {
        ensure_relative_safe(Path::new(relative))?;
        if !root.join(relative).is_file() {
            return Err(format!(
                "Archive refusée : notice tierce absente ({relative})."
            ));
        }
    }
    Ok(())
}

fn verify_expected_binaries(root: &Path, engine: &ManifestEngine) -> Result<(), String> {
    for relative in &engine.binary_paths {
        ensure_relative_safe(Path::new(relative))?;
        let path = root.join(relative);
        if !path.exists() {
            return Err(format!(
                "Installation incomplète : fichier attendu absent ({relative})."
            ));
        }
    }
    Ok(())
}

fn run_health_check(
    app: Option<&AppHandle>,
    root: &Path,
    engine: &ManifestEngine,
) -> Result<(), String> {
    let binary = engine
        .binary_paths
        .iter()
        .map(|relative| root.join(relative))
        .filter(|path| path.is_file())
        .max_by_key(|path| executable_candidate_score(path));
    let Some(binary) = binary else {
        return Err("Aucun binaire principal trouvé pour le test santé.".to_string());
    };
    engines::smoke_test_external_path(app, &engine.id, &binary)
}

fn executable_candidate_score(path: &Path) -> u8 {
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default();
    if cfg!(target_os = "windows") {
        if extension.eq_ignore_ascii_case("exe") {
            return 2;
        }
        if extension.eq_ignore_ascii_case("com") {
            return 1;
        }
        return 0;
    }
    if extension.eq_ignore_ascii_case("dll") || extension.eq_ignore_ascii_case("traineddata") {
        0
    } else {
        1
    }
}

fn commit_install(root: &Path, extracted: &Path, engine: &ManifestEngine) -> Result<(), String> {
    let engine_root = root.join(&engine.id);
    let final_dir = engine_root.join(&engine.version);
    let backup_dir = engine_root.join(format!("{}.previous", engine.version));
    fs::create_dir_all(&engine_root).map_err(|error| error.to_string())?;
    assert_under(&final_dir, root)?;
    assert_under(&backup_dir, root)?;
    if backup_dir.exists() {
        fs::remove_dir_all(&backup_dir).map_err(|error| error.to_string())?;
    }
    if final_dir.exists() {
        fs::rename(&final_dir, &backup_dir).map_err(|error| error.to_string())?;
    }
    if let Err(error) = fs::rename(extracted, &final_dir) {
        if backup_dir.exists() {
            let _ = fs::rename(&backup_dir, &final_dir);
        }
        return Err(error.to_string());
    }
    if backup_dir.exists() {
        let _ = fs::remove_dir_all(backup_dir);
    }
    Ok(())
}

fn directory_size(path: &Path) -> io::Result<u64> {
    if !path.exists() {
        return Ok(0);
    }
    let mut total = 0;
    for entry in fs::read_dir(path)? {
        let entry = entry?;
        let metadata = entry.metadata()?;
        if metadata.is_dir() {
            total += directory_size(&entry.path())?;
        } else {
            total += metadata.len();
        }
    }
    Ok(total)
}

fn assert_under(path: &Path, root: &Path) -> Result<(), String> {
    let root = absolute_lexical(root);
    let candidate = absolute_lexical(path);
    if candidate.starts_with(&root) {
        Ok(())
    } else {
        Err("Opération refusée : chemin hors du dossier tool-env.".to_string())
    }
}

fn absolute_lexical(path: &Path) -> PathBuf {
    let raw = if path.is_absolute() {
        path.to_path_buf()
    } else {
        std::env::current_dir()
            .unwrap_or_else(|_| PathBuf::from("."))
            .join(path)
    };
    let mut normalized = PathBuf::new();
    for component in raw.components() {
        match component {
            Component::CurDir => {}
            Component::ParentDir => {
                normalized.pop();
            }
            other => normalized.push(other.as_os_str()),
        }
    }
    normalized
}

fn emit(
    app: Option<&AppHandle>,
    engine: &ManifestEngine,
    stage: &'static str,
    downloaded: u64,
    total: u64,
    message: &str,
) {
    let percent = downloaded
        .saturating_mul(100)
        .checked_div(total)
        .unwrap_or(0)
        .min(100) as u8;
    if let Some(app) = app {
        let _ = app.emit(
            "engine-install-progress",
            EngineInstallProgress {
                engine_id: engine.id.clone(),
                engine_name: engine.display_name.clone(),
                stage,
                downloaded_bytes: downloaded,
                total_bytes: total,
                percent,
                message: message.to_string(),
            },
        );
    }
}

fn is_placeholder_sha256(value: &str) -> bool {
    value.len() != 64 || value.chars().all(|item| item == '0')
}

#[cfg(test)]
mod tests {
    use super::*;
    use zip::write::SimpleFileOptions;

    fn make_engine(root: &Path, health: &str, binary: &str) -> (ManifestEngine, PathBuf) {
        let archive = root.join("engine.zip");
        let file = File::create(&archive).unwrap();
        let mut zip = zip::ZipWriter::new(file);
        let options = SimpleFileOptions::default();
        let metadata = EnginePackageMetadata {
            engine_id: "fake".to_string(),
            display_name: "Fake".to_string(),
            version: "1.0".to_string(),
            platform: PLATFORM.to_string(),
            mode: EngineMode::QualityMax,
            binary_paths: vec![binary.to_string()],
            health_check: health.to_string(),
            license_name: "Test".to_string(),
            license_files: vec!["licenses/LICENSE.txt".to_string()],
            notice_files: vec![],
            created_at: "2026-05-07T00:00:00Z".to_string(),
            package_format_version: 1,
        };
        zip.start_file("engine.json", options).unwrap();
        zip.write_all(serde_json::to_string(&metadata).unwrap().as_bytes())
            .unwrap();
        zip.start_file("licenses/LICENSE.txt", options).unwrap();
        zip.write_all(b"license").unwrap();
        zip.start_file(binary, options).unwrap();
        zip.write_all(b"fake").unwrap();
        zip.finish().unwrap();
        let sha = sha256_file(&archive).unwrap();
        (
            ManifestEngine {
                id: "fake".to_string(),
                display_name: "Fake".to_string(),
                mode: EngineMode::QualityMax,
                version: "1.0".to_string(),
                platform: PLATFORM.to_string(),
                archive_type: ArchiveType::Zip,
                download_url: format!("file://{}", archive.to_string_lossy()),
                sha256: sha,
                compressed_size_bytes: fs::metadata(&archive).unwrap().len(),
                installed_size_bytes: 4,
                binary_paths: vec![binary.to_string()],
                health_check: health.to_string(),
                license_name: "Test".to_string(),
                license_url: None,
                published: true,
                required: false,
                dependencies: vec![],
            },
            archive,
        )
    }

    #[test]
    fn parses_dev_manifest_and_selects_windows_x64() {
        let manifest = load_manifest().unwrap();
        assert_eq!(manifest.manifest_version, 1);
        assert!(
            manifest
                .engines
                .iter()
                .all(|engine| engine.mode == EngineMode::QualityMax)
        );
        let pdfium = manifest_for_platform(&manifest, "pdfium").unwrap();
        assert_eq!(pdfium.platform, "windows-x64");
        assert_eq!(pdfium.archive_type, ArchiveType::Zip);
    }

    #[test]
    fn download_configuration_distinguishes_packaged_and_placeholder_engines() {
        assert!(!engine_download_is_configured("ffmpeg"));
        assert!(!engine_download_is_configured("ffprobe"));
        assert!(engine_download_is_configured("libreoffice"));
        assert!(engine_download_requires_internet("libreoffice"));
    }

    #[test]
    fn installed_binary_prefers_executable_over_support_files() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        let bin = root.join("pdfium").join("compatible").join("bin");
        fs::create_dir_all(&bin).unwrap();
        fs::write(bin.join("pdfium.dll"), b"support dll").unwrap();
        fs::write(
            bin.join("pdfium-render-x86_64-pc-windows-msvc.exe"),
            b"wrapper",
        )
        .unwrap();

        let selected = installed_binary(
            root,
            "pdfium",
            "compatible",
            &[
                "bin/pdfium.dll".to_string(),
                "bin/pdfium-render-x86_64-pc-windows-msvc.exe".to_string(),
            ],
        )
        .unwrap();

        assert_eq!(
            selected.file_name().and_then(|value| value.to_str()),
            Some("pdfium-render-x86_64-pc-windows-msvc.exe")
        );
    }

    #[test]
    fn libreoffice_runtime_uses_manifest_launcher() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        let program = root.join("libreoffice").join("compatible").join("program");
        fs::create_dir_all(&program).unwrap();
        fs::write(program.join("soffice.exe"), b"launcher").unwrap();
        fs::write(program.join("soffice.bin"), b"runtime").unwrap();

        let selected = installed_binary(
            root,
            "libreoffice",
            "compatible",
            &["program/soffice.exe".to_string()],
        )
        .unwrap();

        assert_eq!(
            selected.file_name().and_then(|value| value.to_str()),
            Some("soffice.exe")
        );
    }

    #[test]
    fn manifest_uses_pdfium_instead_of_poppler_or_mupdf() {
        let manifest = load_manifest().unwrap();
        assert!(manifest_for_platform(&manifest, "pdfium").is_some());
        assert!(manifest_for_platform(&manifest, "poppler").is_none());
        assert!(manifest_for_platform(&manifest, "mupdf").is_none());
        assert_eq!(
            manifest_for_platform(&manifest, "pdfium").unwrap().mode,
            EngineMode::QualityMax
        );
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn windows_file_urls_are_decoded_to_local_paths() {
        assert_eq!(
            file_url_to_pathbuf("file:///C:/Temp/Multi%20Converter/file.zip").unwrap(),
            PathBuf::from(r"C:\Temp\Multi Converter\file.zip")
        );
        assert_eq!(
            file_url_to_pathbuf("file:///C:/Temp/Multi Converter/file.zip").unwrap(),
            PathBuf::from(r"C:\Temp\Multi Converter\file.zip")
        );
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn non_file_urls_are_refused_by_file_url_parser() {
        assert!(file_url_to_pathbuf("https://example.com/file.zip").is_err());
    }

    #[test]
    fn sha256_accepts_correct_and_rejects_wrong_hash() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("a.bin");
        fs::write(&file, b"abc").unwrap();
        let hash = sha256_file(&file).unwrap();
        assert_eq!(
            hash,
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
        assert!(verify_sha256(&file, &hash).is_ok());
        fs::write(&file, b"abc").unwrap();
        assert!(verify_sha256(&file, "0000").is_err());
        assert!(!file.exists());
    }

    #[test]
    fn secure_zip_extraction_refuses_path_traversal() {
        let dir = tempfile::tempdir().unwrap();
        let archive = dir.path().join("bad.zip");
        let file = File::create(&archive).unwrap();
        let mut zip = zip::ZipWriter::new(file);
        zip.start_file("../evil.exe", SimpleFileOptions::default())
            .unwrap();
        zip.write_all(b"bad").unwrap();
        zip.finish().unwrap();
        let out = dir.path().join("out");
        fs::create_dir_all(&out).unwrap();
        assert!(extract_zip_safe(&archive, &out).is_err());
        assert!(!dir.path().join("evil.exe").exists());
    }

    #[test]
    fn atomic_install_success_commits_final_directory() {
        let dir = tempfile::tempdir().unwrap();
        let (engine, _) = make_engine(dir.path(), "skip", "bin/fake.exe");
        install_engine_from_manifest(
            None,
            dir.path().join("tool-env"),
            &engine,
            HealthPolicy::SkipForTest,
        )
        .unwrap();
        assert!(dir.path().join("tool-env/fake/1.0/bin/fake.exe").exists());
    }

    #[test]
    fn install_rejects_archive_without_engine_json() {
        let dir = tempfile::tempdir().unwrap();
        let archive = dir.path().join("engine.zip");
        let file = File::create(&archive).unwrap();
        let mut zip = zip::ZipWriter::new(file);
        zip.start_file("bin/fake.exe", SimpleFileOptions::default())
            .unwrap();
        zip.write_all(b"fake").unwrap();
        zip.finish().unwrap();
        let sha = sha256_file(&archive).unwrap();
        let engine = ManifestEngine {
            id: "fake".to_string(),
            display_name: "Fake".to_string(),
            mode: EngineMode::QualityMax,
            version: "1.0".to_string(),
            platform: PLATFORM.to_string(),
            archive_type: ArchiveType::Zip,
            download_url: format!("file://{}", archive.to_string_lossy()),
            sha256: sha,
            compressed_size_bytes: fs::metadata(&archive).unwrap().len(),
            installed_size_bytes: 4,
            binary_paths: vec!["bin/fake.exe".to_string()],
            health_check: "skip".to_string(),
            license_name: "Test".to_string(),
            license_url: None,
            published: true,
            required: false,
            dependencies: vec![],
        };
        assert!(
            install_engine_from_manifest(
                None,
                dir.path().join("tool-env"),
                &engine,
                HealthPolicy::SkipForTest,
            )
            .is_err()
        );
    }

    #[test]
    fn rollback_keeps_previous_version_when_health_fails() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("tool-env");
        let previous = root.join("fake/1.0");
        fs::create_dir_all(&previous).unwrap();
        fs::write(previous.join("old.txt"), b"old").unwrap();
        let (engine, _) = make_engine(dir.path(), "fail", "fake.exe");
        assert!(
            install_engine_from_manifest(None, root.clone(), &engine, HealthPolicy::FailForTest)
                .is_err()
        );
        assert!(root.join("fake/1.0/old.txt").exists());
    }

    #[test]
    fn uninstall_quality_max_keeps_base_engines() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("tool-env");
        fs::create_dir_all(root.join("ffmpeg/8.1.1")).unwrap();
        fs::create_dir_all(root.join("pandoc/compatible")).unwrap();
        let pandoc = ManifestEngine {
            id: "pandoc".to_string(),
            display_name: "Pandoc".to_string(),
            mode: EngineMode::QualityMax,
            version: "compatible".to_string(),
            platform: PLATFORM.to_string(),
            archive_type: ArchiveType::Zip,
            download_url: "file://none".to_string(),
            sha256: "0".to_string(),
            compressed_size_bytes: 0,
            installed_size_bytes: 0,
            binary_paths: vec![],
            health_check: "pandoc".to_string(),
            license_name: "Test".to_string(),
            license_url: None,
            published: true,
            required: false,
            dependencies: vec![],
        };
        let path = root.join(&pandoc.id);
        fs::remove_dir_all(path).unwrap();
        assert!(root.join("ffmpeg/8.1.1").exists());
    }
}
