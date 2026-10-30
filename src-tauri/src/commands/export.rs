use super::CommandResult;
use std::{
    collections::HashMap,
    ffi::OsStr,
    fs,
    path::{Path, PathBuf},
};

mod copy;
mod paths;
mod report;
mod source;
pub(crate) use report::export_batch_report;

pub(super) fn valid_recovery_origin(origin: &crate::converters::ImportOriginV1) -> bool {
    use crate::converters::ImportOriginKind;
    let folder = origin.kind == ImportOriginKind::Folder;
    let value = if folder {
        format!("{}/{}", origin.root_name, origin.relative_path)
    } else {
        origin.relative_path.clone()
    };
    paths::ParsedRelativePath::parse(&value, folder.then_some(origin.root_id.as_str()))
        .is_ok_and(|path| path.components().first() == Some(&origin.root_name))
}

use copy::{copy_export_file, copy_export_file_exact};
use paths::{
    ParsedRelativePath, ensure_safe_subdirectories, prepare_destination, reserve_unique_root,
};
use source::resolve_export_source;

const MAX_EXPORT_FILES: usize = 2_000;

#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ExportResult {
    destination_dir: String,
    files: Vec<String>,
    destination_created: bool,
}

#[derive(Clone, Debug, serde::Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ExportEntryV1 {
    pub(crate) output_path: String,
    pub(crate) relative_path: String,
    #[serde(default)]
    pub(crate) root_id: Option<String>,
}

#[tauri::command]
pub(crate) fn export_to_downloads(
    file_paths: Vec<String>,
    output_dir: Option<String>,
    entries: Option<Vec<ExportEntryV1>>,
) -> CommandResult<ExportResult> {
    let destination = dirs::download_dir()
        .ok_or_else(|| "Dossier Téléchargements introuvable.".to_string())?
        .join("Conversion");
    copy_files_to_folder(
        &file_paths,
        &destination,
        output_dir.as_deref(),
        entries.as_deref(),
    )
}

#[tauri::command]
pub(crate) fn export_to_folder(
    file_paths: Vec<String>,
    destination_dir: String,
    output_dir: Option<String>,
    entries: Option<Vec<ExportEntryV1>>,
) -> CommandResult<ExportResult> {
    if destination_dir.trim().is_empty() {
        return Err("Dossier de destination vide.".to_string());
    }
    copy_files_to_folder(
        &file_paths,
        &PathBuf::from(destination_dir),
        output_dir.as_deref(),
        entries.as_deref(),
    )
}

fn copy_files_to_folder(
    file_paths: &[String],
    destination_dir: &Path,
    output_dir: Option<&str>,
    structured_entries: Option<&[ExportEntryV1]>,
) -> CommandResult<ExportResult> {
    let has_structured_entries = structured_entries.is_some_and(|entries| !entries.is_empty());
    if has_structured_entries && output_dir.is_none_or(|value| value.trim().is_empty()) {
        return Err(
            "Le dossier temporaire du lot est requis pour un export hiérarchique.".to_string(),
        );
    }
    let entries = normalized_export_entries(file_paths, structured_entries)?;
    let prepared = prepare_export_entries(&entries, output_dir)?;
    reject_duplicate_folder_entries(&prepared)?;

    let destination_created = !destination_dir.exists();
    let canonical_destination = prepare_destination(destination_dir)?;
    let mut transaction = ExportTransaction::new(
        destination_dir.to_path_buf(),
        canonical_destination,
        destination_created,
    );
    let canonical_destination = transaction.canonical_destination().to_path_buf();
    let mut roots: HashMap<String, RootPlacement> = HashMap::new();
    let mut exported = Vec::with_capacity(prepared.len());

    for entry in prepared {
        let output_path = if let Some(root_id) = entry.root_id.as_deref() {
            let root_name = entry.relative.components()[0].clone();
            let root = match roots.get(root_id) {
                Some(placement) if placement.requested_name == root_name => placement.path.clone(),
                Some(_) => {
                    return Err(
                        "Un même dossier importé possède plusieurs noms de racine.".to_string()
                    );
                }
                None => {
                    let path = reserve_unique_root(destination_dir, &root_name)?;
                    transaction.record_directory(path.clone());
                    roots.insert(
                        root_id.to_string(),
                        RootPlacement {
                            requested_name: root_name,
                            path: path.clone(),
                        },
                    );
                    path
                }
            };
            let inner = &entry.relative.components()[1..];
            let parent = ensure_safe_subdirectories(
                &root,
                &inner[..inner.len() - 1],
                &canonical_destination,
                &mut transaction,
            )?;
            let output = parent.join(inner.last().expect("validated folder entry"));
            copy_export_file_exact(&entry.source, &output)?;
            transaction.record_file(output.clone());
            output
        } else {
            let file_name = &entry.relative.components()[0];
            let output = copy_export_file(&entry.source, destination_dir, file_name)?;
            transaction.record_file(output.clone());
            output
        };
        exported.push(output_path.to_string_lossy().to_string());
    }

    transaction.commit();
    Ok(ExportResult {
        destination_dir: destination_dir.to_string_lossy().to_string(),
        files: exported,
        destination_created,
    })
}

fn normalized_export_entries(
    file_paths: &[String],
    structured_entries: Option<&[ExportEntryV1]>,
) -> CommandResult<Vec<ExportEntryV1>> {
    if let Some(entries) = structured_entries.filter(|entries| !entries.is_empty()) {
        if entries.len() > MAX_EXPORT_FILES || file_paths.len() > MAX_EXPORT_FILES {
            return Err(format!(
                "Un export ne peut pas contenir plus de {MAX_EXPORT_FILES} fichiers."
            ));
        }
        if entries.len() != file_paths.len() {
            return Err(
                "Le plan d'export ne correspond pas exactement aux résultats convertis."
                    .to_string(),
            );
        }
        let expected: std::collections::HashSet<&str> = file_paths
            .iter()
            .map(String::as_str)
            .filter(|path| !path.trim().is_empty())
            .collect();
        if expected.len() != file_paths.len() {
            return Err(
                "La liste des résultats d'export contient un chemin vide ou dupliqué.".to_string(),
            );
        }
        let actual: std::collections::HashSet<&str> = entries
            .iter()
            .map(|entry| entry.output_path.as_str())
            .collect();
        if actual.len() != entries.len() || actual != expected {
            return Err(
                "Le plan d'export ne correspond pas exactement aux résultats convertis."
                    .to_string(),
            );
        }
        return Ok(entries.to_vec());
    }
    if file_paths.len() > MAX_EXPORT_FILES {
        return Err(format!(
            "Un export ne peut pas contenir plus de {MAX_EXPORT_FILES} fichiers."
        ));
    }
    file_paths
        .iter()
        .filter(|path| !path.trim().is_empty())
        .map(|output_path| {
            let relative_path = Path::new(output_path)
                .file_name()
                .and_then(OsStr::to_str)
                .ok_or_else(|| "Nom de fichier d'export non valide.".to_string())?
                .to_string();
            Ok(ExportEntryV1 {
                output_path: output_path.clone(),
                relative_path,
                root_id: None,
            })
        })
        .collect()
}

struct PreparedEntry {
    source: PathBuf,
    relative: ParsedRelativePath,
    root_id: Option<String>,
}

fn prepare_export_entries(
    entries: &[ExportEntryV1],
    output_dir: Option<&str>,
) -> CommandResult<Vec<PreparedEntry>> {
    let source_root = output_dir
        .filter(|value| !value.trim().is_empty())
        .map(PathBuf::from);
    entries
        .iter()
        .map(|entry| {
            let relative =
                ParsedRelativePath::parse(&entry.relative_path, entry.root_id.as_deref())?;
            let requested = PathBuf::from(&entry.output_path);
            let source = resolve_export_source(&requested, source_root.as_deref())?;
            let source =
                source::ensure_exportable_conversion_file_in_root(&source, source_root.as_deref())?;
            Ok(PreparedEntry {
                source,
                relative,
                root_id: entry.root_id.clone(),
            })
        })
        .collect()
}

fn reject_duplicate_folder_entries(entries: &[PreparedEntry]) -> CommandResult<()> {
    let mut seen = std::collections::HashSet::new();
    for entry in entries.iter().filter(|entry| entry.root_id.is_some()) {
        let key = (
            entry.root_id.as_deref().unwrap_or_default(),
            entry.relative.normalized(),
        );
        if !seen.insert(key) {
            return Err(
                "Deux résultats ciblent le même chemin dans un dossier importé.".to_string(),
            );
        }
    }
    Ok(())
}

struct RootPlacement {
    requested_name: String,
    path: PathBuf,
}

pub(super) struct ExportTransaction {
    destination: PathBuf,
    canonical_destination: PathBuf,
    files: Vec<PathBuf>,
    directories: Vec<PathBuf>,
    remove_destination: bool,
    committed: bool,
}

impl ExportTransaction {
    fn new(destination: PathBuf, canonical_destination: PathBuf, remove_destination: bool) -> Self {
        Self {
            destination,
            canonical_destination,
            files: Vec::new(),
            directories: Vec::new(),
            remove_destination,
            committed: false,
        }
    }

    pub(super) fn canonical_destination(&self) -> &Path {
        &self.canonical_destination
    }

    pub(super) fn record_file(&mut self, path: PathBuf) {
        self.files.push(path);
    }

    pub(super) fn record_directory(&mut self, path: PathBuf) {
        self.directories.push(path);
    }

    fn commit(&mut self) {
        self.committed = true;
    }
}

impl Drop for ExportTransaction {
    fn drop(&mut self) {
        if self.committed {
            return;
        }
        for file in self.files.iter().rev() {
            let _ = fs::remove_file(file);
        }
        for directory in self.directories.iter().rev() {
            // Remove only directories that are still empty. A concurrent user
            // or process may legitimately have placed another file there.
            let _ = fs::remove_dir(directory);
        }
        if self.remove_destination {
            let _ = fs::remove_dir(&self.destination);
        }
    }
}

#[cfg(test)]
mod tests;
