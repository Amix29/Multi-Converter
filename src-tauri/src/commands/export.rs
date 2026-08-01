use super::{CommandResult, is_managed_temp_output_folder};
use crate::runtime_log;
use std::{
    env,
    ffi::OsStr,
    fs::{self, File, OpenOptions},
    io,
    path::{Path, PathBuf},
};

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ExportResult {
    destination_dir: String,
    files: Vec<String>,
    destination_created: bool,
}
#[tauri::command]
pub(crate) fn export_to_downloads(
    file_paths: Vec<String>,
    output_dir: Option<String>,
) -> CommandResult<ExportResult> {
    let destination = dirs::download_dir()
        .ok_or_else(|| "Dossier Téléchargements introuvable.".to_string())?
        .join("Conversion");
    copy_files_to_folder(&file_paths, &destination, output_dir.as_deref())
}

#[tauri::command]
pub(crate) fn export_to_folder(
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
        let canonical_source = ensure_exportable_conversion_file(&source)?;
        let file_name = source
            .file_name()
            .and_then(OsStr::to_str)
            .unwrap_or("conversion");
        let output_path = copy_export_file(&canonical_source, destination_dir, file_name).map_err(
            |failure| {
            if !canonical_source.exists() {
                "Impossible d'exporter ce fichier. Il n'est plus disponible. Relancez la conversion."
                    .to_string()
            } else {
                format!(
                    "Impossible de copier \"{}\" vers \"{}\" : {}",
                    source.display(),
                    failure.output_path.display(),
                    failure.error
                )
            }
        },
        )?;
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
                runtime_log::path(destination_dir),
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

#[derive(Debug)]
struct ExportCopyError {
    output_path: PathBuf,
    error: io::Error,
}

fn copy_export_file(
    source: &Path,
    destination_dir: &Path,
    file_name: &str,
) -> Result<PathBuf, ExportCopyError> {
    let first_output_path = export_path_candidate(destination_dir, file_name, 0);
    let mut source_file = File::open(source).map_err(|error| ExportCopyError {
        output_path: first_output_path.clone(),
        error,
    })?;
    let source_permissions = source_file
        .metadata()
        .map_err(|error| ExportCopyError {
            output_path: first_output_path,
            error,
        })?
        .permissions();
    let mut index = 0usize;

    loop {
        let output_path = export_path_candidate(destination_dir, file_name, index);
        let mut output_file = match OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&output_path)
        {
            Ok(file) => file,
            Err(error)
                if error.kind() == io::ErrorKind::AlreadyExists
                    || fs::symlink_metadata(&output_path).is_ok() =>
            {
                index = index.checked_add(1).ok_or_else(|| ExportCopyError {
                    output_path: output_path.clone(),
                    error: io::Error::new(
                        io::ErrorKind::AlreadyExists,
                        "Aucun nom d'export disponible.",
                    ),
                })?;
                continue;
            }
            Err(error) => {
                log_export_copy_error(source, &output_path, &error);
                return Err(ExportCopyError { output_path, error });
            }
        };

        let copy_result = io::copy(&mut source_file, &mut output_file)
            .and_then(|_| output_file.set_permissions(source_permissions.clone()));
        if let Err(error) = copy_result {
            drop(output_file);
            let _ = fs::remove_file(&output_path);
            log_export_copy_error(source, &output_path, &error);
            return Err(ExportCopyError { output_path, error });
        }
        return Ok(output_path);
    }
}

fn log_export_copy_error(source: &Path, output_path: &Path, error: &io::Error) {
    runtime_log::write(
        "export",
        &format!(
            "copy failed from {} to {}: {}",
            runtime_log::path(source),
            runtime_log::path(output_path),
            error
        ),
    );
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

fn ensure_exportable_conversion_file(path: &Path) -> CommandResult<PathBuf> {
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
    let managed_root = managed_temp_output_root_for_file(path).ok_or_else(|| {
        "Export refusé : le fichier ne provient pas du dossier temporaire géré par Multi-Converter."
            .to_string()
    })?;
    if path_contains_link_or_reparse_point(path, &managed_root)? {
        return Err(
            "Export refusé : les liens et points de réanalyse ne sont pas acceptés dans les sorties temporaires."
                .to_string(),
        );
    }
    let canonical = path.canonicalize().map_err(|error| error.to_string())?;
    if managed_temp_output_root_for_file(&canonical).is_none() {
        return Err(
            "Export refusé : le fichier ne provient pas du dossier temporaire géré par Multi-Converter."
                .to_string(),
        );
    }
    Ok(canonical)
}

fn path_contains_link_or_reparse_point(path: &Path, managed_root: &Path) -> CommandResult<bool> {
    if !path.starts_with(managed_root) {
        return Err("Chemin temporaire incohérent.".to_string());
    }
    for component in path.ancestors() {
        let metadata = fs::symlink_metadata(component).map_err(|error| error.to_string())?;
        if metadata.file_type().is_symlink() || metadata_is_windows_reparse_point(&metadata) {
            return Ok(true);
        }
        if component == managed_root {
            return Ok(false);
        }
    }
    Err("Racine temporaire introuvable dans le chemin de sortie.".to_string())
}

#[cfg(target_os = "windows")]
fn metadata_is_windows_reparse_point(metadata: &fs::Metadata) -> bool {
    use std::os::windows::fs::MetadataExt;
    const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x0400;
    metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0
}

#[cfg(not(target_os = "windows"))]
fn metadata_is_windows_reparse_point(_metadata: &fs::Metadata) -> bool {
    false
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

fn export_path_candidate(destination_dir: &Path, file_name: &str, index: usize) -> PathBuf {
    if index == 0 {
        return destination_dir.join(file_name);
    }
    let extension = Path::new(file_name)
        .extension()
        .and_then(OsStr::to_str)
        .unwrap_or_default();
    let base = Path::new(file_name)
        .file_stem()
        .and_then(OsStr::to_str)
        .unwrap_or(file_name);
    if extension.is_empty() {
        destination_dir.join(format!("{base}-{index}"))
    } else {
        destination_dir.join(format!("{base}-{index}.{extension}"))
    }
}

#[cfg(test)]
mod tests;
