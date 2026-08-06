use super::super::is_managed_temp_output_folder;
use super::{CommandResult, paths::is_link_or_reparse_point};
use std::{
    env,
    ffi::OsStr,
    fs,
    path::{Path, PathBuf},
};

pub(super) fn resolve_export_source(
    requested_source: &Path,
    output_dir: Option<&Path>,
) -> CommandResult<PathBuf> {
    let canonical_output_dir = output_dir
        .filter(|path| path.exists() && is_managed_temp_output_folder(path))
        .and_then(|path| path.canonicalize().ok());
    if requested_source.exists() {
        let requested_in_current_batch = canonical_output_dir.as_ref().is_some_and(|root| {
            requested_source
                .canonicalize()
                .is_ok_and(|path| path.starts_with(root))
        });
        if canonical_output_dir.is_none() || requested_in_current_batch {
            return Ok(requested_source.to_path_buf());
        }
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
        let metadata = fs::symlink_metadata(&path).map_err(|error| error.to_string())?;
        if is_link_or_reparse_point(&metadata) {
            continue;
        }
        if metadata.is_dir() {
            for child in fs::read_dir(&path).map_err(|error| error.to_string())? {
                let child = child.map_err(|error| error.to_string())?.path();
                let child_metadata =
                    fs::symlink_metadata(&child).map_err(|error| error.to_string())?;
                if child_metadata.is_file()
                    && !is_link_or_reparse_point(&child_metadata)
                    && child.file_name().is_some_and(|name| name == file_name)
                {
                    matches.push(child);
                }
            }
        } else if metadata.is_file() && path.file_name().is_some_and(|name| name == file_name) {
            matches.push(path);
        }
    }
    Ok(matches)
}

#[cfg(test)]
pub(super) fn ensure_exportable_conversion_file(path: &Path) -> CommandResult<PathBuf> {
    ensure_exportable_conversion_file_in_root(path, None)
}

pub(super) fn ensure_exportable_conversion_file_in_root(
    path: &Path,
    expected_output_root: Option<&Path>,
) -> CommandResult<PathBuf> {
    if path.as_os_str().is_empty() {
        return Err("Chemin de sortie vide.".to_string());
    }
    if !path.exists() {
        return Err(
            "Impossible d'exporter ce fichier. Il n'est plus disponible. Relancez la conversion."
                .to_string(),
        );
    }
    let metadata = fs::symlink_metadata(path).map_err(|error| error.to_string())?;
    if !metadata.is_file() || is_link_or_reparse_point(&metadata) {
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
    if let Some(expected_root) = expected_output_root {
        if !expected_root.exists() || !is_managed_temp_output_folder(expected_root) {
            return Err(
                "Export refusé : le dossier temporaire du lot n'est pas valide.".to_string(),
            );
        }
        let root_metadata =
            fs::symlink_metadata(expected_root).map_err(|error| error.to_string())?;
        if !root_metadata.is_dir() || is_link_or_reparse_point(&root_metadata) {
            return Err(
                "Export refusé : le dossier temporaire du lot n'est pas valide.".to_string(),
            );
        }
        let canonical_root = expected_root
            .canonicalize()
            .map_err(|error| error.to_string())?;
        if !canonical.starts_with(&canonical_root) {
            return Err(
                "Export refusé : le fichier n'appartient pas au lot de conversion courant."
                    .to_string(),
            );
        }
    }
    Ok(canonical)
}

fn path_contains_link_or_reparse_point(path: &Path, managed_root: &Path) -> CommandResult<bool> {
    if !path.starts_with(managed_root) {
        return Err("Chemin temporaire incohérent.".to_string());
    }
    for component in path.ancestors() {
        let metadata = fs::symlink_metadata(component).map_err(|error| error.to_string())?;
        if is_link_or_reparse_point(&metadata) {
            return Ok(true);
        }
        if component == managed_root {
            return Ok(false);
        }
    }
    Err("Racine temporaire introuvable dans le chemin de sortie.".to_string())
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

#[cfg(all(test, not(target_os = "windows")))]
pub(super) fn test_path_contains_link_or_reparse_point(
    path: &Path,
    managed_root: &Path,
) -> CommandResult<bool> {
    path_contains_link_or_reparse_point(path, managed_root)
}
