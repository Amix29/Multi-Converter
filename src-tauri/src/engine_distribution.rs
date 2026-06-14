use crate::engines::{self, EngineMode};
use serde::{Deserialize, Serialize};
use std::env;
use std::fs;
use std::io;
#[cfg(not(target_os = "windows"))]
use std::net::{TcpStream, ToSocketAddrs};
use std::path::{Component, Path, PathBuf};
#[cfg(target_os = "windows")]
use std::ptr::{null, null_mut};
#[cfg(not(target_os = "windows"))]
use std::time::Duration;
#[cfg(target_os = "windows")]
use windows_sys::Win32::Networking::WinHttp::{
    WINHTTP_ACCESS_TYPE_AUTOMATIC_PROXY, WINHTTP_FLAG_SECURE, WINHTTP_QUERY_FLAG_NUMBER,
    WINHTTP_QUERY_STATUS_CODE, WinHttpCloseHandle, WinHttpConnect, WinHttpOpen, WinHttpOpenRequest,
    WinHttpQueryHeaders, WinHttpReceiveResponse, WinHttpSendRequest,
};

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

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum ArchiveType {
    Zip,
    SevenZ,
    TarGz,
}

const DEFAULT_HTTPS_PORT: u16 = 443;
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
    manifest_for_platform_id(manifest, engine_id, current_platform_id())
}

pub fn current_platform_id() -> &'static str {
    if cfg!(all(target_os = "windows", target_arch = "x86_64")) {
        "windows-x64"
    } else if cfg!(target_os = "macos") {
        "macos-universal"
    } else if cfg!(all(target_os = "linux", target_arch = "x86_64")) {
        "linux-x64"
    } else {
        "unsupported"
    }
}

fn manifest_for_platform_id(
    manifest: &EngineManifest,
    engine_id: &str,
    platform: &str,
) -> Option<ManifestEngine> {
    manifest
        .engines
        .iter()
        .find(|engine| engine.id == engine_id && engine.platform == platform)
        .cloned()
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

pub fn cleanup_stale_installing_dirs() -> Result<(), String> {
    let root = engines::tool_env_root()?;
    let work_root = root.join(".installing");
    if !work_root.exists() {
        return Ok(());
    }
    assert_under(&work_root, &root)?;
    fs::remove_dir_all(&work_root).map_err(|error| error.to_string())
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
fn https_head_status(url: &str) -> Result<u32, String> {
    let parsed = parse_https_url(url)?;
    let addresses = (parsed.host.as_str(), parsed.port)
        .to_socket_addrs()
        .map_err(|error| format!("HTTPS DNS lookup failed: {error}"))?;
    for address in addresses {
        if TcpStream::connect_timeout(&address, Duration::from_secs(4)).is_ok() {
            return Ok(204);
        }
    }
    Err("HTTPS host is unreachable.".to_string())
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

#[cfg(not(target_os = "windows"))]
struct ParsedHttpsUrl {
    host: String,
    port: u16,
}

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
        (host_port.to_string(), DEFAULT_HTTPS_PORT)
    };
    if host.is_empty() {
        return Err("Invalid HTTPS engine download host.".to_string());
    }
    #[cfg(not(target_os = "windows"))]
    let _ = path;
    Ok(ParsedHttpsUrl {
        host,
        port,
        #[cfg(target_os = "windows")]
        path,
    })
}

#[cfg(target_os = "windows")]
fn wide_null(value: &str) -> Vec<u16> {
    value.encode_utf16().chain(std::iter::once(0)).collect()
}

fn executable_candidate_score(path: &Path) -> u8 {
    executable_candidate_score_for(path, env::consts::OS, env::consts::ARCH)
}

fn executable_candidate_score_for(path: &Path, os: &str, arch: &str) -> u8 {
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    if os == "windows" {
        if extension.eq_ignore_ascii_case("exe") {
            return 20;
        }
        if extension.eq_ignore_ascii_case("com") {
            return 10;
        }
        return 0;
    }

    if matches!(
        extension.as_str(),
        "dll" | "dylib" | "so" | "a" | "traineddata"
    ) {
        return 0;
    }

    let path_text = path
        .to_string_lossy()
        .replace('\\', "/")
        .to_ascii_lowercase();
    10 + architecture_score(&path_text, os, arch)
}

fn architecture_score(path_text: &str, os: &str, arch: &str) -> u8 {
    if !matches!(os, "macos" | "linux") {
        return 5;
    }
    let native_arm = matches!(arch, "aarch64" | "arm64");
    let has_arm = path_text.contains("aarch64") || path_text.contains("arm64");
    let has_x64 = path_text.contains("x86_64") || path_text.contains("x64");
    let has_universal = path_text.contains("universal") || path_text.contains("univ");

    if native_arm && has_arm {
        return 30;
    }
    if !native_arm && has_x64 {
        return 30;
    }
    if os == "macos" && has_universal {
        return 25;
    }
    if has_arm || has_x64 {
        return 1;
    }
    15
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_embedded_manifest_and_selects_declared_pdfium_platform() {
        let manifest = load_manifest().unwrap();
        assert_eq!(manifest.manifest_version, 1);
        assert!(
            manifest
                .engines
                .iter()
                .all(|engine| engine.mode == EngineMode::Advanced)
        );
        let pdfium_platform = manifest
            .engines
            .iter()
            .find(|engine| engine.id == "pdfium")
            .map(|engine| engine.platform.as_str())
            .unwrap();
        let pdfium = manifest_for_platform_id(&manifest, "pdfium", pdfium_platform).unwrap();
        assert_eq!(pdfium.platform, pdfium_platform);
        assert_eq!(pdfium.archive_type, ArchiveType::Zip);
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
    fn installed_binary_ignores_macos_support_libraries() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        let bin = root.join("pdfium").join("compatible").join("bin");
        fs::create_dir_all(&bin).unwrap();
        fs::write(bin.join("libpdfium.dylib"), b"support dylib").unwrap();
        fs::write(bin.join("pdfium-render-universal-apple-darwin"), b"wrapper").unwrap();

        let selected = installed_binary(
            root,
            "pdfium",
            "compatible",
            &[
                "bin/libpdfium.dylib".to_string(),
                "bin/pdfium-render-universal-apple-darwin".to_string(),
            ],
        )
        .unwrap();

        assert_eq!(
            selected.file_name().and_then(|value| value.to_str()),
            Some("pdfium-render-universal-apple-darwin")
        );
    }

    #[test]
    fn macos_engine_binary_selection_prefers_native_architecture() {
        let arm = Path::new("aarch64/LibreOffice.app/Contents/MacOS/soffice");
        let x64 = Path::new("x86_64/LibreOffice.app/Contents/MacOS/soffice");
        let universal = Path::new("bin/pandoc-universal-apple-darwin");

        assert!(
            executable_candidate_score_for(arm, "macos", "aarch64")
                > executable_candidate_score_for(x64, "macos", "aarch64")
        );
        assert!(
            executable_candidate_score_for(x64, "macos", "x86_64")
                > executable_candidate_score_for(arm, "macos", "x86_64")
        );
        assert!(
            executable_candidate_score_for(universal, "macos", "x86_64")
                > executable_candidate_score_for(arm, "macos", "x86_64")
        );
    }

    #[test]
    fn linux_engine_binary_selection_prefers_native_architecture() {
        let arm = Path::new("aarch64/bin/vips");
        let x64 = Path::new("x86_64/bin/vips");
        let generic = Path::new("bin/vips");

        assert!(
            executable_candidate_score_for(x64, "linux", "x86_64")
                > executable_candidate_score_for(arm, "linux", "x86_64")
        );
        assert!(
            executable_candidate_score_for(arm, "linux", "aarch64")
                > executable_candidate_score_for(x64, "linux", "aarch64")
        );
        assert!(
            executable_candidate_score_for(generic, "linux", "x86_64")
                > executable_candidate_score_for(arm, "linux", "x86_64")
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
        let pdfium_platforms = manifest
            .engines
            .iter()
            .filter(|engine| engine.id == "pdfium")
            .map(|engine| engine.platform.as_str())
            .collect::<Vec<_>>();
        assert!(!pdfium_platforms.is_empty());
        for platform in pdfium_platforms {
            assert!(manifest_for_platform_id(&manifest, "pdfium", platform).is_some());
            assert!(manifest_for_platform_id(&manifest, "poppler", platform).is_none());
            assert!(manifest_for_platform_id(&manifest, "mupdf", platform).is_none());
            assert_eq!(
                manifest_for_platform_id(&manifest, "pdfium", platform)
                    .unwrap()
                    .mode,
                EngineMode::Advanced
            );
        }
    }

    #[test]
    fn installed_size_counts_nested_engine_files() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        let engine_dir = root.join("pandoc").join("compatible");
        fs::create_dir_all(engine_dir.join("bin")).unwrap();
        fs::write(engine_dir.join("bin").join("pandoc.exe"), b"pandoc").unwrap();
        fs::write(engine_dir.join("NOTICE.txt"), b"notice").unwrap();

        assert_eq!(
            installed_size(root, "pandoc", "compatible"),
            "pandoc".len() as u64 + "notice".len() as u64
        );
    }
}
