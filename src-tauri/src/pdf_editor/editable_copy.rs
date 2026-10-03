use super::contracts::{
    CreateEditableCopyRequest, InspectObjectsRequest, PdfEditableCopyResultV1, PdfEditorSessionV1,
    WrapperEditableCopyResultV1, WrapperInspectionV1,
};
use super::process::run_pdfium_request;
use super::session::{PdfEditorState, PdfSession};
use super::{path_to_string, secret_as_str, validate_inspection};
use std::path::PathBuf;
use tauri::{AppHandle, State};

const SCHEMA_VERSION: u8 = 1;

#[tauri::command]
pub(crate) async fn pdf_editor_create_editable_copy(
    app: AppHandle,
    state: State<'_, PdfEditorState>,
    session_id: String,
    source_sha256: String,
    destination_path: Option<String>,
) -> Result<Option<PdfEditableCopyResultV1>, String> {
    let state = state.inner().clone();
    let session = state.access(&session_id, &source_sha256)?;
    if session.signatures.is_empty() && session.permissions.doc_mdp_level.is_none() {
        return Err(
            "PDF_EDITOR_UNSIGNED_COPY_NOT_SIGNED:Le PDF ne contient aucune signature ou restriction DocMDP."
                .into(),
        );
    }
    let destination_path = match destination_path.filter(|value| !value.trim().is_empty()) {
        Some(path) => path,
        None => {
            let stem = session
                .source_path
                .file_stem()
                .and_then(|value| value.to_str())
                .unwrap_or("document");
            let selected = rfd::AsyncFileDialog::new()
                .set_title("Créer une copie modifiable non signée")
                .set_file_name(format!("{stem}-copie-modifiable.pdf"))
                .add_filter("Document PDF", &["pdf"])
                .save_file()
                .await;
            let Some(selected) = selected else {
                return Ok(None);
            };
            path_to_string(selected.path())?
        }
    };

    let result = tauri::async_runtime::spawn_blocking(
        move || -> Result<PdfEditableCopyResultV1, String> {
            let source = path_to_string(&session.source_path)?;
            let password = secret_as_str(session.password.as_ref())?;
            let wrapper_result: WrapperEditableCopyResultV1 = run_pdfium_request(
                &app,
                "--create-editable-copy",
                &CreateEditableCopyRequest {
                    schema_version: SCHEMA_VERSION,
                    source_path: &source,
                    destination_path: &destination_path,
                    source_sha256: &session.source_sha256,
                    password,
                },
            )?;
            validate_wrapper_result(&session, &wrapper_result)?;

            let actual_destination = PathBuf::from(&wrapper_result.destination_path)
                .canonicalize()
                .map_err(|error| format!("PDF_EDITOR_UNSIGNED_COPY_PATH:{error}"))?;
            let expected_destination = PathBuf::from(&destination_path)
                .canonicalize()
                .map_err(|error| format!("PDF_EDITOR_UNSIGNED_COPY_PATH:{error}"))?;
            if actual_destination != expected_destination {
                return Err(
                    "PDF_EDITOR_UNSIGNED_COPY_PATH:PDFium a écrit vers une autre destination."
                        .into(),
                );
            }

            let destination_value = path_to_string(&actual_destination)?;
            let inspection: WrapperInspectionV1 = run_pdfium_request(
                &app,
                "--inspect-objects",
                &InspectObjectsRequest {
                    schema_version: SCHEMA_VERSION,
                    source_path: &destination_value,
                    source_sha256: None,
                    password: None,
                    page_start: 1,
                    page_count: 1,
                },
            )?;
            validate_inspection(&inspection)?;
            if !inspection.signatures.is_empty()
                || inspection.permissions.doc_mdp_level.is_some()
            {
                return Err("PDF_EDITOR_UNSIGNED_COPY_INVALID:La copie contient encore une signature ou une restriction DocMDP.".into());
            }
            let source_name = actual_destination
                .file_name()
                .and_then(|value| value.to_str())
                .ok_or_else(|| "PDF_EDITOR_SOURCE_NAME:Nom de PDF invalide.".to_string())?
                .to_string();
            let rebased_session = PdfEditorSessionV1 {
                schema_version: SCHEMA_VERSION,
                session_id: session_id.clone(),
                source_sha256: inspection.source_sha256.clone(),
                source_name,
                page_count: inspection.page_count,
                content_kind: inspection.content_kind.clone(),
                permissions: inspection.permissions.clone(),
                signatures: inspection.signatures.clone(),
                active_content_policy: inspection.active_content_policy.clone(),
            };
            state.rebase(
                &session_id,
                &session.source_sha256,
                PdfSession {
                    source_path: actual_destination,
                    source_sha256: inspection.source_sha256,
                    password: None,
                    permissions: inspection.permissions,
                    signatures: inspection.signatures,
                    page_count: inspection.page_count,
                    content_kind: inspection.content_kind,
                    managed_temp_dir: None,
                },
            )?;
            Ok(PdfEditableCopyResultV1 {
                schema_version: SCHEMA_VERSION,
                source_sha256: wrapper_result.source_sha256,
                destination_path: destination_value,
                removed_signature_structures: wrapper_result.removed_signature_structures,
                rebased_session,
            })
        },
    )
    .await
    .map_err(|error| format!("PDF_EDITOR_TASK:{error}"))??;
    Ok(Some(result))
}

fn validate_wrapper_result(
    session: &super::session::SessionAccess,
    result: &WrapperEditableCopyResultV1,
) -> Result<(), String> {
    if result.schema_version != SCHEMA_VERSION
        || !session.hash_matches(&result.source_sha256)
        || result.removed_signature_structures == 0
    {
        return Err("PDF_EDITOR_UNSIGNED_COPY_INVALID:Résultat de copie incohérent.".into());
    }
    Ok(())
}
