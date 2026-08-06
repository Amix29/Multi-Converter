mod contracts;
pub(crate) mod digitize;
pub(crate) mod editable_copy;
mod permissions;
mod process;
mod session;

pub(crate) use contracts::{
    PdfEditPatchV1, PdfEditorSessionV1, PdfPageWindowV1, PdfRenderedPageV1, PdfSaveResultV1,
};
pub(crate) use session::PdfEditorState;

use contracts::{
    ApplyPatchesRequest, InspectObjectsRequest, RenderEditorPageRequest, WrapperApplyResultV1,
    WrapperInspectionV1, WrapperRenderedPageV1,
};
use permissions::validate_patch_permissions;
use process::run_pdfium_request;
use session::{PdfSession, SecretBytes, SessionAccess};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, State};

const SCHEMA_VERSION: u8 = 1;
const MAX_RENDER_BYTES: u64 = 64 * 1024 * 1024;
const PNG_MAGIC: &[u8; 8] = b"\x89PNG\r\n\x1a\n";

#[tauri::command]
pub(crate) async fn pdf_editor_open(
    app: AppHandle,
    state: State<'_, PdfEditorState>,
    source_path: String,
    password: Option<String>,
) -> Result<PdfEditorSessionV1, String> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let source = PathBuf::from(source_path);
        let password = SecretBytes::from_password(password)?;
        let source_value = path_to_string(&source)?;
        let password_value = secret_as_str(password.as_ref())?;
        let inspection: WrapperInspectionV1 = run_pdfium_request(
            &app,
            "--inspect-objects",
            &InspectObjectsRequest {
                schema_version: SCHEMA_VERSION,
                source_path: &source_value,
                source_sha256: None,
                password: password_value,
                page_start: 1,
                page_count: 1,
            },
        )?;
        validate_inspection(&inspection)?;
        let canonical = source
            .canonicalize()
            .map_err(|error| format!("PDF_EDITOR_SOURCE_PATH:{error}"))?;
        let source_name = canonical
            .file_name()
            .and_then(|value| value.to_str())
            .ok_or_else(|| "PDF_EDITOR_SOURCE_NAME:Nom de PDF invalide.".to_string())?
            .to_string();
        let session_id = uuid::Uuid::new_v4().to_string();
        state.insert(
            session_id.clone(),
            PdfSession {
                source_path: canonical,
                source_sha256: inspection.source_sha256.clone(),
                password,
                permissions: inspection.permissions.clone(),
                signatures: inspection.signatures.clone(),
                page_count: inspection.page_count,
                content_kind: inspection.content_kind.clone(),
                managed_temp_dir: None,
            },
        )?;
        Ok(PdfEditorSessionV1 {
            schema_version: SCHEMA_VERSION,
            session_id,
            source_sha256: inspection.source_sha256,
            source_name,
            page_count: inspection.page_count,
            content_kind: inspection.content_kind,
            permissions: inspection.permissions,
            signatures: inspection.signatures,
            active_content_policy: inspection.active_content_policy,
        })
    })
    .await
    .map_err(|error| format!("PDF_EDITOR_TASK:{error}"))?
}

#[tauri::command]
pub(crate) async fn pdf_editor_inspect_pages(
    app: AppHandle,
    state: State<'_, PdfEditorState>,
    session_id: String,
    source_sha256: String,
    page_start: usize,
    page_count: usize,
) -> Result<PdfPageWindowV1, String> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let session = state.access(&session_id, &source_sha256)?;
        let inspection = inspect_window(&app, &session, page_start, page_count)?;
        Ok(PdfPageWindowV1 {
            schema_version: SCHEMA_VERSION,
            source_sha256: inspection.source_sha256,
            page_count: inspection.page_count,
            pages: inspection.pages,
        })
    })
    .await
    .map_err(|error| format!("PDF_EDITOR_TASK:{error}"))?
}

#[tauri::command]
pub(crate) async fn pdf_editor_render_page(
    app: AppHandle,
    state: State<'_, PdfEditorState>,
    session_id: String,
    source_sha256: String,
    page_number: usize,
    scale: Option<f32>,
) -> Result<PdfRenderedPageV1, String> {
    let state = state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let session = state.access(&session_id, &source_sha256)?;
        render_page(&app, &session, page_number, scale.unwrap_or(2.0))
    })
    .await
    .map_err(|error| format!("PDF_EDITOR_TASK:{error}"))?
}

#[tauri::command]
pub(crate) async fn pdf_editor_recognize_page(
    app: AppHandle,
    state: State<'_, PdfEditorState>,
    ocr_state: State<'_, crate::ocr::OcrState>,
    session_id: String,
    source_sha256: String,
    page_number: usize,
    job_id: String,
) -> Result<crate::ocr::OcrDocumentResultV1, String> {
    let state = state.inner().clone();
    let ocr_state = ocr_state.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let session = state.access(&session_id, &source_sha256)?;
        let rendered = render_page(&app, &session, page_number, 300.0 / 72.0)?;
        let temporary = tempfile::Builder::new()
            .prefix("multi-converter-pdf-editor-ocr-")
            .tempdir()
            .map_err(|error| format!("PDF_EDITOR_OCR_TEMP:{error}"))?;
        let page_path = temporary.path().join("page.png");
        std::fs::write(&page_path, rendered.bytes)
            .map_err(|error| format!("PDF_EDITOR_OCR_TEMP:{error}"))?;
        let page_path = path_to_string(&page_path)?;
        ocr_state.recognize_image(&app, &page_path, &job_id)
    })
    .await
    .map_err(|error| format!("PDF_EDITOR_TASK:{error}"))?
}

#[tauri::command]
pub(crate) async fn pdf_editor_save_as(
    app: AppHandle,
    state: State<'_, PdfEditorState>,
    session_id: String,
    source_sha256: String,
    patches: Vec<PdfEditPatchV1>,
    destination_path: Option<String>,
) -> Result<Option<PdfSaveResultV1>, String> {
    let state = state.inner().clone();
    let session = state.access(&session_id, &source_sha256)?;
    let destination_path = match destination_path.filter(|value| !value.trim().is_empty()) {
        Some(path) => path,
        None => {
            let stem = session
                .source_path
                .file_stem()
                .and_then(|value| value.to_str())
                .unwrap_or("document");
            let selected = rfd::AsyncFileDialog::new()
                .set_title("Enregistrer une copie du PDF")
                .set_file_name(format!("{stem}-modifie.pdf"))
                .add_filter("Document PDF", &["pdf"])
                .save_file()
                .await;
            let Some(selected) = selected else {
                return Ok(None);
            };
            path_to_string(selected.path())?
        }
    };
    let result =
        tauri::async_runtime::spawn_blocking(move || -> Result<PdfSaveResultV1, String> {
            validate_patch_permissions(&session.permissions, &patches)?;
            let source = path_to_string(&session.source_path)?;
            let password = secret_as_str(session.password.as_ref())?;
            let result: WrapperApplyResultV1 = run_pdfium_request(
                &app,
                "--apply-patches",
                &ApplyPatchesRequest {
                    schema_version: SCHEMA_VERSION,
                    source_path: &source,
                    destination_path: &destination_path,
                    source_sha256: &session.source_sha256,
                    password,
                    patches: &patches,
                },
            )?;
            if result.schema_version != SCHEMA_VERSION
                || !session.hash_matches(&result.source_sha256)
                || result.applied_patches != patches.len()
            {
                return Err("PDF_EDITOR_SAVE_INVALID:Résultat de sauvegarde incohérent.".into());
            }
            let actual_destination = PathBuf::from(&result.destination_path)
                .canonicalize()
                .map_err(|error| format!("PDF_EDITOR_SAVE_PATH:{error}"))?;
            let expected_destination = PathBuf::from(&destination_path)
                .canonicalize()
                .map_err(|error| format!("PDF_EDITOR_SAVE_PATH:{error}"))?;
            if actual_destination != expected_destination {
                return Err(
                    "PDF_EDITOR_SAVE_PATH:PDFium a écrit vers une autre destination.".into(),
                );
            }
            let destination_value = path_to_string(&actual_destination)?;
            let password = secret_as_str(session.password.as_ref())?;
            let inspection: WrapperInspectionV1 = run_pdfium_request(
                &app,
                "--inspect-objects",
                &InspectObjectsRequest {
                    schema_version: SCHEMA_VERSION,
                    source_path: &destination_value,
                    source_sha256: None,
                    password,
                    page_start: 1,
                    page_count: 1,
                },
            )?;
            validate_inspection(&inspection)?;
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
                    password: session.password.clone(),
                    permissions: inspection.permissions,
                    signatures: inspection.signatures,
                    page_count: inspection.page_count,
                    content_kind: inspection.content_kind,
                    managed_temp_dir: None,
                },
            )?;
            Ok(PdfSaveResultV1 {
                schema_version: SCHEMA_VERSION,
                source_sha256: result.source_sha256,
                destination_path: destination_value,
                applied_patches: result.applied_patches,
                had_existing_signatures: !session.signatures.is_empty(),
                signature_validity: "not-cryptographically-checked".into(),
                rebased_session,
            })
        })
        .await
        .map_err(|error| format!("PDF_EDITOR_TASK:{error}"))??;
    Ok(Some(result))
}

#[tauri::command]
pub(crate) fn pdf_editor_close(
    state: State<'_, PdfEditorState>,
    session_id: String,
) -> Result<bool, String> {
    state.close(&session_id)
}

fn inspect_window(
    app: &AppHandle,
    session: &SessionAccess,
    page_start: usize,
    page_count: usize,
) -> Result<WrapperInspectionV1, String> {
    let source = path_to_string(&session.source_path)?;
    let password = secret_as_str(session.password.as_ref())?;
    let inspection: WrapperInspectionV1 = run_pdfium_request(
        app,
        "--inspect-objects",
        &InspectObjectsRequest {
            schema_version: SCHEMA_VERSION,
            source_path: &source,
            source_sha256: Some(&session.source_sha256),
            password,
            page_start,
            page_count,
        },
    )?;
    validate_inspection(&inspection)?;
    if !session.hash_matches(&inspection.source_sha256) {
        return Err("PDF_EDITOR_SOURCE_CHANGED:Le PDF source a changé depuis l’ouverture.".into());
    }
    Ok(inspection)
}

fn render_page(
    app: &AppHandle,
    session: &SessionAccess,
    page_number: usize,
    scale: f32,
) -> Result<PdfRenderedPageV1, String> {
    if !scale.is_finite() || !(0.5..=4.166_666_5).contains(&scale) {
        return Err("PDF_EDITOR_RENDER_SCALE:L’échelle doit rester entre 0,5 et 4,166.".into());
    }
    let dpi = (scale * 72.0).round() as u16;
    let temporary = tempfile::Builder::new()
        .prefix("multi-converter-pdf-editor-")
        .tempdir()
        .map_err(|error| format!("PDF_EDITOR_RENDER_TEMP:{error}"))?;
    let output = temporary.path().join("page.png");
    let source = path_to_string(&session.source_path)?;
    let output_value = path_to_string(&output)?;
    let password = secret_as_str(session.password.as_ref())?;
    let rendered: WrapperRenderedPageV1 = run_pdfium_request(
        app,
        "--render-editor-page",
        &RenderEditorPageRequest {
            schema_version: SCHEMA_VERSION,
            source_path: &source,
            source_sha256: &session.source_sha256,
            output_path: &output_value,
            password,
            page_number,
            dpi,
        },
    )?;
    validate_render_result(session, &output, &rendered)?;
    let metadata =
        std::fs::metadata(&output).map_err(|error| format!("PDF_EDITOR_RENDER_READ:{error}"))?;
    if metadata.len() > MAX_RENDER_BYTES {
        return Err("PDF_EDITOR_RENDER_LIMIT:Le rendu PNG dépasse 64 Mio.".into());
    }
    let bytes =
        std::fs::read(&output).map_err(|error| format!("PDF_EDITOR_RENDER_READ:{error}"))?;
    if !bytes.starts_with(PNG_MAGIC) {
        return Err("PDF_EDITOR_RENDER_TYPE:PDFium n’a pas produit un PNG valide.".into());
    }
    Ok(PdfRenderedPageV1 {
        schema_version: SCHEMA_VERSION,
        source_sha256: rendered.source_sha256,
        page_number,
        mime_type: "image/png".into(),
        bytes,
        width_points: rendered.width_points,
        height_points: rendered.height_points,
    })
}

fn validate_inspection(inspection: &WrapperInspectionV1) -> Result<(), String> {
    if inspection.schema_version != SCHEMA_VERSION
        || inspection.source_sha256.len() != 64
        || inspection.page_count == 0
        || !matches!(
            inspection.content_kind.as_str(),
            "digital" | "mixed" | "scanned"
        )
        || inspection.active_content_policy != "preserve-without-execution"
    {
        return Err("PDF_EDITOR_INSPECTION_INVALID:Inspection PDFium incohérente.".into());
    }
    Ok(())
}

fn validate_render_result(
    session: &SessionAccess,
    expected_output: &Path,
    rendered: &WrapperRenderedPageV1,
) -> Result<(), String> {
    if rendered.schema_version != SCHEMA_VERSION
        || !session.hash_matches(&rendered.source_sha256)
        || !rendered.width_points.is_finite()
        || !rendered.height_points.is_finite()
        || rendered.width_points <= 0.0
        || rendered.height_points <= 0.0
    {
        return Err("PDF_EDITOR_RENDER_INVALID:Résultat PDFium incohérent.".into());
    }
    let actual = PathBuf::from(&rendered.output_path)
        .canonicalize()
        .map_err(|error| format!("PDF_EDITOR_RENDER_PATH:{error}"))?;
    let expected = expected_output
        .canonicalize()
        .map_err(|error| format!("PDF_EDITOR_RENDER_PATH:{error}"))?;
    if actual != expected {
        return Err("PDF_EDITOR_RENDER_PATH:PDFium a écrit hors du dossier temporaire.".into());
    }
    Ok(())
}

fn path_to_string(path: &Path) -> Result<String, String> {
    path.to_str()
        .map(str::to_string)
        .ok_or_else(|| "PDF_EDITOR_PATH_ENCODING:Chemin non UTF-8 non pris en charge.".into())
}

fn secret_as_str(secret: Option<&SecretBytes>) -> Result<Option<&str>, String> {
    secret.map(SecretBytes::as_str).transpose()
}

#[cfg(test)]
mod tests {
    #[test]
    fn render_scale_is_bounded_before_starting_pdfium() {
        assert!(!(0.5..=4.166_666_5).contains(&0.49));
        assert!(!(0.5..=4.166_666_5).contains(&4.2));
        assert!((0.5..=4.166_666_5).contains(&2.0));
    }
}
