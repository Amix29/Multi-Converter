use super::CommandResult;
use crate::converters::{ImportOriginKind, ImportOriginV1};
use std::{
    collections::HashSet,
    fs,
    path::{Component, Path, PathBuf},
};

const MAX_IMPORT_FILES: usize = 2000;
const MAX_IMPORT_ROOTS: usize = 4096;
const MAX_IMPORT_PATH_BYTES: usize = 32_768;
const MAX_FOLDER_IMPORT_DIRECTORIES: usize = 4096;
const MAX_FOLDER_IMPORT_ENTRIES: usize = 20_000;
const MAX_FOLDER_IMPORT_DEPTH: usize = 64;

pub(super) struct ExpandedPaths {
    pub(super) files: Vec<ExpandedFile>,
    #[cfg_attr(not(test), allow(dead_code))]
    pub(super) partial_import: bool,
}

pub(super) struct ExpandedFile {
    pub(super) path: PathBuf,
    pub(super) import_origin: ImportOriginV1,
    pub(super) partial_import: bool,
}

pub(super) fn expand_file_paths(paths: &[String]) -> CommandResult<ExpandedPaths> {
    if paths.len() > MAX_IMPORT_ROOTS || paths.iter().any(|path| path.len() > MAX_IMPORT_PATH_BYTES)
    {
        return Err("Trop de chemins d’import ou chemin trop long.".to_string());
    }
    let mut files = Vec::new();
    let mut visited_directories = HashSet::new();
    let mut entries_seen = 0usize;
    let mut partial_import = false;

    for raw_path in paths.iter().filter(|item| !item.trim().is_empty()) {
        if files.len() >= MAX_IMPORT_FILES {
            partial_import = true;
            break;
        }
        let path = Path::new(raw_path);
        let metadata = fs::symlink_metadata(path).map_err(|error| error.to_string())?;
        let root_id = uuid::Uuid::new_v4().to_string();
        let root_name = safe_import_component(
            path.file_name()
                .and_then(|name| name.to_str())
                .unwrap_or(""),
            if metadata.is_dir() {
                "dossier"
            } else {
                "fichier"
            },
        );
        let mut root_files = Vec::new();
        let mut root_partial = false;

        if metadata.file_type().is_symlink() || is_windows_reparse_point(&metadata) {
            partial_import = true;
            continue;
        }
        if metadata.is_file() {
            root_files.push(ExpandedFile {
                path: path.to_path_buf(),
                import_origin: ImportOriginV1 {
                    kind: ImportOriginKind::File,
                    root_id,
                    root_name: root_name.clone(),
                    relative_path: root_name,
                },
                partial_import: false,
            });
        } else if metadata.is_dir() {
            let canonical = path.canonicalize().map_err(|error| error.to_string())?;
            if visited_directories.len() >= MAX_FOLDER_IMPORT_DIRECTORIES
                || !visited_directories.insert(canonical)
            {
                partial_import = true;
                continue;
            }
            collect_folder_files(
                path,
                path,
                &root_id,
                &root_name,
                &mut root_files,
                &mut visited_directories,
                &mut root_partial,
                0,
                &mut entries_seen,
                MAX_IMPORT_FILES - files.len(),
            )?;
        }

        root_files.sort_by(|left, right| left.path.cmp(&right.path));
        if root_partial {
            for file in &mut root_files {
                file.partial_import = true;
            }
        }
        partial_import |= root_partial;
        files.extend(root_files);
    }

    let mut unique_paths = HashSet::new();
    files.retain(|file| unique_paths.insert(file.path.clone()));
    if partial_import
        && !files.iter().any(|file| file.partial_import)
        && let Some(first) = files.first_mut()
    {
        // A later root can be skipped after an earlier root consumes the global
        // file budget. Keep the aggregate truncation observable through the
        // existing per-description warning contract.
        first.partial_import = true;
    }
    Ok(ExpandedPaths {
        files,
        partial_import,
    })
}

#[allow(clippy::too_many_arguments)]
fn collect_folder_files(
    root: &Path,
    directory: &Path,
    root_id: &str,
    root_name: &str,
    files: &mut Vec<ExpandedFile>,
    visited: &mut HashSet<PathBuf>,
    partial: &mut bool,
    depth: usize,
    entries_seen: &mut usize,
    maximum_files: usize,
) -> CommandResult<()> {
    if files.len() >= maximum_files || depth > MAX_FOLDER_IMPORT_DEPTH {
        *partial = true;
        return Ok(());
    }
    let entries = match fs::read_dir(directory) {
        Ok(entries) => entries,
        Err(_) => {
            *partial = true;
            return Ok(());
        }
    };
    let mut children = Vec::new();
    for entry in entries {
        if *entries_seen >= MAX_FOLDER_IMPORT_ENTRIES {
            *partial = true;
            break;
        }
        *entries_seen += 1;
        match entry {
            Ok(entry) => children.push(entry.path()),
            Err(_) => *partial = true,
        }
    }
    children.sort();

    for child in children {
        if files.len() >= maximum_files {
            *partial = true;
            break;
        }
        let metadata = match fs::symlink_metadata(&child) {
            Ok(metadata) => metadata,
            Err(_) => {
                *partial = true;
                continue;
            }
        };
        if metadata.file_type().is_symlink() || is_windows_reparse_point(&metadata) {
            *partial = true;
            continue;
        }
        if metadata.is_file() {
            let relative_path = normalized_relative_path(root, &child)?;
            files.push(ExpandedFile {
                path: child,
                import_origin: ImportOriginV1 {
                    kind: ImportOriginKind::Folder,
                    root_id: root_id.to_string(),
                    root_name: root_name.to_string(),
                    relative_path,
                },
                partial_import: false,
            });
            continue;
        }
        if metadata.is_dir() {
            let canonical = match child.canonicalize() {
                Ok(canonical) => canonical,
                Err(_) => {
                    *partial = true;
                    continue;
                }
            };
            if visited.len() >= MAX_FOLDER_IMPORT_DIRECTORIES || !visited.insert(canonical) {
                *partial = true;
                continue;
            }
            collect_folder_files(
                root,
                &child,
                root_id,
                root_name,
                files,
                visited,
                partial,
                depth + 1,
                entries_seen,
                maximum_files,
            )?;
        }
    }
    Ok(())
}

fn normalized_relative_path(root: &Path, path: &Path) -> CommandResult<String> {
    let relative = path
        .strip_prefix(root)
        .map_err(|_| "Chemin importé en dehors du dossier racine.".to_string())?;
    let mut components = Vec::new();
    for component in relative.components() {
        let Component::Normal(value) = component else {
            return Err("Chemin relatif d'import non valide.".to_string());
        };
        components.push(safe_import_component(
            value.to_str().unwrap_or(""),
            "element",
        ));
    }
    if components.is_empty() {
        return Err("Chemin relatif d'import vide.".to_string());
    }
    Ok(components.join("/"))
}

fn safe_import_component(value: &str, fallback: &str) -> String {
    let mut safe: String = value
        .chars()
        .map(|character| {
            if character.is_control() || "<>:\"/\\|?*".contains(character) {
                '_'
            } else {
                character
            }
        })
        .collect();
    safe = safe.trim_matches([' ', '.']).to_string();
    if safe.chars().count() > 240 {
        safe = safe.chars().take(240).collect();
    }
    let stem = safe.split('.').next().unwrap_or("").to_ascii_uppercase();
    if is_windows_reserved_name(&stem) {
        safe.insert(0, '_');
    }
    if safe.is_empty() {
        fallback.to_string()
    } else {
        safe
    }
}

fn is_windows_reserved_name(value: &str) -> bool {
    matches!(value, "CON" | "PRN" | "AUX" | "NUL")
        || value
            .strip_prefix("COM")
            .or_else(|| value.strip_prefix("LPT"))
            .is_some_and(|suffix| {
                matches!(suffix, "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9")
            })
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

#[cfg(test)]
mod tests;
