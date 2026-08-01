mod assets;
mod document;
mod export;
mod import;
mod odt;
mod storage;

use document::{
    CommandResult, EditorAssetData, EditorAssetStoreResult, EditorDocument, EditorDocumentSummary,
    EditorImportResult, EditorWriteRequest, EditorWriteResult, new_document, validate_id,
};
use std::path::PathBuf;
use tauri::AppHandle;

#[tauri::command]
pub fn editor_create_document() -> CommandResult<EditorDocument> {
    storage::save_draft_inner(new_document("Sans titre"))
}

#[tauri::command]
pub fn editor_list_recent_documents() -> CommandResult<Vec<EditorDocumentSummary>> {
    storage::list_recent_documents()
}

#[tauri::command]
pub fn editor_load_document(id: String) -> CommandResult<EditorDocument> {
    storage::load_document(&validate_id(&id)?)
}

#[tauri::command]
pub fn editor_save_draft(document: EditorDocument) -> CommandResult<EditorDocument> {
    storage::save_draft_inner(document)
}

#[tauri::command]
pub fn editor_delete_draft(id: String) -> CommandResult<bool> {
    storage::delete_document(&id)
}

#[tauri::command]
pub fn editor_rename_document(id: String, title: String) -> CommandResult<EditorDocument> {
    storage::rename_document(&id, &title)
}

#[tauri::command]
pub fn editor_duplicate_document(id: String, title: String) -> CommandResult<EditorDocument> {
    storage::duplicate_document(&id, &title)
}

#[tauri::command]
pub async fn editor_import_document(
    app: AppHandle,
    path: Option<String>,
) -> CommandResult<Option<EditorImportResult>> {
    let path = match path {
        Some(path) => PathBuf::from(path),
        None => {
            let Some(handle) = rfd::AsyncFileDialog::new()
                .set_title("Ouvrir un document")
                .add_filter(
                    "Documents éditables",
                    &[
                        "docx", "odt", "rtf", "txt", "md", "markdown", "html", "htm", "pdf",
                    ],
                )
                .pick_file()
                .await
            else {
                return Ok(None);
            };
            handle.path().to_path_buf()
        }
    };
    tauri::async_runtime::spawn_blocking(move || import::import_document_inner(&app, &path))
        .await
        .map_err(|error| error.to_string())?
        .map(Some)
}

#[tauri::command]
pub fn editor_store_asset(
    document_id: String,
    name: String,
    mime_type: String,
    bytes: Vec<u8>,
) -> CommandResult<EditorAssetStoreResult> {
    assets::store_asset(&document_id, &name, &mime_type, bytes)
}

#[tauri::command]
pub async fn editor_import_asset(
    document_id: String,
    path: Option<String>,
) -> CommandResult<Option<EditorAssetStoreResult>> {
    let path = match path {
        Some(path) => PathBuf::from(path),
        None => {
            let Some(handle) = rfd::AsyncFileDialog::new()
                .set_title("Importer une image")
                .add_filter("Images", &["png", "jpg", "jpeg", "webp", "gif"])
                .pick_file()
                .await
            else {
                return Ok(None);
            };
            handle.path().to_path_buf()
        }
    };
    tauri::async_runtime::spawn_blocking(move || {
        let (name, mime_type, bytes) = assets::read_asset_from_path(&path)?;
        assets::store_asset(&document_id, &name, &mime_type, bytes)
    })
    .await
    .map_err(|error| error.to_string())?
    .map(Some)
}

#[tauri::command]
pub fn editor_read_asset(document_id: String, asset_id: String) -> CommandResult<EditorAssetData> {
    assets::read_asset(&document_id, &asset_id)
}

#[tauri::command]
pub fn editor_remove_asset(document_id: String, asset_id: String) -> CommandResult<EditorDocument> {
    assets::remove_asset(&document_id, &asset_id)
}

#[tauri::command]
pub fn editor_prune_assets(document_id: String) -> CommandResult<EditorDocument> {
    assets::prune_assets(&document_id)
}

#[tauri::command]
pub async fn editor_save_document(
    app: AppHandle,
    request: EditorWriteRequest,
) -> CommandResult<EditorWriteResult> {
    let destination = request
        .document
        .source
        .as_ref()
        .map(|source| PathBuf::from(&source.path))
        .ok_or_else(|| {
            "EDITOR_SAVE_AS_REQUIRED:Ce document n'a pas encore de fichier associé. Utilisez Enregistrer sous."
                .to_string()
        })?;
    export::write_document(app, request, destination, true).await
}

#[tauri::command]
pub async fn editor_save_as(
    app: AppHandle,
    request: EditorWriteRequest,
) -> CommandResult<Option<EditorWriteResult>> {
    export::write_document_with_picker(app, request, "Enregistrer le document", true).await
}

#[tauri::command]
pub async fn editor_export_document(
    app: AppHandle,
    request: EditorWriteRequest,
) -> CommandResult<Option<EditorWriteResult>> {
    export::write_document_with_picker(app, request, "Exporter le document", false).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn editor_document_defaults_to_complete_a4_layout() {
        let document = new_document("Essai");
        assert_eq!(document.schema_version, 1);
        assert_eq!(document.page.format, "a4");
        assert_eq!(document.page.numbering, "bottom-center");
        assert!(document.source.is_none());
    }

    #[test]
    fn editor_rejects_path_like_ids() {
        assert!(validate_id("../draft").is_err());
        assert!(validate_id("document.json").is_err());
    }

    #[test]
    fn safe_stem_removes_reserved_path_characters() {
        assert_eq!(
            document::safe_file_stem("Rapport: 2026/07"),
            "Rapport- 2026-07"
        );
    }
}
