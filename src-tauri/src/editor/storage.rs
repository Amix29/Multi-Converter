use super::document::{
    CommandResult, EditorAssetRef, EditorDocument, EditorDocumentSummary, MAX_DRAFT_BYTES,
    RECENT_DOCUMENT_LIMIT, modified_stamp, validate_document, validate_id,
};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

pub(super) fn editor_root() -> CommandResult<PathBuf> {
    dirs::data_local_dir()
        .map(|path| path.join("Multi-Converter").join("editor"))
        .ok_or_else(|| {
            "EDITOR_STORAGE_UNAVAILABLE:Dossier local de l'application introuvable.".to_string()
        })
}

pub(super) fn document_dir(id: &str) -> CommandResult<PathBuf> {
    Ok(editor_root()?.join("documents").join(validate_id(id)?))
}

pub(super) fn draft_path(id: &str) -> CommandResult<PathBuf> {
    Ok(document_dir(id)?.join("draft.json"))
}

pub(super) fn assets_dir(id: &str) -> CommandResult<PathBuf> {
    Ok(document_dir(id)?.join("assets"))
}

fn legacy_draft_path(id: &str) -> CommandResult<PathBuf> {
    Ok(editor_root()?
        .join("drafts")
        .join(format!("{}.json", validate_id(id)?)))
}

fn legacy_assets_dir(id: &str) -> CommandResult<PathBuf> {
    Ok(editor_root()?.join("assets").join(validate_id(id)?))
}

pub(super) fn existing_asset_path(document_id: &str, asset_id: &str) -> CommandResult<PathBuf> {
    let asset_id = validate_id(asset_id)?;
    let current = assets_dir(document_id)?.join(&asset_id);
    if current.is_file() {
        return Ok(current);
    }
    let legacy = legacy_assets_dir(document_id)?.join(asset_id);
    if legacy.is_file() {
        return Ok(legacy);
    }
    Err("EDITOR_ASSET_MISSING:Ressource introuvable.".to_string())
}

pub(super) fn save_draft_inner(mut document: EditorDocument) -> CommandResult<EditorDocument> {
    validate_document(&document, true)?;
    document.updated_at = super::document::now_stamp();
    let encoded = serde_json::to_vec_pretty(&document).map_err(|error| error.to_string())?;
    if encoded.len() > MAX_DRAFT_BYTES {
        return Err("EDITOR_DRAFT_LIMIT:Le brouillon est trop volumineux.".to_string());
    }
    let path = draft_path(&document.id)?;
    write_bytes_atomically(&encoded, &path)?;

    let legacy = legacy_draft_path(&document.id)?;
    if legacy.exists() {
        let _ = fs::remove_file(legacy);
    }
    Ok(document)
}

pub(super) fn commit_import(
    document: EditorDocument,
    assets: &[(EditorAssetRef, Vec<u8>)],
) -> CommandResult<EditorDocument> {
    validate_document(&document, true)?;
    let final_dir = document_dir(&document.id)?;
    if final_dir.exists() {
        return Err("EDITOR_IMPORT_CONFLICT:Le brouillon importé existe déjà.".to_string());
    }
    let documents_dir = final_dir
        .parent()
        .ok_or_else(|| "EDITOR_STORAGE_INVALID:Dossier de documents invalide.".to_string())?;
    fs::create_dir_all(documents_dir).map_err(|error| error.to_string())?;
    let staged = documents_dir.join(format!(".{}.{}.tmp", document.id, uuid::Uuid::new_v4()));
    let staged_assets = staged.join("assets");
    fs::create_dir_all(&staged_assets).map_err(|error| error.to_string())?;

    let result = (|| -> CommandResult<()> {
        for (asset, bytes) in assets {
            if bytes.len() as u64 != asset.size {
                return Err("EDITOR_ASSET_INVALID:Taille d’image incohérente.".to_string());
            }
            fs::write(staged_assets.join(&asset.id), bytes).map_err(|error| error.to_string())?;
        }
        let encoded = serde_json::to_vec_pretty(&document).map_err(|error| error.to_string())?;
        if encoded.len() > MAX_DRAFT_BYTES {
            return Err("EDITOR_DRAFT_LIMIT:Le brouillon est trop volumineux.".to_string());
        }
        fs::write(staged.join("draft.json"), encoded).map_err(|error| error.to_string())?;
        fs::rename(&staged, &final_dir).map_err(|error| error.to_string())?;
        Ok(())
    })();
    if result.is_err() {
        let _ = fs::remove_dir_all(&staged);
    }
    result.map(|_| document)
}

pub(super) fn load_document(id: &str) -> CommandResult<EditorDocument> {
    let id = validate_id(id)?;
    let current = draft_path(&id)?;
    if current.is_file() {
        return read_document(&current);
    }
    let legacy = legacy_draft_path(&id)?;
    read_document(&legacy)
}

pub(super) fn read_document(path: &Path) -> CommandResult<EditorDocument> {
    let metadata = fs::metadata(path)
        .map_err(|_| "EDITOR_DRAFT_MISSING:Le brouillon est introuvable.".to_string())?;
    if metadata.len() > MAX_DRAFT_BYTES as u64 {
        return Err("EDITOR_DRAFT_LIMIT:Le brouillon est trop volumineux.".to_string());
    }
    let document: EditorDocument =
        serde_json::from_slice(&fs::read(path).map_err(|error| error.to_string())?)
            .map_err(|error| format!("EDITOR_DRAFT_INVALID:{error}"))?;
    // Legacy development drafts can still contain data URLs. They are returned so the
    // frontend can migrate them through editor_store_asset before the next save.
    validate_document(&document, false)?;
    Ok(document)
}

pub(super) fn list_recent_documents() -> CommandResult<Vec<EditorDocumentSummary>> {
    let root = editor_root()?;
    let mut by_id = HashMap::<String, EditorDocument>::new();
    let documents_dir = root.join("documents");
    if documents_dir.is_dir() {
        for entry in fs::read_dir(&documents_dir).map_err(|error| error.to_string())? {
            let Ok(entry) = entry else { continue };
            if !entry.path().is_dir() || entry.file_name().to_string_lossy().starts_with('.') {
                continue;
            }
            if let Ok(document) = read_document(&entry.path().join("draft.json")) {
                by_id.insert(document.id.clone(), document);
            }
        }
    }
    let legacy_dir = root.join("drafts");
    if legacy_dir.is_dir() {
        for entry in fs::read_dir(&legacy_dir).map_err(|error| error.to_string())? {
            let Ok(entry) = entry else { continue };
            if entry.path().extension().and_then(|value| value.to_str()) != Some("json") {
                continue;
            }
            if let Ok(document) = read_document(&entry.path()) {
                by_id.entry(document.id.clone()).or_insert(document);
            }
        }
    }

    let mut documents = by_id.into_values().collect::<Vec<_>>();
    documents.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    documents.truncate(RECENT_DOCUMENT_LIMIT);
    Ok(documents
        .into_iter()
        .map(|document| EditorDocumentSummary {
            id: document.id,
            title: document.title,
            format: document
                .source
                .as_ref()
                .map(|source| source.format.clone())
                .unwrap_or_else(|| "draft".to_string()),
            source_path: document.source.map(|source| source.path),
            updated_at: document.updated_at,
            recoverable: true,
        })
        .collect())
}

pub(super) fn delete_document(id: &str) -> CommandResult<bool> {
    let id = validate_id(id)?;
    let current = document_dir(&id)?;
    if current.exists() {
        fs::remove_dir_all(current).map_err(|error| error.to_string())?;
    }
    let legacy_draft = legacy_draft_path(&id)?;
    if legacy_draft.exists() {
        fs::remove_file(legacy_draft).map_err(|error| error.to_string())?;
    }
    let legacy_assets = legacy_assets_dir(&id)?;
    if legacy_assets.exists() {
        fs::remove_dir_all(legacy_assets).map_err(|error| error.to_string())?;
    }
    Ok(true)
}

pub(super) fn rename_document(id: &str, title: &str) -> CommandResult<EditorDocument> {
    let mut document = load_document(&validate_id(id)?)?;
    document.title = title.trim().to_string();
    save_draft_inner(document)
}

pub(super) fn duplicate_document(id: &str, title: &str) -> CommandResult<EditorDocument> {
    let mut duplicate = load_document(&validate_id(id)?)?;
    let assets = duplicate
        .assets
        .iter()
        .map(|asset| {
            let bytes = fs::read(existing_asset_path(&duplicate.id, &asset.id)?)
                .map_err(|error| error.to_string())?;
            Ok((asset.clone(), bytes))
        })
        .collect::<CommandResult<Vec<_>>>()?;
    let now = super::document::now_stamp();
    duplicate.id = uuid::Uuid::new_v4().to_string();
    duplicate.title = title.trim().to_string();
    duplicate.source = None;
    duplicate.created_at = now.clone();
    duplicate.updated_at = now;
    commit_import(duplicate, &assets)
}

pub(super) fn ensure_source_unchanged(
    document: &EditorDocument,
    destination: &Path,
) -> CommandResult<()> {
    let Some(source) = document.source.as_ref() else {
        return Ok(());
    };
    if Path::new(&source.path) != destination || !destination.exists() {
        return Ok(());
    }
    let metadata = fs::metadata(destination).map_err(|error| error.to_string())?;
    if metadata.len() != source.size || modified_stamp(&metadata) != source.modified_at {
        return Err("EDITOR_SOURCE_CONFLICT:Le fichier a été modifié en dehors de Multi-Converter. Utilisez Enregistrer sous ou rechargez-le.".to_string());
    }
    Ok(())
}

pub(super) fn replace_file_safely(source: &Path, destination: &Path) -> CommandResult<()> {
    let bytes = fs::read(source).map_err(|error| format!("source-read:{error}"))?;
    if bytes.is_empty() {
        return Err("EDITOR_OUTPUT_EMPTY:La sortie générée est vide.".to_string());
    }
    write_bytes_atomically(&bytes, destination)
}

pub(super) fn write_bytes_atomically(bytes: &[u8], destination: &Path) -> CommandResult<()> {
    let parent = destination
        .parent()
        .ok_or_else(|| "EDITOR_STORAGE_INVALID:Dossier de destination invalide.".to_string())?;
    fs::create_dir_all(parent).map_err(|error| format!("parent-create:{error}"))?;
    // OneDrive-backed known folders can reject sibling files ending in
    // `.tmp` with ERROR_FILE_NOT_FOUND. Keep the destination extension while
    // retaining a unique, non-hidden work name.
    let staged = sibling_work_path(parent, destination, "staged");
    fs::write(&staged, bytes).map_err(|error| format!("stage-write:{error}"))?;
    let backup = sibling_work_path(parent, destination, "backup");
    let had_destination = destination.exists();
    if had_destination {
        fs::rename(destination, &backup).map_err(|error| format!("backup-rename:{error}"))?;
    }
    if let Err(error) = fs::rename(&staged, destination) {
        if had_destination {
            let _ = fs::rename(&backup, destination);
        }
        let _ = fs::remove_file(&staged);
        return Err(format!("destination-rename:{error}"));
    }
    if had_destination {
        let _ = fs::remove_file(backup);
    }
    Ok(())
}

fn sibling_work_path(parent: &Path, destination: &Path, role: &str) -> PathBuf {
    let extension = destination
        .extension()
        .and_then(|value| value.to_str())
        .filter(|value| !value.is_empty())
        .unwrap_or("work");
    parent.join(format!(
        "multi-converter-{role}-{}.{}",
        uuid::Uuid::new_v4(),
        extension
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn atomic_replace_keeps_previous_file_when_source_is_empty() {
        let directory = tempfile::tempdir().unwrap();
        let source = directory.path().join("source");
        let destination = directory.path().join("destination");
        fs::write(&source, []).unwrap();
        fs::write(&destination, b"original").unwrap();
        assert!(replace_file_safely(&source, &destination).is_err());
        assert_eq!(fs::read(destination).unwrap(), b"original");
    }

    #[test]
    fn duplicate_metadata_detaches_the_original_source() {
        let mut document = super::super::document::new_document("Rapport");
        document.source = Some(super::super::document::EditorSource {
            path: "C:\\Documents\\rapport.docx".to_string(),
            format: "docx".to_string(),
            size: 42,
            modified_at: "1".to_string(),
        });
        let original_id = document.id.clone();
        let now = super::super::document::now_stamp();
        document.id = uuid::Uuid::new_v4().to_string();
        document.title = "Rapport - copie".to_string();
        document.source = None;
        document.created_at = now.clone();
        document.updated_at = now;
        assert_ne!(document.id, original_id);
        assert!(document.source.is_none());
        assert_eq!(document.title, "Rapport - copie");
    }

    #[test]
    fn atomic_work_files_keep_the_destination_extension() {
        let parent = Path::new("C:\\Documents");
        let staged = sibling_work_path(parent, &parent.join("Rapport.docx"), "staged");
        assert_eq!(
            staged.extension().and_then(|value| value.to_str()),
            Some("docx")
        );
        assert!(
            staged
                .file_name()
                .and_then(|value| value.to_str())
                .is_some_and(|value| value.starts_with("multi-converter-staged-"))
        );
    }
}
