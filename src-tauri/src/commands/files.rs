use super::CommandResult;
use crate::converters::{self, FileDescription};
use std::{
    collections::HashSet,
    fs,
    path::{Path, PathBuf},
};
use tauri::AppHandle;

const MAX_FOLDER_IMPORT_FILES: usize = 2000;
const MAX_FOLDER_IMPORT_DIRECTORIES: usize = 4096;
const MAX_FOLDER_IMPORT_ENTRIES: usize = 20_000;
const MAX_FOLDER_IMPORT_DEPTH: usize = 64;

#[tauri::command]
pub(crate) async fn describe_paths(
    app: AppHandle,
    paths: Vec<String>,
) -> CommandResult<Vec<FileDescription>> {
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
pub(crate) async fn pick_file_paths() -> CommandResult<Vec<String>> {
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
pub(crate) async fn pick_output_folder() -> CommandResult<Option<String>> {
    Ok(rfd::AsyncFileDialog::new()
        .set_title("Choisir le dossier de sortie")
        .pick_folder()
        .await
        .map(|handle| handle.path().to_string_lossy().to_string()))
}

fn expand_file_paths(paths: &[String]) -> CommandResult<ExpandedPaths> {
    let mut files = Vec::new();
    let mut visited = HashSet::new();
    let mut entries_seen = 0usize;
    let mut partial_import = false;
    for path in paths.iter().filter(|item| !item.trim().is_empty()) {
        collect_files_from_path(
            Path::new(path),
            &mut files,
            &mut visited,
            &mut partial_import,
            true,
            0,
            &mut entries_seen,
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
    depth: usize,
    entries_seen: &mut usize,
) -> CommandResult<()> {
    if files.len() >= MAX_FOLDER_IMPORT_FILES {
        *partial_import = true;
        return Ok(());
    }
    if depth > MAX_FOLDER_IMPORT_DEPTH {
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
    if visited.len() >= MAX_FOLDER_IMPORT_DIRECTORIES {
        *partial_import = true;
        return Ok(());
    }
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
    let mut children = Vec::new();
    for entry in entries {
        if *entries_seen >= MAX_FOLDER_IMPORT_ENTRIES {
            *partial_import = true;
            break;
        }
        *entries_seen += 1;
        match entry {
            Ok(entry) => children.push(entry.path()),
            Err(_) => *partial_import = true,
        }
    }
    children.sort();
    for child in children {
        if files.len() >= MAX_FOLDER_IMPORT_FILES {
            *partial_import = true;
            break;
        }
        collect_files_from_path(
            &child,
            files,
            visited,
            partial_import,
            false,
            depth + 1,
            entries_seen,
        )?;
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
#[cfg(test)]
mod tests {
    use super::*;

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
    fn dropped_folder_depth_is_bounded() {
        let dir = tempfile::tempdir().unwrap();
        let mut nested = dir.path().to_path_buf();
        for _ in 0..(MAX_FOLDER_IMPORT_DEPTH + 2) {
            nested = nested.join("d");
            fs::create_dir(&nested).unwrap();
        }
        fs::write(nested.join("too-deep.txt"), "x").unwrap();

        let expanded = expand_file_paths(&[dir.path().to_string_lossy().to_string()]).unwrap();

        assert!(expanded.files.is_empty());
        assert!(expanded.partial_import);
    }
}
