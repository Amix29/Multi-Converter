mod converters;
mod engine_distribution;
mod engines;
mod registry;
mod runtime_log;

use converters::{ConversionJob, ConversionResult, FileDescription};
use engines::{DependencyBootstrap, ToolStatus};
use std::collections::HashSet;
use std::env;
use std::ffi::OsStr;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::AppHandle;

type CommandResult<T> = std::result::Result<T, String>;
const MAX_FOLDER_IMPORT_FILES: usize = 2000;

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct ExportResult {
    destination_dir: String,
    files: Vec<String>,
    destination_created: bool,
}

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct WelcomeState {
    show: bool,
}

#[tauri::command]
fn welcome_state() -> CommandResult<WelcomeState> {
    Ok(WelcomeState {
        show: should_show_welcome_for_install(),
    })
}

#[tauri::command]
fn mark_welcome_seen() -> CommandResult<bool> {
    let marker = welcome_marker_path()?;
    if let Some(parent) = marker.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let install_stamp = current_install_stamp();
    let mut file = fs::File::create(marker).map_err(|error| error.to_string())?;
    writeln!(file, "{install_stamp}").map_err(|error| error.to_string())?;
    Ok(true)
}

#[tauri::command]
async fn describe_paths(app: AppHandle, paths: Vec<String>) -> CommandResult<Vec<FileDescription>> {
    tauri::async_runtime::spawn_blocking(move || {
        let expanded = expand_file_paths(&paths)?;
        let partial_import = expanded.partial_import;
        expanded
            .files
            .into_iter()
            .map(|path| {
                let mut description = converters::describe_file_with_app(Some(&app), path)
                    .map_err(|error| error.to_string())?;
                if partial_import {
                    description.warnings.push(converters::FileWarning {
                        code: "partialFolderImport",
                        severity: "warning",
                        limit_bytes: None,
                    });
                }
                Ok(description)
            })
            .collect()
    })
    .await
    .map_err(|error| error.to_string())?
}

struct ExpandedPaths {
    files: Vec<PathBuf>,
    partial_import: bool,
}

#[tauri::command]
async fn pick_file_paths() -> CommandResult<Vec<String>> {
    let handles = rfd::AsyncFileDialog::new()
        .set_title("Choisir des fichiers")
        .pick_files()
        .await
        .unwrap_or_default();

    Ok(handles
        .into_iter()
        .map(|handle| handle.path().to_string_lossy().to_string())
        .collect())
}

#[tauri::command]
async fn pick_output_folder() -> CommandResult<Option<String>> {
    Ok(rfd::AsyncFileDialog::new()
        .set_title("Choisir le dossier de sortie")
        .pick_folder()
        .await
        .map(|handle| handle.path().to_string_lossy().to_string()))
}

#[tauri::command]
fn create_temp_output_folder() -> CommandResult<String> {
    tempfile::Builder::new()
        .prefix("multi-converter-")
        .tempdir()
        .map_err(|error| error.to_string())?
        .keep()
        .to_string_lossy()
        .to_string()
        .pipe(Ok)
}

#[tauri::command]
fn cleanup_temp_output_folder(folder: String) -> CommandResult<bool> {
    let path = PathBuf::from(folder);
    if !is_managed_temp_output_folder(&path) {
        return Ok(false);
    }
    if !path.exists() {
        return Ok(false);
    }
    fs::remove_dir_all(&path).map_err(|error| error.to_string())?;
    Ok(true)
}

trait Pipe: Sized {
    fn pipe<T>(self, f: impl FnOnce(Self) -> T) -> T {
        f(self)
    }
}

impl<T> Pipe for T {}

fn expand_file_paths(paths: &[String]) -> CommandResult<ExpandedPaths> {
    let mut files = Vec::new();
    let mut visited = HashSet::new();
    let mut partial_import = false;
    for path in paths.iter().filter(|item| !item.trim().is_empty()) {
        collect_files_from_path(
            Path::new(path),
            &mut files,
            &mut visited,
            &mut partial_import,
            true,
        )?;
    }
    files.sort();
    files.dedup();
    Ok(ExpandedPaths {
        files,
        partial_import,
    })
}

fn collect_files_from_path(
    path: &Path,
    files: &mut Vec<PathBuf>,
    visited: &mut HashSet<PathBuf>,
    partial_import: &mut bool,
    root: bool,
) -> CommandResult<()> {
    if files.len() >= MAX_FOLDER_IMPORT_FILES {
        *partial_import = true;
        return Ok(());
    }
    let metadata = match fs::symlink_metadata(path) {
        Ok(metadata) => metadata,
        Err(error) if root => return Err(error.to_string()),
        Err(_) => {
            *partial_import = true;
            return Ok(());
        }
    };
    if metadata.file_type().is_symlink() || is_windows_reparse_point(&metadata) {
        *partial_import = true;
        return Ok(());
    }
    if metadata.is_file() {
        files.push(path.to_path_buf());
        return Ok(());
    }
    if !metadata.is_dir() {
        return Ok(());
    }

    let canonical = match path.canonicalize() {
        Ok(canonical) => canonical,
        Err(error) if root => return Err(error.to_string()),
        Err(_) => {
            *partial_import = true;
            return Ok(());
        }
    };
    if !visited.insert(canonical) {
        *partial_import = true;
        return Ok(());
    }

    let entries = match fs::read_dir(path) {
        Ok(entries) => entries,
        Err(error) if root => return Err(error.to_string()),
        Err(_) => {
            *partial_import = true;
            return Ok(());
        }
    };
    let mut children = entries
        .filter_map(|entry| match entry {
            Ok(entry) => Some(entry.path()),
            Err(_) => {
                *partial_import = true;
                None
            }
        })
        .collect::<Vec<_>>();
    children.sort();
    for child in children {
        if files.len() >= MAX_FOLDER_IMPORT_FILES {
            *partial_import = true;
            break;
        }
        collect_files_from_path(&child, files, visited, partial_import, false)?;
    }
    Ok(())
}

#[cfg(target_os = "windows")]
fn is_windows_reparse_point(metadata: &fs::Metadata) -> bool {
    use std::os::windows::fs::MetadataExt;
    const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x400;
    metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0
}

#[cfg(not(target_os = "windows"))]
fn is_windows_reparse_point(_metadata: &fs::Metadata) -> bool {
    false
}

#[tauri::command]
fn engine_statuses(app: AppHandle) -> Vec<ToolStatus> {
    engines::tool_statuses(Some(&app))
}

#[tauri::command]
fn bootstrap_dependencies(app: AppHandle) -> CommandResult<DependencyBootstrap> {
    let result = engines::bootstrap_dependencies(&app);
    match &result {
        Ok(info) => {
            runtime_log::write(
                "engines",
                &format!(
                    "bootstrap ok={} mode={} env={}",
                    info.ok, info.mode, info.env_dir
                ),
            );
            for check in &info.checks {
                runtime_log::write(
                    "engines",
                    &format!(
                        "{} status={} available={} path={}",
                        check.id,
                        check.status,
                        check.available,
                        check.path.as_deref().unwrap_or("")
                    ),
                );
            }
        }
        Err(error) => runtime_log::write("engines", &format!("bootstrap failed: {error}")),
    }
    result
}

#[tauri::command]
async fn start_conversion(app: AppHandle, job: ConversionJob) -> CommandResult<ConversionResult> {
    tauri::async_runtime::spawn_blocking(move || converters::convert(&app, job))
        .await
        .map_err(|error| error.to_string())?
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn cancel_conversion(job_id: String) -> CommandResult<bool> {
    Ok(converters::cancel_conversion(&job_id))
}

#[tauri::command]
fn reveal_file(file_path: String) -> CommandResult<bool> {
    let path = PathBuf::from(file_path);
    if !path.exists() {
        return Err("Chemin introuvable.".to_string());
    }
    let path = path.canonicalize().unwrap_or(path);
    #[cfg(target_os = "windows")]
    {
        if path.is_dir() {
            Command::new("explorer.exe")
                .arg(&path)
                .spawn()
                .map_err(|error| error.to_string())?;
        } else {
            Command::new("explorer.exe")
                .arg("/select,")
                .arg(&path)
                .spawn()
                .map_err(|error| error.to_string())?;
        }
    }
    #[cfg(target_os = "macos")]
    {
        if path.is_dir() {
            Command::new("open")
                .arg(path)
                .spawn()
                .map_err(|error| error.to_string())?;
        } else {
            Command::new("open")
                .arg("-R")
                .arg(path)
                .spawn()
                .map_err(|error| error.to_string())?;
        }
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let target = if path.is_dir() {
            path
        } else {
            path.parent()
                .ok_or_else(|| "Dossier parent introuvable.".to_string())?
                .to_path_buf()
        };
        Command::new("xdg-open")
            .arg(target)
            .spawn()
            .map_err(|error| error.to_string())?;
    }
    Ok(true)
}

#[tauri::command]
fn open_external_url(url: String) -> CommandResult<bool> {
    let trimmed = url.trim();
    if !is_allowed_external_url(trimmed) {
        return Err("Lien externe non autorisé.".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        Command::new("rundll32.exe")
            .arg("url.dll,FileProtocolHandler")
            .arg(trimmed)
            .spawn()
            .map_err(|error| error.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(trimmed)
            .spawn()
            .map_err(|error| error.to_string())?;
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        Command::new("xdg-open")
            .arg(trimmed)
            .spawn()
            .map_err(|error| error.to_string())?;
    }

    Ok(true)
}

fn is_allowed_external_url(url: &str) -> bool {
    url == "https://github.com/Amix29/Multi-Converter/"
        || url == "https://github.com/Amix29/Multi-Converter"
        || url.starts_with("https://github.com/Amix29/Multi-Converter/issues/new?")
}

#[tauri::command]
fn export_to_downloads(
    file_paths: Vec<String>,
    output_dir: Option<String>,
) -> CommandResult<ExportResult> {
    let destination = dirs::download_dir()
        .ok_or_else(|| "Dossier Téléchargements introuvable.".to_string())?
        .join("Conversion");
    copy_files_to_folder(&file_paths, &destination, output_dir.as_deref())
}

#[tauri::command]
fn export_to_folder(
    file_paths: Vec<String>,
    destination_dir: String,
    output_dir: Option<String>,
) -> CommandResult<ExportResult> {
    if destination_dir.trim().is_empty() {
        return Err("Dossier de destination vide.".to_string());
    }
    copy_files_to_folder(
        &file_paths,
        &PathBuf::from(destination_dir),
        output_dir.as_deref(),
    )
}

fn copy_files_to_folder(
    file_paths: &[String],
    destination_dir: &Path,
    output_dir: Option<&str>,
) -> CommandResult<ExportResult> {
    let destination_created = !destination_dir.exists();
    ensure_destination_folder(destination_dir)?;
    let mut exported = Vec::new();
    let source_root = output_dir
        .filter(|value| !value.trim().is_empty())
        .map(PathBuf::from);

    for path in file_paths.iter().filter(|item| !item.trim().is_empty()) {
        let requested_source = PathBuf::from(path);
        let source = resolve_export_source(&requested_source, source_root.as_deref())?;
        ensure_exportable_conversion_file(&source)?;
        let file_name = source
            .file_name()
            .and_then(OsStr::to_str)
            .unwrap_or("conversion");
        let output_path = available_export_path(destination_dir, file_name);
        copy_export_file(&source, &output_path).map_err(|error| {
            if !source.exists() {
                "Impossible d'exporter ce fichier. Il n'est plus disponible. Relancez la conversion."
                    .to_string()
            } else {
                format!(
                    "Impossible de copier \"{}\" vers \"{}\" : {}",
                    source.display(),
                    output_path.display(),
                    error
                )
            }
        })?;
        exported.push(output_path.to_string_lossy().to_string());
    }

    Ok(ExportResult {
        destination_dir: destination_dir.to_string_lossy().to_string(),
        files: exported,
        destination_created,
    })
}

fn ensure_destination_folder(destination_dir: &Path) -> CommandResult<()> {
    fs::create_dir_all(destination_dir).map_err(|error| {
        runtime_log::write(
            "export",
            &format!(
                "create_dir_all failed for {}: {}",
                destination_dir.display(),
                error
            ),
        );
        format!(
            "Impossible de préparer le dossier choisi \"{}\" : {}",
            destination_dir.display(),
            error
        )
    })
}

fn copy_export_file(source: &Path, output_path: &Path) -> std::io::Result<u64> {
    fs::copy(source, output_path).inspect_err(|error| {
        runtime_log::write(
            "export",
            &format!(
                "copy failed from {} to {}: {}",
                source.display(),
                output_path.display(),
                error
            ),
        );
    })
}

fn resolve_export_source(
    requested_source: &Path,
    output_dir: Option<&Path>,
) -> CommandResult<PathBuf> {
    if requested_source.exists() {
        return Ok(requested_source.to_path_buf());
    }

    let Some(output_dir) = output_dir else {
        return Ok(requested_source.to_path_buf());
    };
    if !output_dir.exists() || !is_managed_temp_output_folder(output_dir) {
        return Ok(requested_source.to_path_buf());
    }

    let Some(file_name) = requested_source.file_name() else {
        return Ok(requested_source.to_path_buf());
    };
    let matches = find_matching_output_files(output_dir, file_name)?;
    match matches.as_slice() {
        [single] => Ok(single.clone()),
        [] => Ok(requested_source.to_path_buf()),
        _ => Err(format!(
            "Plusieurs fichiers temporaires nommés \"{}\" existent. Relancez la conversion avant d'exporter.",
            file_name.to_string_lossy()
        )),
    }
}

fn find_matching_output_files(root: &Path, file_name: &OsStr) -> CommandResult<Vec<PathBuf>> {
    let mut matches = Vec::new();
    for entry in fs::read_dir(root).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let path = entry.path();
        if path.is_dir() {
            for child in fs::read_dir(&path).map_err(|error| error.to_string())? {
                let child = child.map_err(|error| error.to_string())?.path();
                if child.is_file() && child.file_name().is_some_and(|name| name == file_name) {
                    matches.push(child);
                }
            }
        } else if path.is_file() && path.file_name().is_some_and(|name| name == file_name) {
            matches.push(path);
        }
    }
    Ok(matches)
}

fn is_managed_temp_output_folder(path: &Path) -> bool {
    let Some(name) = path.file_name().and_then(OsStr::to_str) else {
        return false;
    };
    if !name.starts_with("multi-converter-") {
        return false;
    }
    let Ok(temp_root) = env::temp_dir().canonicalize() else {
        return false;
    };
    let Some(parent) = path.parent() else {
        return false;
    };
    parent.canonicalize().is_ok_and(|value| value == temp_root)
}

fn ensure_exportable_conversion_file(path: &Path) -> CommandResult<()> {
    if path.as_os_str().is_empty() {
        return Err("Chemin de sortie vide.".to_string());
    }
    if !path.exists() {
        return Err(
            "Impossible d'exporter ce fichier. Il n'est plus disponible. Relancez la conversion."
                .to_string(),
        );
    }
    if !path.is_file() {
        return Err(
            "Seuls les fichiers produits par Multi-Converter peuvent être exportés.".to_string(),
        );
    }
    let canonical = path.canonicalize().map_err(|error| error.to_string())?;
    if managed_temp_output_root_for_file(&canonical).is_none() {
        return Err(
            "Export refusé : le fichier ne provient pas du dossier temporaire géré par Multi-Converter."
                .to_string(),
        );
    }
    Ok(())
}

fn managed_temp_output_root_for_file(path: &Path) -> Option<PathBuf> {
    let temp_root = env::temp_dir().canonicalize().ok()?;
    for ancestor in path.ancestors().skip(1) {
        let name = ancestor.file_name().and_then(OsStr::to_str)?;
        if !name.starts_with("multi-converter-") {
            continue;
        }
        let parent = ancestor.parent()?.canonicalize().ok()?;
        if parent == temp_root {
            return Some(ancestor.to_path_buf());
        }
    }
    None
}

fn available_export_path(destination_dir: &Path, file_name: &str) -> PathBuf {
    let extension = Path::new(file_name)
        .extension()
        .and_then(OsStr::to_str)
        .unwrap_or_default();
    let base = Path::new(file_name)
        .file_stem()
        .and_then(OsStr::to_str)
        .unwrap_or(file_name);
    let mut candidate = destination_dir.join(file_name);
    let mut index = 1;
    while candidate.exists() {
        candidate = if extension.is_empty() {
            destination_dir.join(format!("{base}-{index}"))
        } else {
            destination_dir.join(format!("{base}-{index}.{extension}"))
        };
        index += 1;
    }
    candidate
}

fn cleanup_stale_temp_output_folders() {
    let Ok(entries) = fs::read_dir(env::temp_dir()) else {
        return;
    };
    let cutoff = std::time::SystemTime::now()
        .checked_sub(std::time::Duration::from_secs(24 * 60 * 60))
        .unwrap_or(std::time::SystemTime::UNIX_EPOCH);
    for entry in entries.flatten() {
        let path = entry.path();
        if !is_managed_temp_output_folder(&path) {
            continue;
        }
        let modified = entry
            .metadata()
            .and_then(|metadata| metadata.modified())
            .unwrap_or(std::time::SystemTime::UNIX_EPOCH);
        if modified <= cutoff
            && let Err(error) = fs::remove_dir_all(&path)
        {
            runtime_log::write(
                "cleanup",
                &format!("temp cleanup failed for {}: {}", path.display(), error),
            );
        }
    }
}

fn should_show_welcome_for_install() -> bool {
    #[cfg(debug_assertions)]
    {
        true
    }
    #[cfg(not(debug_assertions))]
    {
        let install_stamp = current_install_stamp();
        let Ok(marker) = welcome_marker_path() else {
            return true;
        };
        let seen_stamp = fs::read_to_string(marker)
            .ok()
            .and_then(|value| value.trim().parse::<u64>().ok())
            .unwrap_or(0);
        seen_stamp < install_stamp
    }
}

fn welcome_marker_path() -> CommandResult<PathBuf> {
    dirs::data_local_dir()
        .map(|path| path.join("Multi-Converter").join("welcome-install.marker"))
        .ok_or_else(|| "Dossier local de l'application introuvable.".to_string())
}

fn current_install_stamp() -> u64 {
    env::current_exe()
        .ok()
        .and_then(|path| fs::metadata(path).ok())
        .and_then(|metadata| metadata.modified().ok())
        .and_then(|modified| {
            modified
                .duration_since(std::time::SystemTime::UNIX_EPOCH)
                .ok()
        })
        .map(|duration| duration.as_secs())
        .unwrap_or(1)
}

pub fn run() {
    runtime_log::install_panic_hook();
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|_| {
            runtime_log::write("startup", "Multi-Converter starting");
            cleanup_stale_temp_output_folders();
            if let Err(error) = engine_distribution::cleanup_stale_installing_dirs() {
                runtime_log::write("cleanup", &format!("engine cleanup failed: {error}"));
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            welcome_state,
            mark_welcome_seen,
            pick_file_paths,
            describe_paths,
            pick_output_folder,
            create_temp_output_folder,
            cleanup_temp_output_folder,
            bootstrap_dependencies,
            engine_statuses,
            start_conversion,
            cancel_conversion,
            reveal_file,
            open_external_url,
            export_to_downloads,
            export_to_folder,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Multi-Converter");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cleanup_only_accepts_managed_temp_folder_names() {
        let managed = env::temp_dir().join("multi-converter-test-cleanup");
        let unmanaged = env::temp_dir().join("other-tool-test-cleanup");

        assert!(is_managed_temp_output_folder(&managed));
        assert!(!is_managed_temp_output_folder(&unmanaged));
        assert!(!is_managed_temp_output_folder(Path::new(
            "multi-converter-relative"
        )));
    }

    #[test]
    fn cleanup_temp_output_folder_removes_only_managed_temp_folders() {
        let unique = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let managed = env::temp_dir().join(format!("multi-converter-test-cleanup-{unique}"));
        let unmanaged = env::temp_dir().join(format!("other-tool-test-cleanup-{unique}"));
        fs::create_dir_all(&managed).unwrap();
        fs::create_dir_all(&unmanaged).unwrap();
        fs::write(managed.join("result.txt"), "temporary output").unwrap();
        fs::write(unmanaged.join("keep.txt"), "user output").unwrap();

        assert!(cleanup_temp_output_folder(managed.to_string_lossy().to_string()).unwrap());
        assert!(!managed.exists());
        assert!(!cleanup_temp_output_folder(unmanaged.to_string_lossy().to_string()).unwrap());
        assert!(unmanaged.exists());

        fs::remove_dir_all(unmanaged).unwrap();
    }

    #[test]
    fn export_path_suffixes_existing_files() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("file.txt"), "one").unwrap();
        fs::write(dir.path().join("file-1.txt"), "two").unwrap();

        assert_eq!(
            available_export_path(dir.path(), "file.txt"),
            dir.path().join("file-2.txt")
        );
    }

    #[test]
    fn dropped_folders_expand_to_contained_files() {
        let dir = tempfile::tempdir().unwrap();
        let nested = dir.path().join("nested");
        fs::create_dir_all(&nested).unwrap();
        let root_file = dir.path().join("root.txt");
        let nested_file = nested.join("child.png");
        fs::write(&root_file, "root").unwrap();
        fs::write(&nested_file, "child").unwrap();

        let mut files = expand_file_paths(&[dir.path().to_string_lossy().to_string()])
            .unwrap()
            .files;
        let mut expected = vec![root_file, nested_file];
        files.sort();
        expected.sort();

        assert_eq!(files, expected);
    }

    #[test]
    fn dropped_folder_import_is_bounded() {
        let dir = tempfile::tempdir().unwrap();
        for index in 0..(MAX_FOLDER_IMPORT_FILES + 10) {
            fs::write(dir.path().join(format!("file-{index}.txt")), "x").unwrap();
        }

        let expanded = expand_file_paths(&[dir.path().to_string_lossy().to_string()]).unwrap();

        assert_eq!(expanded.files.len(), MAX_FOLDER_IMPORT_FILES);
        assert!(expanded.partial_import);
    }

    #[test]
    fn export_to_custom_folder_copies_managed_outputs() {
        let unique = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let managed = env::temp_dir().join(format!("multi-converter-export-copy-{unique}"));
        let nested = managed.join("job-1");
        let destination = tempfile::tempdir().unwrap();
        fs::create_dir_all(&nested).unwrap();
        let output = nested.join("result.txt");
        fs::write(&output, "temporary output").unwrap();

        let result = copy_files_to_folder(
            &[output.to_string_lossy().to_string()],
            destination.path(),
            None,
        )
        .unwrap();

        let exported = destination.path().join("result.txt");
        assert_eq!(result.files, vec![exported.to_string_lossy().to_string()]);
        assert_eq!(fs::read_to_string(exported).unwrap(), "temporary output");

        fs::remove_dir_all(managed).unwrap();
    }

    #[test]
    fn export_destination_error_names_destination_problem() {
        let unique = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let managed = env::temp_dir().join(format!("multi-converter-export-dest-{unique}"));
        let nested = managed.join("job-1");
        let destination_parent = tempfile::tempdir().unwrap();
        let destination_file = destination_parent.path().join("not-a-folder");
        fs::create_dir_all(&nested).unwrap();
        let output = nested.join("result.txt");
        fs::write(&output, "temporary output").unwrap();
        fs::write(&destination_file, "already a file").unwrap();

        let error = copy_files_to_folder(
            &[output.to_string_lossy().to_string()],
            &destination_file,
            None,
        )
        .unwrap_err();

        assert!(error.starts_with("Impossible de préparer le dossier choisi"));

        fs::remove_dir_all(managed).unwrap();
    }

    #[test]
    fn export_uses_current_output_dir_when_requested_source_is_stale() {
        let unique = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let managed = env::temp_dir().join(format!("multi-converter-export-fallback-{unique}"));
        let nested = managed.join("job-1");
        let stale = env::temp_dir()
            .join(format!("multi-converter-stale-{unique}"))
            .join("old-job")
            .join("result.txt");
        let destination = tempfile::tempdir().unwrap();
        fs::create_dir_all(&nested).unwrap();
        fs::write(nested.join("result.txt"), "fresh output").unwrap();

        let result = copy_files_to_folder(
            &[stale.to_string_lossy().to_string()],
            destination.path(),
            Some(managed.to_string_lossy().as_ref()),
        )
        .unwrap();

        assert_eq!(result.files.len(), 1);
        assert_eq!(
            fs::read_to_string(destination.path().join("result.txt")).unwrap(),
            "fresh output"
        );

        fs::remove_dir_all(managed).unwrap();
    }

    #[test]
    fn export_fallback_rejects_ambiguous_duplicate_names() {
        let unique = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let managed = env::temp_dir().join(format!("multi-converter-export-ambiguous-{unique}"));
        let stale = env::temp_dir()
            .join(format!("multi-converter-stale-{unique}"))
            .join("old-job")
            .join("same.txt");
        let destination = tempfile::tempdir().unwrap();
        fs::create_dir_all(managed.join("job-1")).unwrap();
        fs::create_dir_all(managed.join("job-2")).unwrap();
        fs::write(managed.join("job-1").join("same.txt"), "one").unwrap();
        fs::write(managed.join("job-2").join("same.txt"), "two").unwrap();

        let error = copy_files_to_folder(
            &[stale.to_string_lossy().to_string()],
            destination.path(),
            Some(managed.to_string_lossy().as_ref()),
        )
        .unwrap_err();

        assert!(error.starts_with("Plusieurs fichiers temporaires nommés"));

        fs::remove_dir_all(managed).unwrap();
    }

    #[test]
    fn exports_only_accept_files_from_managed_temp_root() {
        let unique = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let managed = env::temp_dir().join(format!("multi-converter-export-{unique}"));
        let nested = managed.join("job-1");
        fs::create_dir_all(&nested).unwrap();
        let output = nested.join("result.txt");
        fs::write(&output, "temporary output").unwrap();

        assert!(ensure_exportable_conversion_file(&output).is_ok());

        fs::remove_dir_all(managed).unwrap();
    }

    #[test]
    fn exports_reject_directories_and_unmanaged_files() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("outside.txt");
        fs::write(&file, "user file").unwrap();

        assert!(ensure_exportable_conversion_file(dir.path()).is_err());
        assert!(ensure_exportable_conversion_file(&file).is_err());
        assert!(ensure_exportable_conversion_file(Path::new("")).is_err());
    }

    #[test]
    fn external_url_allowlist_rejects_google_translate_pages() {
        assert!(is_allowed_external_url(
            "https://github.com/Amix29/Multi-Converter/issues/new?title=Bug"
        ));
        assert!(!is_allowed_external_url(
            "https://translate.googleapis.com/translate_a/single"
        ));
        assert!(!is_allowed_external_url("https://translate.google.com/"));
        assert!(!is_allowed_external_url("https://www.google.com/"));
    }

    #[test]
    fn missing_export_source_returns_human_message() {
        let unique = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let missing = env::temp_dir()
            .join(format!("multi-converter-export-{unique}"))
            .join("job-1")
            .join("missing.mp3");

        let error = ensure_exportable_conversion_file(&missing).unwrap_err();

        assert_eq!(
            error,
            "Impossible d'exporter ce fichier. Il n'est plus disponible. Relancez la conversion."
        );
    }
}
