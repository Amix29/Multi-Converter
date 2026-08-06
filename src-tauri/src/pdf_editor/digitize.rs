use super::contracts::{
    ApplyPatchesRequest, InspectObjectsRequest, PdfDigitizeResultV1, PdfEditPatchV1,
    PdfEditorSessionV1, WrapperApplyResultV1, WrapperInspectionV1,
};
use super::permissions::validate_patch_permissions;
use super::process::run_pdfium_request;
use super::session::{PdfEditorState, PdfSession};
use super::{path_to_string, secret_as_str, validate_inspection};
use std::collections::BTreeSet;
use std::path::PathBuf;
use tauri::{AppHandle, State};

const SCHEMA_VERSION: u8 = 1;

#[tauri::command]
pub(crate) async fn pdf_editor_digitize(
    app: AppHandle,
    state: State<'_, PdfEditorState>,
    session_id: String,
    source_sha256: String,
    patches: Vec<PdfEditPatchV1>,
    attempted_pages: Vec<usize>,
) -> Result<PdfDigitizeResultV1, String> {
    let state = state.inner().clone();
    let session = state.access(&session_id, &source_sha256)?;
    if session.content_kind != "scanned" {
        return Err(
            "PDF_EDITOR_DIGITIZE_NOT_REQUIRED:Ce PDF contient déjà du texte numérique.".into(),
        );
    }
    validate_digitize_request(&patches, &attempted_pages, session.page_count)?;
    validate_patch_permissions(&session.permissions, &patches)?;

    tauri::async_runtime::spawn_blocking(move || {
        let temporary = tempfile::Builder::new()
            .prefix("multi-converter-pdf-digitized-")
            .tempdir()
            .map_err(|error| format!("PDF_EDITOR_DIGITIZE_TEMP:{error}"))?;
        let managed_temp_dir = temporary.keep();
        let destination = managed_temp_dir.join("document-numerise.pdf");
        let outcome = (|| -> Result<PdfDigitizeResultV1, String> {
            let source = path_to_string(&session.source_path)?;
            let destination_value = path_to_string(&destination)?;
            let password = secret_as_str(session.password.as_ref())?;
            let result: WrapperApplyResultV1 = run_pdfium_request(
                &app,
                "--apply-patches",
                &ApplyPatchesRequest {
                    schema_version: SCHEMA_VERSION,
                    source_path: &source,
                    destination_path: &destination_value,
                    source_sha256: &session.source_sha256,
                    password,
                    patches: &patches,
                },
            )?;
            if result.schema_version != SCHEMA_VERSION
                || !session.hash_matches(&result.source_sha256)
                || result.applied_patches != patches.len()
            {
                return Err("PDF_EDITOR_DIGITIZE_INVALID:Résultat OCR incohérent.".into());
            }

            let actual_destination = PathBuf::from(&result.destination_path)
                .canonicalize()
                .map_err(|error| format!("PDF_EDITOR_DIGITIZE_PATH:{error}"))?;
            if actual_destination
                != destination
                    .canonicalize()
                    .map_err(|error| format!("PDF_EDITOR_DIGITIZE_PATH:{error}"))?
            {
                return Err(
                    "PDF_EDITOR_DIGITIZE_PATH:PDFium a écrit hors de la copie de travail.".into(),
                );
            }
            let actual_value = path_to_string(&actual_destination)?;
            let inspection: WrapperInspectionV1 = run_pdfium_request(
                &app,
                "--inspect-objects",
                &InspectObjectsRequest {
                    schema_version: SCHEMA_VERSION,
                    source_path: &actual_value,
                    source_sha256: None,
                    password,
                    page_start: 1,
                    page_count: 1,
                },
            )?;
            validate_inspection(&inspection)?;
            let rebased_session = PdfEditorSessionV1 {
                schema_version: SCHEMA_VERSION,
                session_id: session_id.clone(),
                source_sha256: inspection.source_sha256.clone(),
                source_name: session
                    .source_path
                    .file_name()
                    .and_then(|value| value.to_str())
                    .unwrap_or("document.pdf")
                    .to_string(),
                page_count: inspection.page_count,
                content_kind: "digitized".into(),
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
                    password: session.password.clone(),
                    permissions: inspection.permissions,
                    signatures: inspection.signatures,
                    page_count: inspection.page_count,
                    content_kind: "digitized".into(),
                    managed_temp_dir: Some(managed_temp_dir.clone()),
                },
            )?;
            Ok(PdfDigitizeResultV1 {
                schema_version: SCHEMA_VERSION,
                source_sha256: result.source_sha256,
                attempted_pages: attempted_pages.len(),
                recognized_pages: recognized_page_count(&patches),
                rebased_session,
            })
        })();
        if outcome.is_err() {
            let _ = std::fs::remove_dir_all(&managed_temp_dir);
        }
        outcome
    })
    .await
    .map_err(|error| format!("PDF_EDITOR_TASK:{error}"))?
}

fn validate_digitize_request(
    patches: &[PdfEditPatchV1],
    attempted_pages: &[usize],
    page_count: usize,
) -> Result<(), String> {
    let attempted = attempted_pages.iter().copied().collect::<BTreeSet<_>>();
    let expected = (1..=page_count).collect::<BTreeSet<_>>();
    if attempted.len() != attempted_pages.len() || attempted != expected {
        return Err(
            "PDF_EDITOR_DIGITIZE_PAGES:Toutes les pages doivent être traitées une fois.".into(),
        );
    }
    if patches.is_empty()
        || patches.iter().any(|patch| {
            patch.operation != "addOcrTextLayer"
                || !attempted.contains(&patch.page_number)
                || patch.ocr_blocks.as_ref().is_none_or(Vec::is_empty)
        })
    {
        return Err("PDF_EDITOR_DIGITIZE_PATCHES:Le lot OCR est invalide ou vide.".into());
    }
    Ok(())
}

fn recognized_page_count(patches: &[PdfEditPatchV1]) -> usize {
    patches
        .iter()
        .map(|patch| patch.page_number)
        .collect::<BTreeSet<_>>()
        .len()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn patch(page_number: usize) -> PdfEditPatchV1 {
        PdfEditPatchV1 {
            schema_version: 1,
            operation: "addOcrTextLayer".into(),
            page_number,
            object_id: Some(format!("page=p{page_number}")),
            text: None,
            matrix: None,
            color: None,
            rotation_degrees: None,
            bounds: None,
            image_path: None,
            annotation_type: None,
            target_page_number: None,
            width_points: None,
            height_points: None,
            ocr_blocks: Some(vec![super::super::contracts::PdfOcrTextBlockV1 {
                text: "Texte reconnu".into(),
                bounds: super::super::contracts::PdfBoundsV1 {
                    x: 1.0,
                    y: 1.0,
                    width: 20.0,
                    height: 10.0,
                },
                font_size_points: Some(10.0),
            }]),
        }
    }

    #[test]
    fn digitization_requires_every_page_and_only_ocr_patches() {
        assert!(validate_digitize_request(&[patch(1)], &[1, 2], 2).is_ok());
        assert!(validate_digitize_request(&[patch(1)], &[1, 1], 1).is_err());
        assert!(validate_digitize_request(&[patch(1)], &[1, 3], 3).is_err());
    }
}
